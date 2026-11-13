"""Cart agent implementation and execution logic."""

from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.cart.tools import build_cart_tools
from backend.agents.cart.prompts import CART_SYSTEM_PROMPT
from backend.agents.response_builder import build_agent_response


def build_cart_agent(user_id: int):
    tools = build_cart_tools(user_id)
    return create_agent(
        model=get_model("cart"),
        tools=tools,
        system_prompt=CART_SYSTEM_PROMPT,
    )


def run_cart_agent(
    question: str,
    user_id: int,
    chat_history=None,
) -> dict:

    cart_agent = build_cart_agent(user_id)

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": question,
    })

    result = cart_agent.invoke({
        "messages": messages,
    })

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve your cart right now."
    return build_agent_response("cart", messages, answer)