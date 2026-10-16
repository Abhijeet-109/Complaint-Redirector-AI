"""Focused API authorization tests for customer chat and Knowledge Operations."""

import importlib
import hashlib
import json
import os
import sys
import types
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

# Keep these route tests independent of model downloads and persistent ChromaDB.
_stubs = {
    "backend.chatbot.answer_pipeline": types.ModuleType("backend.chatbot.answer_pipeline"),
    "backend.chatbot.vector_store": types.ModuleType("backend.chatbot.vector_store"),
}
_stubs["backend.chatbot.answer_pipeline"].answer_question = lambda question: {
    "answer": "Test answer",
    "sources": [],
}
_vector_store = _stubs["backend.chatbot.vector_store"]
_vector_store.add_documents = lambda paths, **kwargs: 1
_vector_store.delete_document_vectors = lambda name: None
_vector_store.get_document_chunk_count = lambda name: 0
_vector_store.reindex_document = lambda path: 1
_vector_store.COLLECTION_NAME = "test_documents"
_vector_store.EMBEDDING_MODEL_NAME = "test_embeddings"
_vector_store.CHUNK_SIZE = 600
_vector_store.CHUNK_OVERLAP = 200
_vector_store.CHROMA_PATH = "test_chroma"

_module_names = (
    "backend.chatbot.answer_pipeline",
    "backend.chatbot.vector_store",
)
_previous_modules = {name: sys.modules.get(name) for name in _module_names}
sys.modules.update(_stubs)

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.auth.dependencies import get_current_user

_chatbot = importlib.import_module("backend.api.routes.chatbot")
_documents = importlib.import_module("backend.api.routes.documents")
_drive = importlib.import_module("backend.api.routes.drive")

for _name, _previous in _previous_modules.items():
    if _previous is None:
        sys.modules.pop(_name, None)
    else:
        sys.modules[_name] = _previous

# Allow later tests or application imports to load the real route modules.
for _name in (
    "backend.api.routes.chatbot",
    "backend.api.routes.documents",
    "backend.api.routes.drive",
):
    sys.modules.pop(_name, None)

app = FastAPI()
app.include_router(_chatbot.router)
app.include_router(_documents.router)
app.include_router(_drive.router)


@contextmanager
def _isolated_test_upload_dir():
    upload_dir = Path(__file__).resolve().parent / ".test_uploads"
    upload_dir.mkdir(exist_ok=True)
    for old_file in upload_dir.iterdir():
        if old_file.is_file():
            old_file.unlink()
    try:
        yield upload_dir
    finally:
        for test_file in upload_dir.iterdir():
            if test_file.is_file():
                test_file.unlink()


class CustomerRoleAccessTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides.clear()

    def tearDown(self):
        app.dependency_overrides.clear()

    def _as_role(self, role):
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role=role)

    def test_only_customers_can_call_customer_chat(self):
        with patch.object(_chatbot, "answer_question", return_value={"answer": "Test answer", "sources": []}), \
                patch.object(_chatbot, "_record_telemetry"):
            for role in ("department_handler", "admin", "super_admin"):
                with self.subTest(role=role):
                    self._as_role(role)
                    response = self.client.post("/chatbot/ask", json={"question": "Where is my order?"})
                    self.assertEqual(response.status_code, 403)

            self._as_role("user")
            response = self.client.post("/chatbot/ask", json={"question": "Where is my order?"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["answer"], "Test answer")

    def test_missing_authentication_is_rejected_for_chat_and_pipeline_routes(self):
        app.dependency_overrides.clear()
        chat_response = self.client.post(
            "/chatbot/ask",
            json={"question": "Where is my order?"},
        )
        documents_response = self.client.get("/documents")
        self.assertIn(chat_response.status_code, (401, 403))
        self.assertIn(documents_response.status_code, (401, 403))

    def test_customer_roles_cannot_read_or_mutate_pipeline_documents(self):
        requests = (
            ("get", "/documents", None),
            ("post", "/documents/upload", {"files": [("files", ("policy.pdf", b"%PDF-test", "application/pdf"))]}),
            ("post", "/documents/index", {"json": {"stored_names": ["a" * 32 + ".pdf"]}}),
            ("post", "/documents/delete", {"json": {"stored_names": ["a" * 32 + ".pdf"]}}),
            ("get", "/documents/config", None),
        )
        for role in ("user", "department_handler", "admin"):
            for method, path, kwargs in requests:
                with self.subTest(role=role, method=method, path=path):
                    self._as_role(role)
                    response = getattr(self.client, method)(path, **(kwargs or {}))
                    self.assertEqual(response.status_code, 403)

    def test_super_admin_can_use_knowledge_operations_document_apis(self):
        self._as_role("super_admin")
        upload_dir = Path(__file__).resolve().parent / ".test_uploads"
        upload_dir.mkdir(exist_ok=True)
        for old_file in upload_dir.iterdir():
            if old_file.is_file():
                old_file.unlink()
        try:
            manifest_path = upload_dir / "manifest.json"
            with patch.object(_documents, "UPLOAD_DIR", upload_dir), \
                    patch.object(_documents, "MANIFEST_PATH", manifest_path), \
                    patch.object(_documents, "get_document_chunk_count", side_effect=[0, 0, 2, 2, 0]), \
                    patch.object(_documents, "add_documents", return_value=2):
                upload = self.client.post(
                    "/documents/upload",
                    files=[
                        ("files", ("guide.pdf", b"%PDF-test", "application/pdf")),
                        ("files", ("notes.txt", b"not supported", "text/plain")),
                    ],
                )
                self.assertEqual(upload.status_code, 200)
                self.assertEqual(upload.json()["uploaded_count"], 1)
                self.assertEqual(upload.json()["failed_count"], 1)
                stored_name = upload.json()["files"][0]["stored_name"]
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(
                    manifest[stored_name]["content_sha256"],
                    hashlib.sha256(b"%PDF-test").hexdigest(),
                )

                listing = self.client.get("/documents")
                self.assertEqual(listing.status_code, 200)

                indexed = self.client.post(
                    "/documents/index",
                    json={"stored_names": [stored_name]},
                )
                self.assertEqual(indexed.status_code, 200)
                self.assertEqual(indexed.json()["results"][0]["status"], "indexed")

                deleted = self.client.post(
                    "/documents/delete",
                    json={"stored_names": [stored_name]},
                )
                self.assertEqual(deleted.status_code, 200)
                self.assertEqual(deleted.json()["results"][0]["status"], "deleted")

                config = self.client.get("/documents/config")
                self.assertEqual(config.status_code, 200)
        finally:
            for test_file in upload_dir.iterdir():
                if test_file.is_file():
                    test_file.unlink()

    def test_failed_reindex_keeps_existing_index_state_and_hash(self):
        self._as_role("super_admin")
        with _isolated_test_upload_dir() as upload_dir:
            manifest_path = upload_dir / "manifest.json"
            stored_name = "a" * 32 + ".pdf"
            (upload_dir / stored_name).write_bytes(b"%PDF-valid")
            old_hash = "previous-verified-content-hash"
            manifest_path.write_text(json.dumps({stored_name: {
                "original_name": "guide.pdf",
                "status": "indexed",
                "chunks": 2,
                "source": "local_upload",
                "content_sha256": old_hash,
                "error": None,
            }}), encoding="utf-8")

            with patch.object(_documents, "UPLOAD_DIR", upload_dir), \
                    patch.object(_documents, "MANIFEST_PATH", manifest_path), \
                    patch.object(_documents, "get_document_chunk_count", side_effect=[2, 2]), \
                    patch.object(_documents, "reindex_document", side_effect=RuntimeError("refresh failed")):
                response = self.client.post(
                    "/documents/index",
                    json={"stored_names": [stored_name], "reindex": True},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["results"][0]["status"], "failed")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest[stored_name]["status"], "indexed")
            self.assertEqual(manifest[stored_name]["content_sha256"], old_hash)
            self.assertIn("Indexing failed", manifest[stored_name]["error"])

    def test_changed_content_hash_triggers_reindex_and_updates_manifest(self):
        self._as_role("super_admin")
        with _isolated_test_upload_dir() as upload_dir:
            manifest_path = upload_dir / "manifest.json"
            stored_name = "b" * 32 + ".pdf"
            current_content = b"%PDF-current content"
            (upload_dir / stored_name).write_bytes(current_content)
            manifest_path.write_text(json.dumps({stored_name: {
                "original_name": "guide.pdf",
                "status": "indexed",
                "chunks": 2,
                "source": "local_upload",
                "content_sha256": "old-hash",
                "error": None,
            }}), encoding="utf-8")

            with patch.object(_documents, "UPLOAD_DIR", upload_dir), \
                    patch.object(_documents, "MANIFEST_PATH", manifest_path), \
                    patch.object(_documents, "get_document_chunk_count", side_effect=[2, 1]), \
                    patch.object(_documents, "reindex_document", return_value=1) as reindex, \
                    patch.object(_documents, "add_documents") as add:
                response = self.client.post(
                    "/documents/index",
                    json={"stored_names": [stored_name]},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["results"][0]["status"], "indexed")
            reindex.assert_called_once()
            add.assert_not_called()
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(
                manifest[stored_name]["content_sha256"],
                hashlib.sha256(current_content).hexdigest(),
            )

    def test_upload_rejects_invalid_signatures_mime_and_oversize_files(self):
        self._as_role("super_admin")
        with _isolated_test_upload_dir() as upload_dir:
            manifest_path = upload_dir / "manifest.json"
            with patch.object(_documents, "UPLOAD_DIR", upload_dir), \
                    patch.object(_documents, "MANIFEST_PATH", manifest_path):
                invalid_pdf = self.client.post(
                    "/documents/upload",
                    files=[("files", ("fake.pdf", b"not a PDF", "application/pdf"))],
                )
                self.assertEqual(invalid_pdf.status_code, 200)
                self.assertEqual(invalid_pdf.json()["failed_count"], 1)
                self.assertFalse(list(upload_dir.glob("*.pdf")))

                mismatched_mime = self.client.post(
                    "/documents/upload",
                    files=[("files", ("notes.pdf", b"%PDF-1.7", "text/plain"))],
                )
                self.assertEqual(mismatched_mime.status_code, 200)
                self.assertEqual(mismatched_mime.json()["failed_count"], 1)
                self.assertFalse(list(upload_dir.glob("*.pdf")))

                with patch.object(_documents, "MAX_DOCUMENT_BYTES", 4):
                    oversized = self.client.post(
                        "/documents/upload",
                        files=[("files", ("large.pdf", b"%PDF-1.7", "application/pdf"))],
                    )
                self.assertEqual(oversized.status_code, 200)
                self.assertEqual(oversized.json()["failed_count"], 1)
                self.assertFalse(list(upload_dir.glob("*.pdf")))

                with patch.object(_documents, "MAX_UPLOAD_FILES", 1):
                    too_many = self.client.post(
                        "/documents/upload",
                        files=[
                            ("files", ("one.pdf", b"%PDF-1.7", "application/pdf")),
                            ("files", ("two.pdf", b"%PDF-1.7", "application/pdf")),
                        ],
                    )
                self.assertEqual(too_many.status_code, 413)
                self.assertFalse(list(upload_dir.glob("*.pdf")))

    def test_document_sources_survive_local_upload_drive_import_and_listing(self):
        self._as_role("super_admin")
        with _isolated_test_upload_dir() as upload_dir:
            manifest_path = upload_dir / "manifest.json"

            def fake_drive_download(file_id, destination):
                stored_path = Path(destination).with_suffix(".pdf")
                stored_path.write_bytes(b"%PDF-drive-test")
                return {
                    "stored_name": stored_path.name,
                    "original_name": "Drive policy.pdf",
                    "mime_type": "application/pdf",
                    "modified_time": "2026-10-13T10:00:00Z",
                }

            with patch.object(_documents, "UPLOAD_DIR", upload_dir), \
                    patch.object(_documents, "MANIFEST_PATH", manifest_path), \
                    patch.object(_documents, "get_document_chunk_count", return_value=2), \
                    patch.object(_drive, "UPLOAD_DIR", upload_dir), \
                    patch.object(_drive, "MANIFEST_PATH", manifest_path), \
                    patch.object(_drive, "download_drive_file", side_effect=fake_drive_download), \
                    patch.object(_drive, "get_document_chunk_count", return_value=2), \
                    patch.object(_drive, "add_documents", return_value=2) as add_drive:
                local_upload = self.client.post(
                    "/documents/upload",
                    files=[("files", ("local policy.pdf", b"%PDF-local-test", "application/pdf"))],
                )
                self.assertEqual(local_upload.status_code, 200)
                self.assertEqual(local_upload.json()["uploaded_count"], 1)

                drive_import = self.client.post(
                    "/drive/import",
                    json={"file_ids": ["valid-drive-id"]},
                )
                self.assertEqual(drive_import.status_code, 200)
                self.assertEqual(drive_import.json()["imported_count"], 1)
                add_drive.assert_called_once_with(
                    [str(upload_dir / drive_import.json()["results"][0]["stored_name"])],
                    document_identity="valid-drive-id",
                )

                legacy_file = upload_dir / ("a" * 32 + ".pdf")
                legacy_file.write_bytes(b"%PDF-legacy-test")

                listing = self.client.get("/documents")
                self.assertEqual(listing.status_code, 200)
                sources = {
                    document["original_name"]: document["source"]
                    for document in listing.json()["files"]
                }
                self.assertEqual(sources["local policy.pdf"], "local_upload")
                self.assertEqual(sources["Drive policy.pdf"], "google_drive")
                self.assertEqual(sources[legacy_file.name], "unknown")

    def test_only_super_admin_can_access_drive_management(self):
        for role in ("user", "department_handler", "admin"):
            with self.subTest(role=role):
                self._as_role(role)
                response = self.client.get("/drive/status")
                self.assertEqual(response.status_code, 403)

        self._as_role("super_admin")
        with patch.object(_drive, "get_connection_status", return_value={"connected": False}):
            response = self.client.get("/drive/status")
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
