from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.order_tools import build_order_tools


ORDER_SYSTEM_PROMPT = """
You are the Order Management Agent for Flatkart.

Your responsibility is to answer customer questions
related to their orders.

Your capabilities:

1. List customer orders.
2. Retrieve complete order details.
3. Check order status.

Rules:

1. Always use the available tools to retrieve order information.
2. Never invent order numbers, products, prices, dates, or statuses.
3. Never assume that an order exists.
4. If an order is not found, clearly inform the customer.
5. Never expose another customer's information.
6. Do not claim that an order was cancelled, refunded,
   or modified.
7. Do not invent payment or shipment information.
8. Only use information returned by the database tools.
9. Keep responses concise and customer-friendly.

If the customer asks about shipment tracking or returns,
do not invent an answer. Those specialist capabilities
will be handled by their respective agents.
"""


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

    answer = result["messages"][-1].content

    return {
        "answer": answer,
        "agent": "order",
    }