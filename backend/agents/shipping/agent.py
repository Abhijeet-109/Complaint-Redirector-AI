"""Shipping agent implementation and execution logic."""

from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.shipping.tools import build_shipping_tools
from backend.agents.shipping.prompts import SHIPPING_SYSTEM_PROMPT
from backend.agents.response_builder import build_agent_response


def build_shipping_agent(user_id: int):
    tools = build_shipping_tools(user_id)
    return create_agent(
        model=get_model("shipping"),
        tools=tools,
        system_prompt=SHIPPING_SYSTEM_PROMPT,
    )


def run_shipping_agent(
    question: str,
    user_id: int,
    chat_history=None,
) -> dict:

    shipping_agent = build_shipping_agent(user_id)

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": question,
    })

    result = shipping_agent.invoke({
        "messages": messages,
    })

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve shipment information right now."
    return build_agent_response("shipping", messages, answer)