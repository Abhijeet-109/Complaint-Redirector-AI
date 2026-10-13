"""Focused tests for persisted chatbot performance paging."""

import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite://"

# These tests cover telemetry reads and do not load the chatbot model stack.
answer_pipeline_stub = types.ModuleType("backend.chatbot.answer_pipeline")
answer_pipeline_stub.answer_question = lambda question: {}
sys.modules.setdefault("backend.chatbot.answer_pipeline", answer_pipeline_stub)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import ChatbotTelemetry
from backend.api.routes.chatbot import chatbot_performance


class ChatbotPerformanceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.session.add_all([
            ChatbotTelemetry(
                created_at=now - timedelta(minutes=index),
                question_preview=f"Question {index}",
                outcome="answered",
                fallback=False,
                source_names=[],
                source_count=0,
                latency_ms=12.0,
            )
            for index in range(12)
        ])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_pages_ten_newest_queries_without_overlap(self):
        first_page = chatbot_performance(db=self.session, offset=0, limit=10)
        second_page = chatbot_performance(db=self.session, offset=10, limit=10)

        first_ids = [query["id"] for query in first_page["recent_queries"]]
        second_ids = [query["id"] for query in second_page["recent_queries"]]
        expected_ids = [row.id for row in self.session.query(ChatbotTelemetry).order_by(
            ChatbotTelemetry.created_at.desc(), ChatbotTelemetry.id.desc()
        ).all()]

        self.assertEqual(first_page["total_requests"], 12)
        self.assertEqual(first_ids, expected_ids[:10])
        self.assertEqual(second_ids, expected_ids[10:])
        self.assertTrue(first_page["has_more"])
        self.assertFalse(second_page["has_more"])
        self.assertFalse(set(first_ids) & set(second_ids))

    def test_empty_telemetry_has_no_next_page(self):
        self.session.query(ChatbotTelemetry).delete()
        self.session.commit()

        response = chatbot_performance(db=self.session, offset=0, limit=10)

        self.assertEqual(response["total_requests"], 0)
        self.assertEqual(response["recent_queries"], [])
        self.assertFalse(response["has_more"])


if __name__ == "__main__":
    unittest.main()
