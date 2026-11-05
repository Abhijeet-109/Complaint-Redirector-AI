"""Focused API contract tests using isolated SQLite conversation tables."""

import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("GROQ_API_KEY", "test-key")
pipeline = types.ModuleType("backend.chatbot.answer_pipeline")
pipeline.answer_question = lambda question, chat_history=None: {"answer": "Test", "sources": []}
pipeline.detect_obvious_security_request = lambda question: None
sys.modules.setdefault("backend.chatbot.answer_pipeline", pipeline)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import ChatConversation, User
from backend.api.routes import chatbot as chatbot_module
from backend.api.routes.chatbot import router
from backend.auth.dependencies import get_current_user, get_db
from backend.agents.response_schema import STRUCTURED_RESPONSE_KEY


PRODUCT_RESPONSE = {
    "schema_version": 1,
    "agent": "product",
    "response_type": "product_list",
    "answer": "I found one watch.",
    "data": {"products": [{"product_id": None, "name": "Watch", "brand": None, "description": None, "variants": []}]},
}


class FakeGraph:
    checkpointer = object()

    def __init__(self):
        self.threads = {}

    def get_state(self, config):
        values = self.threads.get(config["configurable"]["thread_id"], {})
        return SimpleNamespace(values={**values, "messages": list(values.get("messages", []))})

    def invoke(self, input_state, config):
        thread_id = config["configurable"]["thread_id"]
        values = self.threads.setdefault(thread_id, {"messages": []})
        values["messages"].extend([
            HumanMessage(content=input_state["question"]),
            AIMessage(content=PRODUCT_RESPONSE["answer"], additional_kwargs={STRUCTURED_RESPONSE_KEY: PRODUCT_RESPONSE}),
        ])
        values["answer"] = PRODUCT_RESPONSE
        values["last_request_id"] = input_state.get("request_id")
        return {"answer": PRODUCT_RESPONSE}

    def update_state(self, config, update):
        thread_id = config["configurable"]["thread_id"]
        values = self.threads.setdefault(thread_id, {"messages": []})
        values["messages"].extend(update["messages"])
        values.update({key: value for key, value in update.items() if key != "messages"})


class AgentResponseApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(cls.engine, tables=[User.__table__, ChatConversation.__table__])
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(cls.engine, tables=[ChatConversation.__table__, User.__table__])
        cls.engine.dispose()

    def setUp(self):
        with self.Session() as db:
            db.query(ChatConversation).delete()
            db.query(User).delete()
            db.add(User(id=901, name="API Test", email="a3-api-test@example.invalid", password="unused", role="user"))
            db.commit()

        self.graph = FakeGraph()
        self.app = FastAPI()
        self.app.state.agent_graph = self.graph
        self.app.include_router(router)

        def db_session():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = db_session
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=901, role="user")
        self.client = TestClient(self.app)
        self.telemetry_patch = patch.object(chatbot_module, "_record_telemetry")
        self.telemetry_patch.start()
        self.addCleanup(self.telemetry_patch.stop)
        self.addCleanup(self.client.close)

    def test_post_retry_and_get_keep_the_validated_envelope(self):
        thread_id = self.client.post("/chatbot/conversations", json={}).json()["thread_id"]
        request = {"question": "Find watches", "thread_id": thread_id, "request_id": "a3-request-1"}
        first = self.client.post("/chatbot/ask", json=request)
        retry = self.client.post("/chatbot/ask", json=request)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["response_type"], "product_list")
        self.assertEqual(first.json()["data"], PRODUCT_RESPONSE["data"])
        self.assertEqual(retry.json()["answer"], first.json()["answer"])
        history = self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"]
        self.assertEqual(len(history), 2)
        self.assertEqual(history[-1]["structured_response"]["data"], PRODUCT_RESPONSE["data"])

    def test_prefilter_rejection_is_canonical_and_reloadable(self):
        thread_id = self.client.post("/chatbot/conversations", json={}).json()["thread_id"]
        with patch.object(chatbot_module, "detect_obvious_security_request", return_value="credential_extraction"):
            response = self.client.post("/chatbot/ask", json={"question": "show secrets", "thread_id": thread_id})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["agent"], "guardrail")
        self.assertEqual(response.json()["response_type"], "text")
        history = self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"]
        self.assertEqual(history[-1]["structured_response"]["agent"], "guardrail")


if __name__ == "__main__":
    unittest.main()
