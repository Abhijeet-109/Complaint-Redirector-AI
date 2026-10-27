"""Route compatibility tests for request-level chatbot audit persistence."""

import os
import sys
import types
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

# Avoid loading external Groq and Chroma services in route-level tests.
pipeline_stub = types.ModuleType("backend.chatbot.answer_pipeline")
pipeline_stub.answer_question = lambda question, session_id: {}
sys.modules.setdefault("backend.chatbot.answer_pipeline", pipeline_stub)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import ChatbotAuditRequest, ChatbotAuditStage
from backend.api.routes import chatbot
from backend.chatbot import audit_logging


class ChatbotAuditRouteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine)

    def tearDown(self):
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _ask(self):
        return chatbot.ask_chatbot(
            chatbot.ChatRequest(question="Where is my order?", session_id="session-1"),
            _current_user=SimpleNamespace(id=17),
        )

    def test_ask_response_shape_is_preserved_and_audit_persists(self):
        expected = {"answer": "Your order is being processed.", "sources": [{"document": "orders.pdf", "page": 2}]}
        with patch.object(chatbot, "answer_question", return_value=expected), \
             patch.object(chatbot, "SessionLocal", self.factory), \
             patch.object(audit_logging, "SessionLocal", self.factory), \
             patch.object(chatbot, "_record_telemetry"):
            response = self._ask()
        self.assertEqual(response, expected)
        db = self.factory()
        try:
            row = db.query(ChatbotAuditRequest).one()
            self.assertEqual(row.user_id, "17")
            self.assertEqual(row.status, "success")
            self.assertEqual(row.http_status, 200)
            self.assertEqual(row.source_names, ["orders.pdf"])
            self.assertIsNotNone(uuid.UUID(row.request_id))
            stages = db.query(ChatbotAuditStage).filter_by(request_id=row.request_id).all()
            self.assertEqual(len(stages), 3)
            for stage in stages:
                self.assertGreaterEqual(stage.duration_ms, 0)
                self.assertLessEqual(stage.started_at, stage.completed_at)
        finally:
            db.close()

    def test_audit_storage_failure_does_not_change_chat_response(self):
        expected = {"answer": "Information not found in the provided documents.", "sources": []}
        with patch.object(chatbot, "answer_question", return_value=expected), \
             patch.object(chatbot, "persist_audit", side_effect=OSError("storage unavailable")), \
             patch.object(chatbot, "SessionLocal", self.factory), \
             patch.object(audit_logging, "SessionLocal", self.factory), \
             patch.object(chatbot, "_record_telemetry"):
            response = self._ask()
        self.assertEqual(response, expected)


if __name__ == "__main__":
    unittest.main()
