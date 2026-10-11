
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.chatbot.answer_pipeline import answer_question

router = APIRouter(
    prefix="/chatbot",
    tags=["Chatbot"]
)


class ChatRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=2000
    )


@router.get("/health")
def chatbot_health():
    return {
        "status": "available",
        "service": "chatbot"
    }


@router.post("/ask")
def ask_chatbot(request: ChatRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=422,
            detail="Question cannot be empty."
        )

    try:
        result = answer_question(question)
        return result

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the question."
        )
