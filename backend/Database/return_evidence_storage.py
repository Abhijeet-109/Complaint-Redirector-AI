"""Private local storage for return evidence files."""

import hashlib
from io import BytesIO
import os
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError


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
                   user_id: int, thread_id: str, order_id: int, order_item_id: int) -> dict:
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


def clear_staged_evidence(staged: list[dict]) -> None:
    for item in staged:
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
