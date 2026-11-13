import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.chatbot.answer_pipeline import (
    answer_question,
    detect_obvious_security_request,
)
from backend.Database.connection import SessionLocal
from backend.Database.models import (
    ChatbotTelemetry, ChatConversation, CommerceOrder, CommerceOrderItem, ReturnEvidence,
)
from backend.Database.return_evidence_storage import (
    MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES, clear_staged_evidence,
    list_staged_evidence, stage_evidence,
)
from backend.auth.dependencies import get_db, require_role
from backend.agents.agent_graph import agent_graph
from backend.agents.response_schema import AgentResponse, STRUCTURED_RESPONSE_KEY, text_response

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])
logger = logging.getLogger("flatkart.chatbot.telemetry")
FALLBACK_ANSWER = "Information not found in the provided documents."


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    thread_id: str | None = Field(None, min_length=1, max_length=255)
    # Kept for clients deployed before conversation IDs were introduced.
    session_id: str | None = Field(None, min_length=1, max_length=100)
    # Reuse this value when retrying a request whose response may have been lost.
    request_id: str | None = Field(None, min_length=1, max_length=255)
    order_id: int | None = Field(None, gt=0)
    order_item_id: int | None = Field(None, gt=0)
    new_return_intake: bool = False


class ConversationCreateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)


def _conversation_payload(conversation):
    return {
        "thread_id": conversation.thread_id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
    }


def _validated_response(value, *, fallback_agent="support"):
    try:
        return AgentResponse.model_validate(value).as_json()
    except Exception:
        if isinstance(value, dict) and isinstance(value.get("answer"), str):
            answer = value["answer"]
        elif isinstance(value, str):
            answer = value
        else:
            answer = "I couldn't process that request."
        return text_response(fallback_agent, answer)


def _conversation_message(message):
    role = "assistant" if getattr(message, "type", "") == "ai" else "user"
    item = {
        "role": role,
        "content": message.content if isinstance(message.content, str) else str(message.content),
    }
    if role == "assistant":
        metadata = (getattr(message, "additional_kwargs", {}) or {}).get(STRUCTURED_RESPONSE_KEY)
        if metadata is not None:
            try:
                item["structured_response"] = AgentResponse.model_validate(metadata).as_json()
            except Exception:
                # A legacy or malformed value must not block history loading.
                pass
    return item


def _get_owned_conversation(db, thread_id, user_id, *, lock=False):
    query = db.query(ChatConversation).filter(
        ChatConversation.thread_id == thread_id,
        ChatConversation.user_id == user_id,
    )
    if lock:
        query = query.with_for_update()
    conversation = query.first()
    if conversation is None or (conversation.delete_pending and not lock):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


def _thread_state(graph, thread_id):
    if getattr(graph, "checkpointer", None) is None:
        return None
    return graph.get_state({"configurable": {"thread_id": thread_id}})


def _completed_request_values(graph, config, request_id, current_values):
    if not request_id:
        return None
    if current_values.get("last_request_id") == request_id and current_values.get("answer") is not None:
        return current_values
    if getattr(graph, "checkpointer", None) is None or not callable(getattr(graph, "get_state_history", None)):
        return None
    for snapshot in graph.get_state_history(config):
        values = snapshot.values or {}
        if values.get("last_request_id") == request_id and values.get("answer") is not None:
            return values
    return None


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
        ChatConversation.delete_pending.is_(False),
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
            _conversation_message(message)
            for message in messages
            if getattr(message, "type", "") in {"human", "ai"}
        ],
    }


@router.delete("/conversations/{thread_id}", status_code=204)
def delete_conversation(
    thread_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("user")),
):
    conversation = _get_owned_conversation(db, thread_id, current_user.id, lock=True)
    checkpointer = getattr(request.app.state, "chat_checkpointer", None)
    conversation.delete_pending = True
    db.commit()
    try:
        _finish_conversation_deletion(db, conversation, checkpointer)
    except Exception as exc:
        db.rollback()
        logger.warning("Conversation deletion is pending recovery (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Conversation deletion could not finish and will be retried.") from exc
    return None


def _finish_conversation_deletion(db, conversation, checkpointer):
    if checkpointer is not None:
        checkpointer.delete_thread(conversation.thread_id)
    staged = list_staged_evidence(conversation.user_id, conversation.thread_id)
    committed_keys = db.query(ReturnEvidence.storage_key).filter(
        ReturnEvidence.storage_key.in_([item.get("storage_key") for item in staged])
    ).all() if staged else []
    clear_staged_evidence(staged, (row[0] for row in committed_keys))
    db.delete(conversation)
    db.commit()


def recover_pending_conversation_deletions(db, checkpointer=None) -> int:
    """Finish durable deletion tombstones after interruptions or storage failures."""
    recovered = 0
    while True:
        conversation = db.query(ChatConversation).filter(
            ChatConversation.delete_pending.is_(True),
        ).with_for_update(skip_locked=True).first()
        if conversation is None:
            break
        try:
            _finish_conversation_deletion(db, conversation, checkpointer)
            recovered += 1
        except Exception as exc:
            db.rollback()
            logger.warning("Pending conversation deletion recovery failed (%s)", type(exc).__name__)
            break
    return recovered


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


@router.post("/returns/evidence", status_code=202)
def upload_chat_return_evidence(
    http_request: Request,
    thread_id: str,
    order_id: int,
    order_item_id: int,
    return_submission_key: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("user")),
):
    """Stage private evidence for an owned conversation and purchased order line."""
    conversation = db.query(ChatConversation).filter(
        ChatConversation.thread_id == thread_id,
        ChatConversation.user_id == current_user.id,
    ).with_for_update().first()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if conversation.delete_pending:
        raise HTTPException(status_code=409, detail="Conversation is being deleted.")
    order = db.query(CommerceOrder).filter(
        CommerceOrder.id == order_id, CommerceOrder.user_id == current_user.id,
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    item = db.query(CommerceOrderItem.id).filter(
        CommerceOrderItem.id == order_item_id, CommerceOrderItem.order_id == order.id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Order item not found.")
    try:
        return_submission_key = str(uuid.UUID(return_submission_key))
    except (AttributeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="A valid return intake key is required.") from exc
    graph = getattr(http_request.app.state, "agent_graph", agent_graph)
    state = _thread_state(graph, thread_id)
    state_key = ((state.values or {}).get("return_submission_key") if state else None)
    if state_key != return_submission_key:
        raise HTTPException(status_code=409, detail="Return intake is no longer active. Start or continue the current intake.")
    try:
        staged = list_staged_evidence(current_user.id, thread_id)
    except Exception as exc:
        logger.error("Could not inspect staged return evidence (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Evidence storage is unavailable.") from exc
    if not files or len(staged) + len(files) > MAX_EVIDENCE_FILES:
        raise HTTPException(status_code=400, detail="Upload between 1 and 5 evidence images per request.")
    results = []
    for upload in files:
        try:
            data = upload.file.read(MAX_EVIDENCE_BYTES + 1)
            metadata = stage_evidence(data, upload.filename or "", upload.content_type or "",
                                      current_user.id, thread_id, order_id, order_item_id,
                                      return_submission_key)
            results.append({"status": "pending_submission", **metadata})
        except ValueError as exc:
            results.append({"status": "failed", "filename": upload.filename or "",
                            "message": str(exc)})
        except Exception as exc:
            logger.error("Chat evidence upload failed (%s)", type(exc).__name__)
            results.append({"status": "failed", "filename": upload.filename or "",
                            "message": "This image could not be uploaded. Please retry."})
    db.commit()
    return {"status": "pending_submission" if any(item["status"] == "pending_submission" for item in results)
            else "failed", "thread_id": thread_id,
            "order_id": order_id, "order_item_id": order_item_id, "files": results}


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
    if (request.order_id is None) != (request.order_item_id is None):
        raise HTTPException(status_code=422, detail="Provide both order_id and order_item_id.")
    if request.new_return_intake and request.order_id is None:
        raise HTTPException(status_code=422, detail="A new return intake requires order and item context.")
    if request.order_id is not None:
        owned_order = db.query(CommerceOrder.id).filter(
            CommerceOrder.id == request.order_id,
            CommerceOrder.user_id == _current_user.id,
        ).first()
        owned_item = db.query(CommerceOrderItem.id).filter(
            CommerceOrderItem.id == request.order_item_id,
            CommerceOrderItem.order_id == request.order_id,
        ).first()
        if owned_order is None:
            raise HTTPException(status_code=404, detail="Order not found.")
        if owned_item is None:
            raise HTTPException(status_code=404, detail="Order item not found.")

    started = time.perf_counter()
    try:
        requested_thread_id = request.thread_id or request.session_id
        conversation = None
        if requested_thread_id:
            conversation = db.query(ChatConversation).filter(
                ChatConversation.thread_id == requested_thread_id,
            ).with_for_update().first()
            if conversation is not None and conversation.user_id != _current_user.id:
                raise HTTPException(status_code=404, detail="Conversation not found.")
            if conversation is not None and conversation.delete_pending:
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
                try:
                    db.commit()
                    db.refresh(conversation)
                except IntegrityError:
                    db.rollback()
                    conversation = db.query(ChatConversation).filter(
                        ChatConversation.thread_id == requested_thread_id,
                    ).with_for_update().first()
                    if conversation is None or conversation.user_id != _current_user.id:
                        raise HTTPException(status_code=404, detail="Conversation not found.")
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
        previous_values = (previous_state.values or {}) if previous_state else {}
        previous_messages = previous_values.get("messages", [])
        is_first_message = not any(
            getattr(message, "type", "") == "ai" for message in previous_messages
        )
        completed_request_values = _completed_request_values(
            graph, config, request.request_id, previous_values
        )
        if completed_request_values is not None:
            return_submission_key = completed_request_values.get("return_submission_key")
        elif request.new_return_intake:
            return_submission_key = str(uuid.uuid4())
        else:
            return_submission_key = previous_values.get("return_submission_key") or str(uuid.uuid4())
        
        prefilter_blocked = False

        if completed_request_values is not None:
            result = completed_request_values["answer"]

            if conversation.title == "New chat":
                first_user_message = next(
                    (
                        message.content
                        for message in previous_messages
                        if getattr(message, "type", "") == "human"
                    ),
                    question,
                )

                conversation.title = (
                    re.sub(r"\s+", " ", first_user_message).strip()[:120]
                    or "New chat"
                )

        else:
            prefilter_category = detect_obvious_security_request(question)

            if prefilter_category:
                prefilter_blocked = True

                logger.warning(
                    "[CHATBOT] Request blocked by regex input prefilter. "
                    "Category: %s",
                    prefilter_category,
                )

                result = text_response("guardrail", "Your request cannot be processed.")
                if callable(getattr(graph, "update_state", None)):
                    graph.update_state(
                        config,
                        {
                            "answer": result,
                            "last_request_id": request.request_id,
                            "messages": [
                                HumanMessage(content=question),
                                AIMessage(
                                    content=result["answer"],
                                    additional_kwargs={STRUCTURED_RESPONSE_KEY: result},
                                ),
                            ],
                        },
                    )

            else:
                graph_input = {
                    "question": question,
                    "user_id": _current_user.id,
                    "request_id": request.request_id,
                    "thread_id": conversation.thread_id,
                    "return_submission_key": return_submission_key,
                }
                if request.order_id is not None:
                    graph_input["order_id"] = request.order_id
                if request.order_item_id is not None:
                    graph_input["order_item_id"] = request.order_item_id
                graph_result = graph.invoke(graph_input, config=config)

                result = _validated_response(graph_result.get("answer"))

                if is_first_message:
                    title = re.sub(r"\s+", " ", question).strip()[:120]
                    conversation.title = title or "New chat"

        conversation.updated_at = datetime.now(timezone.utc)
        db.commit()

        meta = {
            "thread_id": conversation.thread_id,
            "title": conversation.title,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
            "return_submission_key": return_submission_key,
        }
        result = {**_validated_response(result), **meta}
        
        elapsed_ms = (time.perf_counter() - started) * 1000
        sources = []

        fallback = (
            not prefilter_blocked
            and (
                result.get("answer") == FALLBACK_ANSWER
            )
        )

        outcome = (
            "rejected"
            if prefilter_blocked
            else "fallback"
            if fallback
            else "answered"
        )

        _record_telemetry(
            question,
            outcome,
            elapsed_ms,
            sources=sources,
            fallback=fallback,
        )
        return result
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Could not process chatbot request (%s)", type(exc).__name__)
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
