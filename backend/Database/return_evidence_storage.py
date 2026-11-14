"""Validated staging and provider storage for private return evidence."""

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


def save_evidence(data: bytes, filename: str, declared_content_type: str) -> tuple[str, str, str, str, str | None]:
    """Validate and store an image; return key, MIME, digest, provider and file ID."""
    if not data or len(data) > MAX_EVIDENCE_BYTES:
        raise ValueError("Evidence files must be between 1 byte and 5 MB.")
    suffix = Path(filename or "").suffix.lower()
    allowed_types = ALLOWED_EVIDENCE.get(suffix)
    detected = detect_image(data)
    if not allowed_types or detected not in allowed_types or declared_content_type != detected:
        raise ValueError("Upload a valid JPEG, PNG, or WebP image with a matching content type.")

    digest = hashlib.sha256(data).hexdigest()
    private_key = os.getenv("IMAGEKIT_PRIVATE_KEY", "").strip()
    storage_provider = os.getenv("RETURN_EVIDENCE_STORAGE_PROVIDER", "imagekit").strip().lower()
    if private_key and not os.getenv("IMAGEKIT_URL_ENDPOINT", "").strip():
        raise RuntimeError("ImageKit URL endpoint is not configured.")
    if storage_provider == "imagekit":
        if not private_key:
            raise RuntimeError("ImageKit must be configured for return evidence storage.")
        from imagekitio import ImageKit

        upload_name = f"return_{uuid4().hex}{suffix}"
        client = ImageKit(private_key=private_key)
        try:
            result = client.files.upload(
                file=data,
                file_name=upload_name,
                folder="/Flatkart/return-evidence",
                is_private_file=True,
                use_unique_file_name=False,
                overwrite_file=False,
            )
        except Exception as exc:
            logger.warning("ImageKit return evidence upload failed (%s)", type(exc).__name__)
            raise RuntimeError("ImageKit could not store the evidence image.") from exc
        file_id = getattr(result, "file_id", None)
        if not file_id:
            raise RuntimeError("ImageKit did not return a file identifier.")
        return f"/Flatkart/return-evidence/{upload_name}", detected, digest, "imagekit", str(file_id)

    if storage_provider != "local_private" or os.getenv("APP_ENV", "").strip().lower() != "test":
        raise RuntimeError("Local return evidence storage is available only in explicitly configured tests.")

    # Explicit local storage is limited to isolated tests.
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
    return key, detected, digest, "local_private", None


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
    key, mime_type, digest, provider, provider_file_id = save_evidence(data, filename, declared_content_type)
    directory = _intake_directory(user_id, thread_id)
    try:
        directory.mkdir(parents=True, exist_ok=True)
        import json
        staged_id = uuid4().hex
        staged_name = f"{staged_id}.json"
        manifest = directory / staged_name
        manifest.write_text(json.dumps({
            "storage_key": key,
            "storage_provider": provider,
            "provider_file_id": provider_file_id,
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
        return {"id": staged_id,
                "filename": Path(filename).name[:255] or "evidence",
                "content_type": mime_type, "size_bytes": len(data)}
    except Exception:
        delete_provider_evidence(provider, key, provider_file_id)
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
            if evidence_exists(item.get("storage_provider", "local_private"), item.get("storage_key", "")):
                item["id"] = manifest.stem
                item["manifest"] = manifest
                staged.append(item)
        except (OSError, ValueError, TypeError):
            continue
    return staged


def clear_staged_evidence(staged: list[dict], committed_storage_keys=()) -> None:
    committed_storage_keys = set(committed_storage_keys)
    for item in staged:
        if item.get("storage_key") not in committed_storage_keys:
            delete_provider_evidence(item.get("storage_provider", "local_private"),
                                     item.get("storage_key", ""), item.get("provider_file_id"))
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


def evidence_exists(provider: str, key: str) -> bool:
    if provider == "imagekit":
        return isinstance(key, str) and key.startswith("/Flatkart/return-evidence/")
    return read_evidence(key) is not None


def signed_evidence_url(key: str, *, expires_in: int = 300) -> str:
    """Build a short-lived ImageKit URL; call only after application authorization."""
    endpoint = os.getenv("IMAGEKIT_URL_ENDPOINT", "").strip().rstrip("/")
    private_key = os.getenv("IMAGEKIT_PRIVATE_KEY", "").strip()
    if not isinstance(key, str) or not re.fullmatch(r"/Flatkart/return-evidence/[A-Za-z0-9._-]{1,180}", key):
        raise ValueError("Invalid ImageKit evidence reference.")
    if not endpoint or not private_key:
        raise RuntimeError("ImageKit URL signing is not configured.")
    from imagekitio import ImageKit

    return ImageKit(private_key=private_key).helper.build_url(
        url_endpoint=endpoint, src=key, signed=True, expires_in=expires_in,
    )


def read_provider_evidence(provider: str, key: str) -> bytes | None:
    if provider != "imagekit":
        path = read_evidence(key)
        return path.read_bytes() if path is not None else None
    import httpx
    from urllib.parse import urlsplit

    signed_url = signed_evidence_url(key, expires_in=60)
    expected_host = urlsplit(os.getenv("IMAGEKIT_URL_ENDPOINT", "")).hostname
    if not expected_host or urlsplit(signed_url).hostname != expected_host:
        raise RuntimeError("ImageKit delivery endpoint is invalid.")
    response = httpx.get(signed_url, timeout=15.0, follow_redirects=False)
    if response.status_code != 200:
        return None
    return response.content


def delete_evidence(key: str) -> None:
    path = read_evidence(key)
    if path is not None:
        path.unlink(missing_ok=True)


def delete_provider_evidence(provider: str, key: str, provider_file_id: str | None = None) -> None:
    if provider == "imagekit":
        if provider_file_id and os.getenv("IMAGEKIT_PRIVATE_KEY", "").strip():
            try:
                from imagekitio import ImageKit
                ImageKit(private_key=os.environ["IMAGEKIT_PRIVATE_KEY"].strip()).files.delete(provider_file_id)
            except Exception as exc:
                logger.warning("ImageKit evidence cleanup failed (%s)", type(exc).__name__)
        return
    delete_evidence(key)


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
        and ((item.get("storage_provider") == "imagekit"
              and isinstance(item.get("storage_key"), str)
              and item["storage_key"].startswith("/Flatkart/return-evidence/"))
             or _valid_private_key(item.get("storage_key")))
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
                            delete_provider_evidence(item.get("storage_provider", "local_private"),
                                                     item["storage_key"], item.get("provider_file_id"))
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
