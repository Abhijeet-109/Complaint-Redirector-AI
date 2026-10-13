import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

from backend.chatbot.document_validation import validate_document_file
from backend.chatbot import google_drive_service


class DocumentValidationTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(__file__).resolve().parent
        self.created_paths = []

    def tearDown(self):
        for path in self.created_paths:
            path.unlink(missing_ok=True)

    def fixture_path(self, name):
        path = self.directory / f".validation-{uuid.uuid4().hex}-{name}"
        self.created_paths.append(path)
        return path

    def test_accepts_pdf_signature(self):
        path = self.fixture_path("valid.pdf")
        path.write_bytes(b"%PDF-1.7\nminimal test fixture")
        validate_document_file(path)

    def test_rejects_empty_or_invalid_pdf(self):
        path = self.fixture_path("invalid.pdf")
        path.write_bytes(b"not a PDF")
        with self.assertRaisesRegex(ValueError, "PDF signature"):
            validate_document_file(path)

        path.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "empty"):
            validate_document_file(path)

    def test_accepts_docx_with_required_package_parts(self):
        path = self.fixture_path("valid.docx")
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<document/>")
        validate_document_file(path)

    def test_rejects_bad_docx_archives_and_traversal_entries(self):
        path = self.fixture_path("invalid.docx")
        path.write_bytes(b"not a zip archive")
        with self.assertRaisesRegex(ValueError, "DOCX archive"):
            validate_document_file(path)

        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<document/>")
            archive.writestr("../outside.xml", "bad")
        with self.assertRaisesRegex(ValueError, "unsafe entry"):
            validate_document_file(path)

    def test_rejects_highly_compressed_docx_content(self):
        path = self.fixture_path("compressed.docx")
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<document/>" + ("A" * 10000))
        with patch("backend.chatbot.document_validation.MAX_DOCX_COMPRESSION_RATIO", 2):
            with self.assertRaisesRegex(ValueError, "compression ratio"):
                validate_document_file(path)

    def test_rejects_oversized_files(self):
        path = self.fixture_path("large.pdf")
        path.write_bytes(b"%PDF-1.7")
        with patch("backend.chatbot.document_validation.MAX_DOCUMENT_BYTES", 4):
            with self.assertRaisesRegex(ValueError, "25 MB limit"):
                validate_document_file(path)

    def test_drive_download_enforces_streamed_size_limit(self):
        class Request:
            def execute(self):
                return {"mimeType": "application/pdf", "name": "drive.pdf"}

        class Files:
            def get(self, **kwargs):
                return Request()

            def get_media(self, **kwargs):
                return object()

        class Service:
            def files(self):
                return Files()

        class Downloader:
            def __init__(self, buffer, request):
                self.buffer = buffer

            def next_chunk(self):
                self.buffer.write(b"%PDF-1.7-too-large")
                return None, True

        destination = self.directory / ".drive-limit-test.tmp"
        with patch.object(google_drive_service, "get_drive_service", return_value=Service()), \
                patch.object(google_drive_service, "MediaIoBaseDownload", Downloader), \
                patch.object(google_drive_service, "MAX_DOCUMENT_BYTES", 4):
            with self.assertRaisesRegex(ValueError, "25 MB limit"):
                google_drive_service.download_drive_file("drive-id", destination)

        self.assertFalse(destination.with_suffix(".pdf").exists())


if __name__ == "__main__":
    unittest.main()
