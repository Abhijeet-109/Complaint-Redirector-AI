"""Shared size and format checks for local and Google Drive documents."""

import zipfile
import stat
from pathlib import Path, PurePosixPath


MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_FILES = 20
MAX_PDF_PAGES = 250
MAX_DOCX_ENTRIES = 2048
MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 100


def validate_document_file(path: str | Path) -> None:
    document_path = Path(path)
    file_size = document_path.stat().st_size

    if file_size <= 0:
        raise ValueError("The file is empty.")
    if file_size > MAX_DOCUMENT_BYTES:
        raise ValueError("The file exceeds the 25 MB limit.")

    extension = document_path.suffix.lower()
    if extension == ".pdf":
        with document_path.open("rb") as document_file:
            header = document_file.read(1024)
        if b"%PDF-" not in header:
            raise ValueError("The file does not have a valid PDF signature.")
        return

    if extension != ".docx":
        raise ValueError("Only PDF and DOCX files are supported.")

    try:
        with zipfile.ZipFile(document_path) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}

            if len(entries) > MAX_DOCX_ENTRIES:
                raise ValueError("The DOCX archive contains too many entries.")

            if not {
                "[Content_Types].xml",
                "word/document.xml",
            }.issubset(names):
                raise ValueError("The DOCX archive is missing required content.")

            total_uncompressed = 0
            for entry in entries:
                member_path = PurePosixPath(entry.filename)
                if (
                    member_path.is_absolute()
                    or ".." in member_path.parts
                    or "\\" in entry.filename
                    or entry.flag_bits & 0x1
                    or stat.S_ISLNK(entry.external_attr >> 16)
                ):
                    raise ValueError("The DOCX archive contains an unsafe entry.")
                total_uncompressed += entry.file_size

                if entry.file_size > max(entry.compress_size, 1) * MAX_DOCX_COMPRESSION_RATIO:
                    raise ValueError("The DOCX archive compression ratio is too high.")

            if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise ValueError("The DOCX archive expands beyond the allowed size.")

    except zipfile.BadZipFile as exc:
        raise ValueError("The file is not a valid DOCX archive.") from exc
