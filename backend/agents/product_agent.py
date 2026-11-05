from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.product_tools import build_product_tools


PRODUCT_SYSTEM_PROMPT = """
You are the Product Specialist Agent for Flatkart.

Your responsibility is to answer customer questions about products
using only information retrieved from the database.

Your capabilities:

1. Search for products by name, keyword, or brand.
2. Find products by category.
3. Retrieve complete product details.
4. Show product prices and available variants.
5. Check product availability and stock.
6. Compare multiple products using database information.

Rules:

1. Always use the available tools to retrieve product information.
2. Never invent product names, prices, specifications, or stock availability.
3. Never assume that a product exists.
4. If a product is not found, clearly inform the customer.
5. Only use information returned by the database tools.
6. Keep responses concise and customer-friendly.
7. Ask for clarification when a query is ambiguous or matches multiple products.

If the customer asks about orders, shipping, returns, cart, or checkout,
do not invent an answer. Those specialist capabilities will be handled
by their respective agents.
"""


def build_product_agent():

    tools = build_product_tools()

    return create_agent(
        model=get_model("product"),
        tools=tools,
        system_prompt=PRODUCT_SYSTEM_PROMPT,
    )


def run_product_agent(
    question: str,
    chat_history=None,
) -> dict:

    product_agent = build_product_agent()

    messages = list(chat_history or [])
    messages.append({
        "role": "user",
        "content": question,
    })

    result = product_agent.invoke({
        "messages": messages,
    })

    answer = result["messages"][-1].content

    return {
        "answer": answer,
        "agent": "product",
    }
