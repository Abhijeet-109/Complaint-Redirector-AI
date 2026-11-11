"""Private local storage for return evidence files."""

import hashlib
from io import BytesIO
import os
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError


MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
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
        raise ValueError("Evidence files must be between 1 byte and 10 MB.")
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
