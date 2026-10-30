
from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.order_tools import (
    list_my_orders,
    get_order_details,
    get_order_status,
)


ORDER_TOOLS = [
    list_my_orders,
    get_order_details,
    get_order_status,
]


ORDER_SYSTEM_PROMPT = """
You are the Order Management Agent for an e-commerce platform.

Your responsibility is to answer customer questions about their orders.

Available capabilities:
- List the customer's orders.
- Retrieve complete order details.
- Check order and delivery status.

Instructions:

1. Use the available tools to retrieve order information.
2. Never invent order IDs, products, prices, statuses, or delivery dates.
3. Never answer order-related questions using assumptions.
4. If an order is not found, clearly inform the customer.
5. Never expose information belonging to another customer.
6. Do not claim that an order has been cancelled, refunded, or modified.
7. The current order dataset is temporary mock data.
8. Clearly disclose that the information comes from demonstration data.
9. Keep responses concise and customer-friendly.
"""


order_agent = create_agent(
    model=get_model("order"),
    tools=ORDER_TOOLS,
    system_prompt=ORDER_SYSTEM_PROMPT,
)


def run_order_agent(question: str) -> dict:
    """Execute the Order Management Agent."""

    result = order_agent.invoke({
        "messages": [
            {
                "role": "user",
                "content": question,
            }
        ]
    })

    answer = result["messages"][-1].content

    return {
        "answer": answer,
        "data_source": "MOCK_ORDER_DATA",
    }
