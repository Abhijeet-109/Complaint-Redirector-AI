
import stat
import zipfile
from pathlib import Path, PurePosixPath

from pypdf import PdfReader


MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_FILES = 20
MAX_PDF_PAGES = 250
MAX_DOCX_ENTRIES = 2048
MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 100

SUPPORTED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".txt", ".rtf", ".odt",
    ".pptx", ".xlsx", ".csv", ".tsv", ".html", ".htm",
    ".xml", ".json", ".eml", ".md", ".png", ".jpg",
    ".jpeg", ".tiff", ".bmp",
}

ZIP_FORMATS = {".docx", ".pptx", ".xlsx", ".odt"}


def validate_document_file(path: str | Path) -> None:
    document_path = Path(path)

    if not document_path.is_file():
        raise ValueError("Document does not exist.")

    if document_path.stat().st_size == 0:
        raise ValueError("The file is empty.")

    if document_path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ValueError("The file exceeds the 25 MB limit.")

    extension = document_path.suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file format: {extension}")

    if extension == ".pdf":
        with document_path.open("rb") as file:
            if b"%PDF-" not in file.read(1024):
                raise ValueError("Invalid PDF file.")

        try:
            reader = PdfReader(str(document_path))
            if len(reader.pages) > MAX_PDF_PAGES:
                raise ValueError(
                    f"PDF exceeds the {MAX_PDF_PAGES}-page limit."
                )
        except Exception as exc:
            if isinstance(exc, ValueError):
                raise
            raise ValueError("Unable to read the PDF file.") from exc

        return

    if extension not in ZIP_FORMATS:
        return

    try:
        with zipfile.ZipFile(document_path) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}

            if len(entries) > MAX_DOCX_ENTRIES:
                raise ValueError("Document archive contains too many entries.")

            required_files = {
                ".docx": {"[Content_Types].xml", "word/document.xml"},
                ".pptx": {"[Content_Types].xml", "ppt/presentation.xml"},
                ".xlsx": {"[Content_Types].xml", "xl/workbook.xml"},
                ".odt": {"content.xml", "mimetype"},
            }

            if not required_files[extension].issubset(names):
                raise ValueError("Invalid document archive structure.")

            total_size = 0

            for entry in entries:
                member_path = PurePosixPath(entry.filename)

                if (
                    member_path.is_absolute()
                    or ".." in member_path.parts
                    or "\\" in entry.filename
                    or entry.flag_bits & 0x1
                    or stat.S_ISLNK(entry.external_attr >> 16)
                ):
                    raise ValueError("Unsafe document archive entry.")

                total_size += entry.file_size

                if (
                    entry.file_size
                    > max(entry.compress_size, 1)
                    * MAX_DOCX_COMPRESSION_RATIO
                ):
                    raise ValueError("Document compression ratio is too high.")

            if total_size > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise ValueError("Document expands beyond the allowed size.")

    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid document archive.") from exc
