"""Supervisor agent: route selection and execution logic."""

from backend.agents.model_factory import get_model
from backend.agents.supervisor.patterns import detect_intent_deterministic
from backend.agents.supervisor.prompts import SUPERVISOR_PROMPT
from backend.agents.supervisor.guardrails import validate_route, supervisor_route as guardrail_supervisor_route


def _format_chat_history(chat_history, max_messages=10):
    """Format recent LangGraph messages for supervisor routing."""

    formatted_messages = []

    for message in (chat_history or [])[-max_messages:]:
        message_type = getattr(message, "type", None)
        content = getattr(message, "content", "")

        if message_type not in {"human", "ai"}:
            continue

        if not isinstance(content, str):
            continue

        content = content.strip()

        if not content:
            continue

        speaker = "Customer" if message_type == "human" else "Assistant"

        formatted_messages.append(
            f"{speaker}: {content[:1200]}"
        )

    if not formatted_messages:
        return "No previous conversation is available."

    return "\n".join(formatted_messages)


def select_route(question: str, chat_history=None) -> str:
    """
    Select the appropriate agent route for the customer's question.
    First attempts deterministic pattern matching, then falls back to LLM.
    """

    # Try deterministic intent detection first
    deterministic_route = detect_intent_deterministic(question)
    if deterministic_route:
        return validate_route(deterministic_route)

    # Fall back to LLM-based routing
    model = get_model("supervisor")

    formatted_history = _format_chat_history(chat_history)

    response = model.invoke(
        SUPERVISOR_PROMPT.format(
            question=question,
            chat_history=formatted_history,
        )
    )

    route = response.content.strip().lower()

    return validate_route(route)


# Re-export for backward compatibility
__all__ = ["select_route", "supervisor_route"]
supervisor_route = guardrail_supervisor_route