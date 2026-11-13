"""Order agent implementation and execution logic."""

from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.order.tools import build_order_tools
from backend.agents.order.prompts import ORDER_SYSTEM_PROMPT
from backend.agents.response_builder import build_agent_response


def build_order_agent(user_id: int):

    tools = build_order_tools(user_id)

    return create_agent(
        model=get_model("order"),
        tools=tools,
        system_prompt=ORDER_SYSTEM_PROMPT,
    )


def run_order_agent(
    question: str,
    user_id: int,
    chat_history=None,
) -> dict:

    order_agent = build_order_agent(user_id)

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": question,
    })

    result = order_agent.invoke({
        "messages": messages,
    })

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve your orders right now."
    return build_agent_response("order", messages, answer)