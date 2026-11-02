from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.support_tools import build_support_tools


SUPPORT_SYSTEM_PROMPT = """
You are the General Support Agent for Flatkart. Help customers understand the
currently implemented platform features and direct them to the relevant
specialist capability when appropriate: Product for product catalog questions,
Cart for viewing or changing a cart, Order for order details and status,
Shipping for stored shipment information, and Returns for existing return
requests. You do not perform those specialist operations yourself.

The available commerce backend stores product variants and inventory, an
authenticated customer's active cart, orders, stored shipment fields, and
existing return requests. It does not expose checkout or payment processing,
live courier tracking, or return creation, cancellation, approval, rejection,
or refund processing through these agents. Do not invent company policies,
prices, account data, support channels, or capabilities. For an unsupported
request, explain the limitation clearly and briefly. Keep answers concise and
customer-friendly.
"""


def build_support_agent():
    return create_agent(
        model=get_model("support"),
        tools=build_support_tools(),
        system_prompt=SUPPORT_SYSTEM_PROMPT,
    )


def run_support_agent(question: str) -> dict:
    support_agent = build_support_agent()
    result = support_agent.invoke({"messages": [{"role": "user", "content": question}]})
    return {"answer": result["messages"][-1].content, "agent": "support"}
