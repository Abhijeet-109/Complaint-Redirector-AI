
from backend.chatbot.answer_pipeline import answer_question
from backend.agents.response_schema import text_response


def run_knowledge_rag(
    question: str,
    chat_history,
) -> dict:
    """Execute the existing RAG pipeline and return its result."""

    result = answer_question(
        question=question,
        chat_history=chat_history,
    )
    answer = result.get("answer") if isinstance(result, dict) else result
    return text_response("knowledge", answer if isinstance(answer, str) else "I couldn't determine an answer from the available information.")
