"""Support agent implementation and execution logic."""

from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.support.tools import build_support_tools
from backend.agents.support.prompts import SUPPORT_SYSTEM_PROMPT
from backend.agents.response_schema import text_response


def build_support_agent():
    return create_agent(
        model=get_model("support"),
        tools=build_support_tools(),
        system_prompt=SUPPORT_SYSTEM_PROMPT,
    )


def run_support_agent(
    question: str,
    chat_history=None,
) -> dict:

    support_agent = build_support_agent()

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": question,
    })

    result = support_agent.invoke({
        "messages": messages,
    })

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve support information right now."
    return text_response("support", answer)