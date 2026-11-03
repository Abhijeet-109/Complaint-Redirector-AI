import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.chatbot.answer_pipeline import answer_question
from backend.Database.connection import SessionLocal
from backend.Database.models import ChatbotTelemetry, ChatConversation
from backend.auth.dependencies import get_db, require_role
from backend.agents.agent_graph import agent_graph

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])
logger = logging.getLogger("flatkart.chatbot.telemetry")
FALLBACK_ANSWER = "Information not found in the provided documents."


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    thread_id: str | None = Field(None, min_length=1, max_length=255)
    # Kept for clients deployed before conversation IDs were introduced.
    session_id: str | None = Field(None, min_length=1, max_length=100)


class ConversationCreateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)


def _conversation_payload(conversation):
    return {
        "thread_id": conversation.thread_id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
    }


def _get_owned_conversation(db, thread_id, user_id):
    conversation = db.query(ChatConversation).filter(
        ChatConversation.thread_id == thread_id,
        ChatConversation.user_id == user_id,
    ).first()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


def _thread_state(graph, thread_id):
    if getattr(graph, "checkpointer", None) is None:
        return None
    return graph.get_state({"configurable": {"thread_id": thread_id}})


@router.post("/conversations", status_code=201)
def create_conversation(
    request: ConversationCreateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("user")),
):
    conversation = ChatConversation(
        thread_id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=(request.title.strip() if request.title and request.title.strip() else "New chat"),
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _conversation_payload(conversation)


@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("user")),
):
    conversations = db.query(ChatConversation).filter(
        ChatConversation.user_id == current_user.id,
    ).order_by(ChatConversation.updated_at.desc(), ChatConversation.thread_id.desc()).all()
    return {"conversations": [_conversation_payload(item) for item in conversations]}


@router.get("/conversations/{thread_id}")
def get_conversation(
    thread_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("user")),
):
    conversation = _get_owned_conversation(db, thread_id, current_user.id)
    graph = getattr(request.app.state, "agent_graph", agent_graph)
    state = _thread_state(graph, thread_id)
    messages = (state.values or {}).get("messages", []) if state else []
    return {
        **_conversation_payload(conversation),
        "messages": [
            {
                "role": "assistant" if getattr(message, "type", "") == "ai" else "user",
                "content": message.content if isinstance(message.content, str) else str(message.content),
            }
            for message in messages
        ],
    }


@router.delete("/conversations/{thread_id}", status_code=204)
def delete_conversation(
    thread_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("user")),
):
    conversation = _get_owned_conversation(db, thread_id, current_user.id)
    checkpointer = getattr(request.app.state, "chat_checkpointer", None)
    if checkpointer is not None:
        checkpointer.delete_thread(thread_id)
    db.delete(conversation)
    db.commit()
    return None


def _safe_question_preview(question: str) -> str:
    preview = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[email]", question)
    preview = re.sub(r"(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)", "[phone]", preview)
    return preview[:240]


def _record_telemetry(question, outcome, latency_ms, sources=None, fallback=False):
    """Best-effort telemetry must never change the customer chat response."""
    db = None
    try:
        db = SessionLocal()
        db.add(ChatbotTelemetry(
            question_preview=_safe_question_preview(question),
            outcome=outcome,
            latency_ms=latency_ms,
            fallback=bool(fallback),
            source_count=len(sources or []),
            source_names=list(dict.fromkeys(
                str(source.get("document", ""))[:180]
                for source in (sources or [])
                if source.get("document")
            )),
        ))
        db.commit()
    except Exception as exc:
        if db is not None:
            try:
                db.rollback()
            except Exception as rollback_exc:
                logger.error(
                    "Could not roll back chatbot telemetry session (%s)",
                    type(rollback_exc).__name__,
                )
        logger.error("Could not persist chatbot telemetry event (%s)", type(exc).__name__)
    finally:
        if db is not None:
            try:
                db.close()
            except Exception as close_exc:
                logger.error(
                    "Could not close chatbot telemetry database session (%s)",
                    type(close_exc).__name__,
                )


@router.get("/health")
def chatbot_health():
    return {"status": "available", "service": "chatbot"}


@router.post("/ask")
def ask_chatbot(
    request: ChatRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    _current_user=Depends(require_role("user")),
):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question cannot be empty.")

    started = time.perf_counter()
    try:
        requested_thread_id = request.thread_id or request.session_id
        conversation = None
        if requested_thread_id:
            conversation = db.query(ChatConversation).filter(
                ChatConversation.thread_id == requested_thread_id,
            ).first()
            if conversation is not None and conversation.user_id != _current_user.id:
                raise HTTPException(status_code=404, detail="Conversation not found.")
            if conversation is None and request.thread_id:
                raise HTTPException(status_code=404, detail="Conversation not found.")
            if conversation is None:
                # Legacy session_id clients may already hold a tab ID created before
                # conversation persistence was deployed. Claim it for this user once.
                conversation = ChatConversation(
                    thread_id=requested_thread_id,
                    user_id=_current_user.id,
                    title="New chat",
                )
                db.add(conversation)
                db.commit()
                db.refresh(conversation)
        else:
            conversation = ChatConversation(
                thread_id=str(uuid.uuid4()),
                user_id=_current_user.id,
                title="New chat",
            )
            db.add(conversation)
            db.commit()
            db.refresh(conversation)

        graph = getattr(http_request.app.state, "agent_graph", agent_graph)
        config = {"configurable": {"thread_id": conversation.thread_id}}
        previous_state = _thread_state(graph, conversation.thread_id)
        previous_messages = (previous_state.values or {}).get("messages", []) if previous_state else []
        is_first_message = not any(
            getattr(message, "type", "") == "ai" for message in previous_messages
        )
        retrying_pending_message = bool(
            previous_messages
            and getattr(previous_messages[-1], "type", "") == "human"
            and previous_messages[-1].content == question
        )
        graph_result = graph.invoke({
             "question": question,
            "user_id": _current_user.id,
             "messages": [] if retrying_pending_message else [HumanMessage(content=question)],
        }, config=config)

        result = graph_result["answer"]

        if is_first_message:
            title = re.sub(r"\s+", " ", question).strip()[:120]
            conversation.title = title or "New chat"
        conversation.updated_at = datetime.now(timezone.utc)
        db.commit()

        if isinstance(result, dict):
            result = {**result, "thread_id": conversation.thread_id}
        else:
            result = {"answer": result, "thread_id": conversation.thread_id}
        
        elapsed_ms = (time.perf_counter() - started) * 1000
        sources = result.get("sources") or []
        fallback = result.get("answer") == FALLBACK_ANSWER or not sources
        _record_telemetry(
            question,
            "fallback" if fallback else "answered",
            elapsed_ms,
            sources=sources,
            fallback=fallback,
        )
        return result
    except HTTPException:
        raise
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        _record_telemetry(question, "error", elapsed_ms)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the question.",
        )


@router.get("/performance")
def chatbot_performance(
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=10),
    db: Session = Depends(get_db),
    _current_user=Depends(require_role("admin", "super_admin")),
):
    try:
        cutoff = datetime.utcnow() - timedelta(days=30)
        filtered = db.query(ChatbotTelemetry).filter(
            ChatbotTelemetry.created_at >= cutoff
        )
        total = filtered.count()
        source_responses = filtered.filter(ChatbotTelemetry.source_count > 0).count()
        fallbacks = filtered.filter(ChatbotTelemetry.fallback.is_(True)).count()
        failures = filtered.filter(ChatbotTelemetry.outcome == "error").count()
        average_latency = filtered.with_entities(func.avg(ChatbotTelemetry.latency_ms)).scalar()
        events = filtered.order_by(
            ChatbotTelemetry.created_at.desc(), ChatbotTelemetry.id.desc()
        ).offset(offset).limit(limit).all()
    except SQLAlchemyError as exc:
        logger.error("Could not load chatbot performance telemetry (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Chatbot telemetry storage is unavailable.",
        ) from exc
    return {
        "range_days": 30,
        "total_requests": total,
        "responses_with_sources": source_responses,
        "fallback_responses": fallbacks,
        "failed_requests": failures,
        "average_latency_ms": round(average_latency, 1) if average_latency is not None else None,
        "has_more": offset + len(events) < total,
        "recent_queries": [
            {
                "id": event.id,
                "timestamp": event.created_at,
                "question_preview": event.question_preview,
                "outcome": event.outcome,
                "source_count": event.source_count,
                "sources": event.source_names or [],
                "latency_ms": round(event.latency_ms, 1),
            }
            for event in events
        ],
    }
