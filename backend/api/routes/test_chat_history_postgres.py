"""PostgreSQL integration tests; writes are isolated to a disposable test schema."""

import os
import sys
import types
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlparse

from dotenv import dotenv_values, load_dotenv

load_dotenv(dotenv_path=".env")
TEST_POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")
PROJECT_DATABASE_URL = os.getenv("DATABASE_URL")
if not PROJECT_DATABASE_URL or PROJECT_DATABASE_URL.startswith("sqlite"):
    PROJECT_DATABASE_URL = dotenv_values(".env").get("DATABASE_URL") or PROJECT_DATABASE_URL
MAIN_DB_INTEGRATION = os.getenv("CHAT_HISTORY_MAIN_DB_INTEGRATION") == "1"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["APP_ENV"] = "test"
os.environ.setdefault("GROQ_API_KEY", "test-key")
os.environ.setdefault("LANGGRAPH_STRICT_MSGPACK", "true")

# Keep integration tests independent of ChromaDB and model providers.
_pipeline = types.ModuleType("backend.chatbot.answer_pipeline")
_pipeline.answer_question = lambda question, chat_history=None: {"answer": "unused", "sources": []}
_vector_store = types.ModuleType("backend.chatbot.vector_store")
_vector_store.vectorstore = object()
sys.modules.setdefault("backend.chatbot.answer_pipeline", _pipeline)
sys.modules.setdefault("backend.chatbot.vector_store", _vector_store)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from alembic import command
from alembic.config import Config

from backend.Database.connection import Base
from backend.Database.models import User
from backend.auth.dependencies import get_current_user, get_db
from backend.api.routes.chatbot import router
from backend.agents import agent_graph as graph_module


def _target(url):
    if not url:
        return None
    parsed = urlparse(url)
    return parsed.scheme, parsed.hostname, parsed.port, parsed.path


@unittest.skipUnless(TEST_POSTGRES_URL or MAIN_DB_INTEGRATION, "Set TEST_POSTGRES_URL or explicitly enable CHAT_HISTORY_MAIN_DB_INTEGRATION=1")
class PostgreSQLChatHistoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from langgraph.checkpoint.postgres import PostgresSaver

        cls.schema = None
        if TEST_POSTGRES_URL:
            if _target(TEST_POSTGRES_URL) == _target(PROJECT_DATABASE_URL):
                raise RuntimeError("TEST_POSTGRES_URL must not point to DATABASE_URL")
            database_name = make_url(TEST_POSTGRES_URL).database or ""
            if not any(marker in database_name.casefold() for marker in ("test", "scratch", "disposable")):
                raise RuntimeError("TEST_POSTGRES_URL must identify a disposable test or scratch database")

            cls.schema = f"chat_history_test_{uuid.uuid4().hex}"
            cls.admin_engine = create_engine(TEST_POSTGRES_URL, pool_pre_ping=True)
            with cls.admin_engine.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
            cls.engine = create_engine(
                TEST_POSTGRES_URL,
                connect_args={"options": f"-csearch_path={cls.schema}"},
                pool_pre_ping=True,
            )
            with cls.engine.begin() as connection:
                config = Config("alembic.ini")
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
            checkpoint_url = make_url(TEST_POSTGRES_URL)
            checkpoint_url = checkpoint_url.set(
                query={**checkpoint_url.query, "options": f"-csearch_path={cls.schema}"}
            )
        else:
            if not PROJECT_DATABASE_URL:
                raise RuntimeError("DATABASE_URL is required for the explicitly authorized integration test")
            cls.engine = create_engine(PROJECT_DATABASE_URL, pool_pre_ping=True)
            with cls.engine.connect() as connection:
                with connection.begin():
                    connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                    revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                    tables = set(inspect(connection).get_table_names())
            if revision != "7b9c2d8e4f10" or "chat_conversations" not in tables:
                raise RuntimeError("Configured database schema is not at the expected Chat History migration head")
            checkpoint_url = make_url(PROJECT_DATABASE_URL)

        checkpoint_url = checkpoint_url.set(drivername="postgresql")
        cls.Session = sessionmaker(bind=cls.engine, expire_on_commit=False)
        cls.PostgresSaver = PostgresSaver
        cls.checkpoint_url = checkpoint_url.render_as_string(hide_password=False)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            cls.engine.dispose()
        if getattr(cls, "schema", None) and hasattr(cls, "admin_engine"):
            with cls.admin_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
            cls.admin_engine.dispose()

    def _open_checkpointer(self):
        context = self.PostgresSaver.from_conn_string(self.checkpoint_url)
        saver = context.__enter__()
        saver.setup()
        self._checkpoint_context = context
        self._saver = saver
        return saver

    def _restart_graph(self):
        self._checkpoint_context.__exit__(None, None, None)
        saver = self._open_checkpointer()
        self.app.state.chat_checkpointer = saver
        self.app.state.agent_graph = graph_module.build_graph(checkpointer=saver)

    def setUp(self):
        self.user_id = None
        self._open_checkpointer()
        self.app = FastAPI()
        self.app.state.chat_checkpointer = self._saver
        self.app.state.agent_graph = graph_module.build_graph(checkpointer=self._saver)

        with self.Session() as db:
            user = User(
                name="Chat History Integration",
                email=f"{uuid.uuid4()}@example.com",
                password="test-hash",
                role="user",
            )
            db.add(user)
            db.commit()
            self.user_id = user.id

        def database_session():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = database_session
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id=self.user_id,
            role="user",
        )
        self.app.include_router(router)
        self.client = TestClient(self.app)
        self.histories = []

        def answer(question, chat_history):
            self.histories.append([(message.type, message.content) for message in chat_history])
            return {"answer": f"Answer: {question}", "sources": []}
        self.answer_question = answer

        self._patches = [
            patch.object(graph_module, "select_route", return_value="knowledge"),
            patch.object(graph_module, "run_knowledge_rag", side_effect=answer),
            patch("backend.api.routes.chatbot._record_telemetry"),
        ]
        for patcher in self._patches:
            patcher.start()

    def tearDown(self):
        self.client.close()
        for patcher in reversed(self._patches):
            patcher.stop()
        with self.Session() as db:
            from backend.Database.models import ChatConversation
            threads = [row.thread_id for row in db.query(ChatConversation).filter_by(user_id=self.user_id).all()]
            for thread_id in threads:
                self._saver.delete_thread(thread_id)
            db.query(ChatConversation).filter_by(user_id=self.user_id).delete()
            db.query(User).filter_by(id=self.user_id).delete()
            db.commit()
        self._checkpoint_context.__exit__(None, None, None)

    def test_resume_restart_history_isolation_context_ownership_and_delete(self):
        first = self.client.post("/chatbot/conversations", json={})
        self.assertEqual(first.status_code, 201)
        thread_id = first.json()["thread_id"]
        self.assertEqual(self.client.post("/chatbot/ask", json={"thread_id": thread_id, "question": "First"}).status_code, 200)
        self.assertEqual(self.client.post("/chatbot/ask", json={"thread_id": thread_id, "question": "Follow up"}).status_code, 200)
        self.assertEqual(self.histories[0], [])
        self.assertEqual([kind for kind, _ in self.histories[1]], ["human", "ai"])

        history = self.client.get(f"/chatbot/conversations/{thread_id}").json()
        self.assertEqual([item["role"] for item in history["messages"]], ["user", "assistant", "user", "assistant"])
        self.assertEqual(history["title"], "First")

        second = self.client.post("/chatbot/conversations", json={}).json()["thread_id"]
        self.client.post("/chatbot/ask", json={"thread_id": second, "question": "Separate"})
        self.assertEqual(len(self.client.get(f"/chatbot/conversations/{second}").json()["messages"]), 2)
        self.assertEqual(len(self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"]), 4)
        listed = self.client.get("/chatbot/conversations").json()["conversations"]
        self.assertEqual([item["thread_id"] for item in listed[:2]], [second, thread_id])

        self._restart_graph()
        restored = self.client.get(f"/chatbot/conversations/{thread_id}").json()
        self.assertEqual(len(restored["messages"]), 4)
        self.client.post("/chatbot/ask", json={"thread_id": thread_id, "question": "After restart"})
        self.assertEqual([kind for kind, _ in self.histories[-1]], ["human", "ai", "human", "ai"])

        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=self.user_id + 1000000, role="user")
        self.assertEqual(self.client.get(f"/chatbot/conversations/{thread_id}").status_code, 404)
        self.assertEqual(self.client.delete(f"/chatbot/conversations/{thread_id}").status_code, 404)
        self.assertEqual(self.client.post("/chatbot/ask", json={"thread_id": thread_id, "question": "Unauthorized"}).status_code, 404)
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=self.user_id, role="user")

        self.assertEqual(self.client.delete(f"/chatbot/conversations/{thread_id}").status_code, 204)
        self.assertIsNone(self._saver.get_tuple({"configurable": {"thread_id": thread_id}}))

        automatic = self.client.post("/chatbot/ask", json={"question": "Start without an ID"})
        self.assertEqual(automatic.status_code, 200)
        automatic_thread = automatic.json()["thread_id"]
        self.assertEqual(self.client.get(f"/chatbot/conversations/{automatic_thread}").json()["title"], "Start without an ID")

    def test_failed_request_retry_and_request_id_are_idempotent(self):
        conversation = self.client.post("/chatbot/conversations", json={}).json()
        thread_id = conversation["thread_id"]
        request_id = str(uuid.uuid4())
        payload = {"thread_id": thread_id, "question": "Retry this", "request_id": request_id}
        attempts = 0

        def fail_once(question, chat_history):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("temporary")
            return self.answer_question(question, chat_history)

        with patch.object(graph_module, "run_knowledge_rag", side_effect=fail_once):
            failed = self.client.post("/chatbot/ask", json=payload)
            self.assertEqual(failed.status_code, 500)
            self.assertEqual(self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"], [])
            recovered = self.client.post("/chatbot/ask", json=payload)
        self.assertEqual(recovered.status_code, 200)
        retried = self.client.post("/chatbot/ask", json=payload)
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(len(self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"]), 2)

    def test_concurrent_turns_are_serialized_per_thread(self):
        thread_id = self.client.post("/chatbot/conversations", json={}).json()["thread_id"]

        def send(question):
            with TestClient(self.app) as client:
                return client.post("/chatbot/ask", json={"thread_id": thread_id, "question": question}).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(send, ("Concurrent A", "Concurrent B")))
        self.assertEqual(statuses, [200, 200])
        messages = self.client.get(f"/chatbot/conversations/{thread_id}").json()["messages"]
        self.assertEqual(len(messages), 4)
        self.assertEqual({messages[0]["content"], messages[2]["content"]}, {"Concurrent A", "Concurrent B"})


if __name__ == "__main__":
    unittest.main()
