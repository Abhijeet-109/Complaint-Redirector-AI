"""Returns agent implementation and execution logic."""

from langchain.agents import create_agent
from langchain_core.messages import ToolMessage
import json
import re

from backend.agents.model_factory import get_model
from backend.agents.returns.tools import build_returns_tools
from backend.agents.returns.prompts import RETURNS_SYSTEM_PROMPT
from backend.agents.response_builder import build_agent_response


def build_returns_agent(user_id: int, thread_id=None, order_id=None, order_item_id=None):
    tools = build_returns_tools(user_id, thread_id, order_id, order_item_id)
    return create_agent(
        model=get_model("returns"),
        tools=tools,
        system_prompt=RETURNS_SYSTEM_PROMPT,
    )


def run_returns_agent(
    question: str,
    user_id: int,
    chat_history=None,
    thread_id=None,
    order_id=None,
    order_item_id=None,
) -> dict:

    returns_agent = build_returns_agent(user_id, thread_id, order_id, order_item_id)

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": (
            f"Selected purchased item context: order_id={order_id}, order_item_id={order_item_id}.\n{question}"
            if order_id is not None or order_item_id is not None else question
        ),
    })

    result = returns_agent.invoke({
        "messages": messages,
    })

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve return requests right now."
    if isinstance(answer, str) and re.search(
        r"\b(submitted successfully|request has been submitted|your request id is)\b",
        answer, re.IGNORECASE,
    ):
        confirmed = False
        for message in messages:
            if not isinstance(message, ToolMessage) or message.name != "submit_my_return_request":
                continue
            try:
                payload = message.content if isinstance(message.content, dict) else json.loads(message.content)
            except (TypeError, ValueError):
                continue
            if isinstance(payload, dict) and payload.get("success") is True and payload.get("return_request_id"):
                confirmed = True
        if not confirmed:
            answer = "I couldn't confirm that your return or replacement request was submitted."
    return build_agent_response("returns", messages, answer)
