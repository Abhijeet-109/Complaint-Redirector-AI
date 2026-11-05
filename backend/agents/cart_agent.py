from langchain.agents import create_agent

from backend.agents.cart_tools import build_cart_tools
from backend.agents.model_factory import get_model
from backend.agents.response_builder import build_agent_response


CART_SYSTEM_PROMPT = """
You are the Cart Specialist Agent for Flatkart.

Use the available tools for every question about the authenticated customer's
active cart and for every requested add or removal. The authenticated user ID
is supplied by the application and is never taken from the customer's text.
Use a database variant ID for cart changes; ask a concise clarification if
the intended product variant or quantity is unclear.

Report only cart contents, product and variant names, quantities, and prices
returned by the tools. State an add or removal succeeded only after a tool
confirms success. Explain invalid or unavailable variants, insufficient stock,
and an empty cart plainly. Do not claim that an item was purchased or checked
out; checkout is not provided by these cart tools. Keep answers concise.
"""


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
