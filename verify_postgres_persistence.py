"""
Verification script for Flatkart PostgreSQL conversation & LangGraph checkpoint persistence,
including simulated backend restart, ownership checks, and safe cleanup.
"""
import os
import sys
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.engine import make_url

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.Database.connection import DATABASE_URL, SessionLocal, engine
from backend.Database.models import ChatConversation, User
from backend.auth.dependencies import get_current_user
from backend.api.routes.chatbot import router
from backend.agents import agent_graph as graph_module

def run_verification():
    print("==================================================================")
    print("PHASE 3, 6, 7 & 8: REAL POSTGRESQL PERSISTENCE & RESTART VERIFICATION")
    print("==================================================================")

    db_url = make_url(DATABASE_URL)
    print(f"1. Verified Database Engine: {db_url.get_backend_name()}")
    print(f"   Database Name: {db_url.database}")

    # Inspect current PostgreSQL tables
    with engine.connect() as conn:
        schema = conn.execute(text("SELECT current_schema()")).scalar()
        tables = conn.execute(text("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = current_schema()
        """)).scalars().all()
        print(f"2. Current PostgreSQL Schema: {schema}")
        print(f"   Required tables present:")
        for req in ["chat_conversations", "checkpoints", "checkpoint_blobs", "checkpoint_writes"]:
            assert req in tables, f"Missing required table: {req}"
            print(f"   - {req}: OK")

    # Use existing customer users
    test_user_id = 1   # user1@gmail.com
    other_user_id = 15 # user3@gmail.com
    
    # We will use PostgresSaver directly from langgraph
    from langgraph.checkpoint.postgres import PostgresSaver
    checkpoint_url = db_url.set(drivername="postgresql").render_as_string(hide_password=False)

    print("\n3. Starting Backend Server Instance 1 (with PostgresSaver)...")
    checkpoint_context1 = PostgresSaver.from_conn_string(checkpoint_url)
    checkpointer1 = checkpoint_context1.__enter__()
    checkpointer1.setup()

    graph1 = graph_module.build_graph(checkpointer=checkpointer1)

    app1 = FastAPI()
    app1.state.agent_graph = graph1
    app1.state.chat_checkpointer = checkpointer1
    app1.include_router(router)

    current_test_user = SimpleNamespace(id=test_user_id, role="user")
    app1.dependency_overrides[get_current_user] = lambda: current_test_user

    client1 = TestClient(app1)

    # Step 1: Create a conversation
    create_res = client1.post("/chatbot/conversations", json={"title": "New chat"})
    assert create_res.status_code == 201, f"Failed create: {create_res.text}"
    thread_id = create_res.json()["thread_id"]
    print(f"   Created Conversation: thread_id={thread_id}")

    # Step 2: Send turn 1, turn 2, turn 3
    turns = [
        ("What are the best wireless headphones available?", "We recommend the Sony WH-1000XM5 and Bose 700."),
        ("Do you have any Sony models in stock?", "Yes, Sony WH-1000XM5 is in stock with 15 units available."),
        ("Can I pay with cash on delivery?", "Yes, Cash on Delivery is available for this product."),
    ]

    print("\n4. Sending 3 consecutive messages to Conversation...")
    with patch.object(graph_module, "select_route", return_value="product"):
        for idx, (question, mock_answer) in enumerate(turns, 1):
            req_id = f"req-{uuid.uuid4().hex[:8]}"
            with patch.object(graph_module, "run_product_agent", return_value={"answer": mock_answer}):
                res = client1.post("/chatbot/ask", json={
                    "question": question,
                    "thread_id": thread_id,
                    "request_id": req_id,
                })
            assert res.status_code == 200, f"Turn {idx} failed: {res.text}"
            data = res.json()
            assert data["thread_id"] == thread_id
            print(f"   Turn {idx}: '{question}' -> Answer received (thread_id={data['thread_id']})")

    # Verify conversation title was updated to first question
    conv_history_before = client1.get(f"/chatbot/conversations/{thread_id}").json()
    print(f"   Dynamic Title: '{conv_history_before['title']}'")
    assert conv_history_before["title"] == turns[0][0][:120], "Title was not updated dynamically!"
    assert len(conv_history_before["messages"]) == 6, f"Expected 6 messages (3 human, 3 AI), got {len(conv_history_before['messages'])}"

    # Check database directly
    with SessionLocal() as db:
        conv_row = db.query(ChatConversation).filter(ChatConversation.thread_id == thread_id).first()
        assert conv_row is not None, "chat_conversations row missing in DB!"
        assert conv_row.user_id == test_user_id
        assert conv_row.title == turns[0][0][:120]
        print(f"   Direct DB query: chat_conversations row verified for user {conv_row.user_id}")

    with engine.connect() as conn:
        cp_count = conn.execute(text("SELECT count(*) FROM checkpoints WHERE thread_id = :t"), {"t": thread_id}).scalar()
        assert cp_count > 0, "No checkpoint records in checkpoints table!"
        print(f"   Direct DB query: {cp_count} records found in 'checkpoints' table for thread_id")

    # Step 3: SIMULATE BACKEND RESTART
    print("\n5. SIMULATING FULL BACKEND RESTART (Shutdown Server 1, Start Server 2)...")
    client1.close()
    checkpoint_context1.__exit__(None, None, None)
    print("   [Server 1 Shutdown Complete]")

    # Start Server 2
    checkpoint_context2 = PostgresSaver.from_conn_string(checkpoint_url)
    checkpointer2 = checkpoint_context2.__enter__()
    checkpointer2.setup()

    graph2 = graph_module.build_graph(checkpointer=checkpointer2)

    app2 = FastAPI()
    app2.state.agent_graph = graph2
    app2.state.chat_checkpointer = checkpointer2
    app2.include_router(router)
    app2.dependency_overrides[get_current_user] = lambda: current_test_user

    client2 = TestClient(app2)
    print("   [Server 2 Started with fresh checkpointer and graph instances]")

    # Step 4: Retrieve conversation after restart
    print("\n6. Retrieving conversation after backend restart...")
    res_after_restart = client2.get(f"/chatbot/conversations/{thread_id}")
    assert res_after_restart.status_code == 200
    data_after = res_after_restart.json()
    assert data_after["thread_id"] == thread_id
    assert data_after["title"] == turns[0][0][:120]
    messages_after = data_after["messages"]
    assert len(messages_after) == 6, f"Expected 6 messages after restart, got {len(messages_after)}"
    for idx, (turn_q, turn_ans) in enumerate(turns):
        user_msg = messages_after[idx * 2]
        ai_msg = messages_after[idx * 2 + 1]
        assert user_msg["role"] == "user"
        assert user_msg["content"] == turn_q
        assert ai_msg["role"] == "assistant"
        assert ai_msg["content"] == turn_ans
        print(f"   Turn {idx + 1} verified intact after restart: user='{user_msg['content']}'")

    print("   -> All previous messages persisted across backend restart!")

    # Step 5: Send follow-up turn 4 after restart
    turn_4 = ("Can you help me place an order for the first one?", "I have added Sony WH-1000XM5 to your cart.")
    print(f"\n7. Sending follow-up Turn 4 after restart: '{turn_4[0]}'...")
    with patch.object(graph_module, "select_route", return_value="product"):
        with patch.object(graph_module, "run_product_agent", return_value={"answer": turn_4[1]}):
            res_turn4 = client2.post("/chatbot/ask", json={
                "question": turn_4[0],
                "thread_id": thread_id,
                "request_id": f"req-{uuid.uuid4().hex[:8]}",
            })
    assert res_turn4.status_code == 200

    # Retrieve conversation again
    res_final = client2.get(f"/chatbot/conversations/{thread_id}")
    final_messages = res_final.json()["messages"]
    assert len(final_messages) == 8, f"Expected 8 messages (4 turns), got {len(final_messages)}"
    assert final_messages[-2]["content"] == turn_4[0]
    assert final_messages[-1]["role"] == "assistant"
    assert final_messages[-1]["content"] == turn_4[1]
    print("   -> Turn 4 successfully appended and persisted in the continuous conversation!")

    # Step 6: Test Ownership
    print("\n8. Testing User Ownership Protection...")
    app2.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=other_user_id, role="user")
    other_get = client2.get(f"/chatbot/conversations/{thread_id}")
    assert other_get.status_code == 404, f"Expected 404 for other user, got {other_get.status_code}"
    other_del = client2.delete(f"/chatbot/conversations/{thread_id}")
    assert other_del.status_code == 404, f"Expected 404 for other user delete, got {other_del.status_code}"
    print("   -> Unauthorized users cannot view or delete the conversation (404 Closed).")

    # Step 7: Test Deletion & Checkpoint Cleanup
    print("\n9. Testing Conversation Deletion and Checkpoint Cleanup...")
    app2.dependency_overrides[get_current_user] = lambda: current_test_user
    del_res = client2.delete(f"/chatbot/conversations/{thread_id}")
    assert del_res.status_code == 204, f"Delete failed: {del_res.status_code}"

    # Verify metadata is gone
    with SessionLocal() as db:
        conv_check = db.query(ChatConversation).filter(ChatConversation.thread_id == thread_id).first()
        assert conv_check is None, "Conversation metadata was not deleted from DB!"
        print("   -> chat_conversations metadata deleted successfully.")

    # Verify checkpoints are deleted
    with engine.connect() as conn:
        cp_remaining = conn.execute(text("SELECT count(*) FROM checkpoints WHERE thread_id = :t"), {"t": thread_id}).scalar()
        assert cp_remaining == 0, f"Checkpoints were not deleted! Remaining: {cp_remaining}"
        print("   -> Associated PostgreSQL checkpoints deleted successfully.")

    # Shutdown Server 2
    client2.close()
    checkpoint_context2.__exit__(None, None, None)

    print("\n==================================================================")
    print("ALL POSTGRESQL PERSISTENCE & RESTART VERIFICATIONS PASSED 100%!")
    print("==================================================================")

if __name__ == "__main__":
    run_verification()
