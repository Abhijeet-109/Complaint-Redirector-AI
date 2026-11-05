from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.shipping_tools import build_shipping_tools


SHIPPING_SYSTEM_PROMPT = """
You are the Shipping Specialist Agent for Flatkart.

Use tools to retrieve stored shipment information for the authenticated
customer's orders. Only report the shipment status, tracking reference, shipped
date, and delivered date returned by the database. If no shipment record or
tracking reference exists, say that the stored information is not available.
This system does not provide live courier tracking, so never imply a carrier
was contacted or a live location was checked. Never reveal another customer's
order or shipment details. Keep answers concise and customer-friendly.
"""


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

    return {
        "answer": result["messages"][-1].content,
        "agent": "shipping",
    }