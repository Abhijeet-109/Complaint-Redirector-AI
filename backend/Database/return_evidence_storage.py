"""Private local storage for return evidence files."""

import hashlib
from io import BytesIO
from datetime import datetime, timedelta, timezone
import logging
import os
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, text


logger = logging.getLogger(__name__)


MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
MAX_EVIDENCE_FILES = 5
ALLOWED_EVIDENCE = {
    ".jpg": ("image/jpeg",),
    ".jpeg": ("image/jpeg",),
    ".png": ("image/png",),
    ".webp": ("image/webp",),
}


def evidence_root() -> Path:
    configured = os.getenv("RETURN_EVIDENCE_DIR")
    root = Path(configured).expanduser() if configured else Path(__file__).resolve().parents[1] / "private_return_evidence"
    return root.resolve()


def detect_image(data: bytes) -> str | None:
    try:
        with Image.open(BytesIO(data)) as image:
            mime_type = Image.MIME.get(image.format)
            if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
                return None
            image.verify()
            return mime_type
    except (UnidentifiedImageError, OSError, ValueError):
        return None


def save_evidence(data: bytes, filename: str, declared_content_type: str) -> tuple[str, str, str]:
    """Validate and atomically save bytes; return private key, detected type, SHA256."""
    if not data or len(data) > MAX_EVIDENCE_BYTES:
        raise ValueError("Evidence files must be between 1 byte and 5 MB.")
    suffix = Path(filename or "").suffix.lower()
    allowed_types = ALLOWED_EVIDENCE.get(suffix)
    detected = detect_image(data)
    if not allowed_types or detected not in allowed_types or declared_content_type != detected:
        raise ValueError("Upload a valid JPEG, PNG, or WebP image with a matching content type.")

    root = evidence_root()
    directory = root / "returns"
    directory.mkdir(parents=True, exist_ok=True)
    key = f"returns/{uuid4().hex}{suffix}"
    destination = (root / key).resolve()
    if not destination.is_relative_to(root):
        raise ValueError("Invalid evidence storage key.")
    temporary = destination.with_name(f".{uuid4().hex}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return key, detected, hashlib.sha256(data).hexdigest()


def _intake_directory(user_id: int, thread_id: str) -> Path:
    import hashlib
    token = hashlib.sha256(f"{user_id}:{thread_id}".encode("utf-8")).hexdigest()
    directory = (evidence_root() / "intake" / token).resolve()
    if not directory.is_relative_to(evidence_root()):
        raise ValueError("Invalid evidence intake.")
    return directory


def stage_evidence(data: bytes, filename: str, declared_content_type: str,
                   user_id: int, thread_id: str, order_id: int, order_item_id: int,
                   submission_key: str) -> dict:
    """Privately stage a validated image for the authenticated chat intake."""
    key, mime_type, digest = save_evidence(data, filename, declared_content_type)
    directory = _intake_directory(user_id, thread_id)
    try:
        directory.mkdir(parents=True, exist_ok=True)
        import json
        staged_name = f"{uuid4().hex}.json"
        manifest = directory / staged_name
        manifest.write_text(json.dumps({
            "storage_key": key,
            "filename": Path(filename).name[:255] or "evidence",
            "mime_type": mime_type,
            "size_bytes": len(data),
            "sha256": digest,
            "order_id": order_id,
            "order_item_id": order_item_id,
            "user_id": user_id,
            "thread_id": thread_id,
            "submission_key": submission_key,
        }), encoding="utf-8")
        return {"filename": Path(filename).name[:255] or "evidence",
                "content_type": mime_type, "size_bytes": len(data)}
    except Exception:
        delete_evidence(key)
        raise


def list_staged_evidence(user_id: int, thread_id: str) -> list[dict]:
    import json
    directory = _intake_directory(user_id, thread_id)
    if not directory.exists():
        return []
    staged = []
    for manifest in sorted(directory.glob("*.json")):
        try:
            item = json.loads(manifest.read_text(encoding="utf-8"))
            if read_evidence(item.get("storage_key", "")) is not None:
                item["manifest"] = manifest
                staged.append(item)
        except (OSError, ValueError, TypeError):
            continue
    return staged


def clear_staged_evidence(staged: list[dict], committed_storage_keys=()) -> None:
    committed_storage_keys = set(committed_storage_keys)
    for item in staged:
        if item.get("storage_key") not in committed_storage_keys:
            delete_evidence(item.get("storage_key", ""))
        manifest = item.get("manifest")
        if manifest:
            Path(manifest).unlink(missing_ok=True)


def finalize_staged_evidence(staged: list[dict]) -> None:
    """Remove intake manifests after metadata commits, keeping private files."""
    for item in staged:
        manifest = item.get("manifest")
        if manifest:
            Path(manifest).unlink(missing_ok=True)


def read_evidence(key: str) -> Path | None:
    root = evidence_root()
    candidate = (root / key).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        return None
    return candidate


def delete_evidence(key: str) -> None:
    path = read_evidence(key)
    if path is not None:
        path.unlink(missing_ok=True)


def _retention_delta() -> timedelta:
    raw_hours = os.getenv("RETURN_EVIDENCE_RETENTION_HOURS", "168")
    try:
        hours = int(raw_hours)
    except (TypeError, ValueError):
        hours = 168
    return timedelta(hours=max(1, min(hours, 24 * 365)))


def _valid_private_key(key: str) -> bool:
    if not isinstance(key, str) or not key.startswith("returns/"):
        return False
    filename = key.removeprefix("returns/")
    if "/" in filename or "\\" in filename:
        return False
    stem, dot, suffix = filename.rpartition(".")
    return bool(dot and len(stem) == 32 and all(char in "0123456789abcdef" for char in stem)
                and suffix in {"jpg", "jpeg", "png", "webp"})


def cleanup_stale_evidence(session, *, now: datetime | None = None) -> dict[str, int]:
    """Remove expired intake artifacts without deleting committed evidence.

    PostgreSQL advisory locking makes the sweep single-worker; per-conversation
    row locks coordinate expiration with upload, submission, and deletion.
    """
    from backend.Database.models import ChatConversation, ReturnEvidence

    root = evidence_root()
    intake_root = root / "intake"
    returns_root = root / "returns"
    counts = {"manifests": 0, "files": 0, "errors": 0}
    if not root.exists():
        return counts
    now = now or datetime.now(timezone.utc)
    cutoff = now - _retention_delta()
    advisory_locked = False
    try:
        if session.bind is not None and session.bind.dialect.name == "postgresql":
            advisory_locked = bool(session.execute(
                text("SELECT pg_try_advisory_xact_lock(:lock_id)"),
                {"lock_id": 735214096155},
            ).scalar())
            if not advisory_locked:
                session.rollback()
                return counts

        committed_keys = set(session.scalars(select(ReturnEvidence.storage_key)).all())
        protected_keys = set(committed_keys)
        if intake_root.is_dir():
            for manifest in intake_root.glob("*/*.json"):
                try:
                    modified = datetime.fromtimestamp(manifest.stat().st_mtime, timezone.utc)
                    try:
                        import json
                        item = json.loads(manifest.read_text(encoding="utf-8"))
                    except (OSError, ValueError, TypeError):
                        item = None
                    valid = (
                        isinstance(item, dict)
                        and _valid_private_key(item.get("storage_key"))
                        and isinstance(item.get("user_id"), int)
                        and isinstance(item.get("thread_id"), str)
                        and _intake_directory(item["user_id"], item["thread_id"]) == manifest.parent.resolve()
                    )
                    if modified > cutoff:
                        if valid:
                            protected_keys.add(item["storage_key"])
                        continue

                    if valid and item["storage_key"] in committed_keys:
                        manifest.unlink(missing_ok=True)
                        counts["manifests"] += 1
                        continue

                    if valid:
                        conversation_exists = session.scalar(select(ChatConversation.thread_id).where(
                            ChatConversation.thread_id == item["thread_id"],
                            ChatConversation.user_id == item["user_id"],
                        )) is not None
                        locked_thread = session.scalar(select(ChatConversation.thread_id).where(
                            ChatConversation.thread_id == item["thread_id"],
                            ChatConversation.user_id == item["user_id"],
                        ).with_for_update(skip_locked=True))
                        if conversation_exists and locked_thread is None:
                            protected_keys.add(item["storage_key"])
                            continue
                        referenced = session.scalar(select(ReturnEvidence.id).where(
                            ReturnEvidence.storage_key == item["storage_key"]
                        )) is not None
                        if referenced:
                            protected_keys.add(item["storage_key"])
                        else:
                            delete_evidence(item["storage_key"])
                            counts["files"] += 1
                    manifest.unlink(missing_ok=True)
                    counts["manifests"] += 1
                except Exception as exc:
                    counts["errors"] += 1
                    logger.warning("Stale return evidence cleanup item failed (%s)", type(exc).__name__)

        if returns_root.is_dir():
            for path in returns_root.iterdir():
                try:
                    if not path.is_file():
                        continue
                    modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
                    if modified > cutoff:
                        continue
                    if path.name.startswith(".") and path.name.endswith(".tmp"):
                        path.unlink(missing_ok=True)
                        counts["files"] += 1
                        continue
                    key = f"returns/{path.name}"
                    if not _valid_private_key(key) or key in protected_keys:
                        continue
                    if session.scalar(select(ReturnEvidence.id).where(ReturnEvidence.storage_key == key)) is not None:
                        protected_keys.add(key)
                        continue
                    path.unlink(missing_ok=True)
                    counts["files"] += 1
                except Exception as exc:
                    counts["errors"] += 1
                    logger.warning("Orphaned return evidence cleanup failed (%s)", type(exc).__name__)
        session.commit()
        return counts
    except Exception:
        session.rollback()
        raise
