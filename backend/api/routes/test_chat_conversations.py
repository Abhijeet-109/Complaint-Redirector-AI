"""Focused tests for ownership and checkpoint-backed conversation APIs."""

import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("GROQ_API_KEY", "test-key")

# Keep API tests independent of ChromaDB, model downloads, and external services.
_pipeline = types.ModuleType("backend.chatbot.answer_pipeline")
_pipeline.answer_question = lambda question, chat_history=None: {"answer": "Test answer", "sources": []}
_vector_store = types.ModuleType("backend.chatbot.vector_store")
_vector_store.vectorstore = object()
sys.modules.setdefault("backend.chatbot.answer_pipeline", _pipeline)
sys.modules.setdefault("backend.chatbot.vector_store", _vector_store)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.auth.dependencies import get_current_user, get_db
from backend.api.routes import chatbot as chatbot_module
from backend.api.routes.chatbot import router


class _FakeGraph:
    def __init__(self):
        self.threads = {}
        self.checkpointer = object()

    def get_state(self, config):
        state = self.threads.get(config["configurable"]["thread_id"], {})
        return SimpleNamespace(values={**state, "messages": list(state.get("messages", []))})

    def invoke(self, input_state, config):
        thread_id = config["configurable"]["thread_id"]
        state = self.threads.setdefault(thread_id, {"messages": []})
        messages = state["messages"]
        messages.append(HumanMessage(content=input_state["question"]))
        messages.append(AIMessage(content="Test answer"))
        answer = {"answer": "Test answer", "sources": []}
        state["answer"] = answer
        state["last_request_id"] = input_state.get("request_id")
        return {"answer": answer}


class _FakeCheckpointer:
    def __init__(self, graph):
        self.graph = graph
        self.deleted = []

    def delete_thread(self, thread_id):
        self.deleted.append(thread_id)
        self.graph.threads.pop(thread_id, None)


class ChatConversationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self.graph = _FakeGraph()
        self.checkpointer = _FakeCheckpointer(self.graph)
        self.app = FastAPI()
        self.app.state.agent_graph = self.graph
        self.app.state.chat_checkpointer = self.checkpointer
        self.app.include_router(router)

        def database_session():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = database_session
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=701, role="user")
        self.client = TestClient(self.app)
        self.telemetry_patch = patch.object(chatbot_module, "_record_telemetry")
        self.telemetry_patch.start()
        self.addCleanup(self.telemetry_patch.stop)
        with self.Session() as db:
            from backend.Database.models import ChatConversation
            db.query(ChatConversation).delete()
            db.commit()
        self.created = self.client.post("/chatbot/conversations", json={}).json()

    def tearDown(self):
        self.client.close()

    def test_create_ask_resume_list_and_delete_thread(self):
        thread_id = self.created["thread_id"]
        first = self.client.post("/chatbot/ask", json={"question": "Where is my order?", "thread_id": thread_id})
        second = self.client.post("/chatbot/ask", json={"question": "And when will it arrive?", "thread_id": thread_id})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["thread_id"], thread_id)
        history = self.client.get(f"/chatbot/conversations/{thread_id}")
        self.assertEqual([item["role"] for item in history.json()["messages"]], ["user", "assistant", "user", "assistant"])
        self.assertEqual(history.json()["title"], "Where is my order?")
        self.assertEqual(self.client.get("/chatbot/conversations").json()["conversations"][0]["thread_id"], thread_id)
        self.assertEqual(self.client.delete(f"/chatbot/conversations/{thread_id}").status_code, 204)
        self.assertEqual(self.checkpointer.deleted, [thread_id])
        self.assertEqual(self.client.get(f"/chatbot/conversations/{thread_id}").status_code, 404)

    def test_legacy_session_id_creates_owned_conversation_and_other_owner_is_hidden(self):
        thread_id = "legacy-tab-session"
        response = self.client.post("/chatbot/ask", json={"question": "Hi", "session_id": thread_id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["thread_id"], thread_id)

        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=702, role="user")
        self.assertEqual(self.client.get(f"/chatbot/conversations/{thread_id}").status_code, 404)
        self.assertEqual(self.client.delete(f"/chatbot/conversations/{thread_id}").status_code, 404)
        self.assertEqual(
            self.client.post("/chatbot/ask", json={"question": "Hi again", "thread_id": thread_id}).status_code,
            404,
        )

    def test_request_id_retry_returns_saved_answer_without_duplicating_messages(self):
        thread_id = self.created["thread_id"]
        payload = {"question": "Repeat safely", "thread_id": thread_id, "request_id": "request-123"}
        first = self.client.post("/chatbot/ask", json=payload)
        retried = self.client.post("/chatbot/ask", json=payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.json()["answer"], first.json()["answer"])
        messages = self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"]
        self.assertEqual([message["role"] for message in messages], ["user", "assistant"])

    def test_graph_checkpointer_resumes_messages_without_duplicate_turns(self):
        from backend.agents import agent_graph as graph_module

        graph = graph_module.build_graph(checkpointer=MemorySaver())
        config = {"configurable": {"thread_id": "isolated-thread"}}
        other_config = {"configurable": {"thread_id": "other-thread"}}
        with patch.object(graph_module, "select_route", return_value="product"), \
                patch.object(graph_module, "run_product_agent", side_effect=[{"answer": "First"}, {"answer": "Second"}, {"answer": "Other"}]):
            graph.invoke({
                "question": "First question",
                "user_id": 701,
            }, config=config)
            graph.invoke({
                "question": "Second question",
                "user_id": 701,
            }, config=config)
            graph.invoke({
                "question": "Other thread question",
                "user_id": 701,
            }, config=other_config)

        messages = graph.get_state(config).values["messages"]
        self.assertEqual([message.type for message in messages], ["human", "ai", "human", "ai"])
        self.assertEqual([message.content for message in messages if message.type == "human"], ["First question", "Second question"])
        other_messages = graph.get_state(other_config).values["messages"]
        self.assertEqual([message.content for message in other_messages if message.type == "human"], ["Other thread question"])

    def test_failed_agent_retry_does_not_checkpoint_a_duplicate_user_turn(self):
        from backend.agents import agent_graph as graph_module

        graph = graph_module.build_graph(checkpointer=MemorySaver())
        config = {"configurable": {"thread_id": "retry-thread"}}
        with patch.object(graph_module, "select_route", return_value="product"), \
                patch.object(graph_module, "run_product_agent", side_effect=[RuntimeError("temporary"), {"answer": "Recovered"}]):
            with self.assertRaises(RuntimeError):
                graph.invoke({"question": "Retry this", "user_id": 701}, config=config)
            self.assertEqual(graph.get_state(config).values.get("messages", []), [])
            graph.invoke({"question": "Retry this", "user_id": 701}, config=config)

        messages = graph.get_state(config).values["messages"]
        self.assertEqual([message.type for message in messages], ["human", "ai"])
        self.assertEqual(messages[0].content, "Retry this")


    def test_request_id_is_never_treated_as_thread_id(self):
        # A request with request_id but no thread_id must generate a new UUID thread_id, not use request_id
        response = self.client.post("/chatbot/ask", json={
            "question": "What laptops are available?",
            "request_id": "req-distinct-from-thread-999",
        })
        self.assertEqual(response.status_code, 200)
        returned_thread = response.json()["thread_id"]
        self.assertNotEqual(returned_thread, "req-distinct-from-thread-999")
        self.assertEqual(response.json()["title"], "What laptops are available?")
        self.assertIn("updated_at", response.json())

    def test_multiple_conversations_isolation(self):
        # Create Conversation A and Conversation B
        conv_a = self.client.post("/chatbot/conversations", json={}).json()["thread_id"]
        conv_b = self.client.post("/chatbot/conversations", json={}).json()["thread_id"]

        self.client.post("/chatbot/ask", json={"question": "Message in A 1", "thread_id": conv_a})
        self.client.post("/chatbot/ask", json={"question": "Message in A 2", "thread_id": conv_a})

        self.client.post("/chatbot/ask", json={"question": "Message in B 1", "thread_id": conv_b})

        history_a = self.client.get(f"/chatbot/conversations/{conv_a}").json()["messages"]
        history_b = self.client.get(f"/chatbot/conversations/{conv_b}").json()["messages"]

        self.assertEqual([m["content"] for m in history_a if m["role"] == "user"], ["Message in A 1", "Message in A 2"])
        self.assertEqual([m["content"] for m in history_b if m["role"] == "user"], ["Message in B 1"])


if __name__ == "__main__":
    unittest.main()
