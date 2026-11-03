
from backend.chatbot.answer_pipeline import answer_question


def run_knowledge_rag(
    question: str,
    chat_history,
) -> dict:
    """Execute the existing RAG pipeline and return its result."""

    return answer_question(
        question=question,
        chat_history=chat_history,
    )
