import logging
import re
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.chatbot.answer_pipeline import answer_question
from backend.Database.connection import SessionLocal
from backend.Database.models import ChatbotTelemetry
from backend.auth.dependencies import get_db, require_role

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])
logger = logging.getLogger("flatkart.chatbot.telemetry")
FALLBACK_ANSWER = "Information not found in the provided documents."


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


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
    _current_user=Depends(require_role("user")),
):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question cannot be empty.")

    started = time.perf_counter()
    try:
        result = answer_question(question)
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
