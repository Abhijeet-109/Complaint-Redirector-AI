
from backend.chatbot.answer_pipeline import answer_question


def run_knowledge_rag(
    question: str,
    session_id: str,
) -> dict:
    """Execute the existing RAG pipeline and return its result."""

    return answer_question(
        question=question,
        session_id=session_id,
    )
