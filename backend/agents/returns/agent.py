"""Returns agent implementation and execution logic."""

from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.returns.tools import build_returns_tools
from backend.agents.returns.prompts import RETURNS_SYSTEM_PROMPT
from backend.agents.response_builder import build_agent_response


def build_returns_agent(user_id: int):
    tools = build_returns_tools(user_id)
    return create_agent(
        model=get_model("returns"),
        tools=tools,
        system_prompt=RETURNS_SYSTEM_PROMPT,
    )


def run_returns_agent(
    question: str,
    user_id: int,
    chat_history=None,
) -> dict:

    returns_agent = build_returns_agent(user_id)

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": question,
    })

    result = returns_agent.invoke({
        "messages": messages,
    })

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve return requests right now."
    return build_agent_response("returns", messages, answer)