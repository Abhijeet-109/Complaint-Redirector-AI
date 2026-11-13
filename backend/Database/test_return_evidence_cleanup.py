"""Focused tests for retention-based private return evidence cleanup."""

import io
import json
import os
import shutil
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.Database.connection import Base
from backend.Database.models import ReturnEvidence
from backend.Database.return_evidence_storage import (
    cleanup_stale_evidence,
    evidence_root,
    list_staged_evidence,
    stage_evidence,
)
from unittest.mock import patch


class ReturnEvidenceCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(os.getcwd()) / "backend" / "private_return_evidence" / f".cleanup-test-{uuid.uuid4().hex}"
        self.temp.mkdir()
        self.storage_patch = patch.dict(os.environ, {
            "RETURN_EVIDENCE_DIR": str(self.temp),
            "RETURN_EVIDENCE_RETENTION_HOURS": "24",
        })
        self.storage_patch.start()
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[
            Base.metadata.tables["users"],
            Base.metadata.tables["chat_conversations"],
            Base.metadata.tables["return_requests"],
            Base.metadata.tables["return_evidence"],
        ])
        self.db = Session(self.engine)
        self.user_id = 101
        self.thread_id = f"cleanup-{uuid.uuid4()}"
        self.now = datetime.now(timezone.utc)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.storage_patch.stop()
        shutil.rmtree(self.temp, ignore_errors=True)

    @staticmethod
    def _png():
        output = io.BytesIO()
        Image.new("RGB", (2, 2), "green").save(output, format="PNG")
        return output.getvalue()

    def _age(self, path: Path, *, hours=48):
        timestamp = (self.now - timedelta(hours=hours)).timestamp()
        os.utime(path, (timestamp, timestamp))

    def test_cleanup_expires_staged_and_orphan_files_but_preserves_committed_and_fresh(self):
        from backend.Database.models import ChatConversation

        self.db.add(ChatConversation(thread_id=self.thread_id, user_id=self.user_id, title="Cleanup"))
        self.db.commit()
        expired = stage_evidence(self._png(), "expired.png", "image/png", self.user_id,
                                 self.thread_id, 1, 11, str(uuid.uuid4()))
        fresh_thread = f"fresh-{uuid.uuid4()}"
        fresh = stage_evidence(self._png(), "fresh.png", "image/png", self.user_id,
                               fresh_thread, 1, 12, str(uuid.uuid4()))
        manifests = list((evidence_root() / "intake").glob("*/*.json"))
        expired_manifest = next(path for path in manifests if "expired.png" in path.read_text(encoding="utf-8"))
        self._age(expired_manifest)
        expired_file_key = json.loads(expired_manifest.read_text(encoding="utf-8"))["storage_key"]
        expired_file = evidence_root() / expired_file_key
        self._age(expired_file)

        committed_key = f"returns/{uuid.uuid4().hex}.png"
        committed_file = evidence_root() / committed_key
        committed_file.parent.mkdir(parents=True, exist_ok=True)
        committed_file.write_bytes(self._png())
        self.db.add(ReturnEvidence(
            return_request_id=999, storage_provider="local_private", storage_key=committed_key,
            original_filename="submitted.png", mime_type="image/png", size_bytes=10,
            uploaded_by_id=self.user_id,
        ))
        self.db.commit()
        self._age(committed_file)

        orphan = evidence_root() / "returns" / f"{uuid.uuid4().hex}.webp"
        orphan.write_bytes(b"orphan")
        self._age(orphan)
        temporary = evidence_root() / "returns" / f".{uuid.uuid4().hex}.tmp"
        temporary.write_bytes(b"partial")
        self._age(temporary)

        result = cleanup_stale_evidence(self.db, now=self.now)
        self.assertFalse(expired_file.exists())
        self.assertFalse(expired_manifest.exists())
        self.assertEqual([item["filename"] for item in list_staged_evidence(self.user_id, fresh_thread)],
                         [fresh["filename"]])
        self.assertTrue(committed_file.exists())
        self.assertFalse(orphan.exists())
        self.assertFalse(temporary.exists())
        self.assertGreaterEqual(result["files"], 3)
        self.assertEqual(cleanup_stale_evidence(self.db, now=self.now)["errors"], 0)

    def test_corrupt_expired_manifest_and_orphan_are_cleaned_idempotently(self):
        intake = evidence_root() / "intake" / ("a" * 64)
        intake.mkdir(parents=True)
        manifest = intake / "corrupt.json"
        manifest.write_text("{invalid", encoding="utf-8")
        self._age(manifest)
        orphan = evidence_root() / "returns" / f"{uuid.uuid4().hex}.jpg"
        orphan.parent.mkdir(parents=True, exist_ok=True)
        orphan.write_bytes(b"unreferenced")
        self._age(orphan)

        cleanup_stale_evidence(self.db, now=self.now)
        self.assertFalse(manifest.exists())
        self.assertFalse(orphan.exists())
        self.assertEqual(cleanup_stale_evidence(self.db, now=self.now)["errors"], 0)


if __name__ == "__main__":
    unittest.main()
