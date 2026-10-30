
from backend.agents.model_factory import get_model


def select_route(question: str) -> str:
    model = get_model("supervisor")

    prompt = f"""
You are the supervisor of a multi-agent e-commerce support system.

Select the most appropriate specialist agent.

Available agents:

- knowledge:
  Handles questions about company information, policies,
  uploaded documents, and general knowledge-base content.

- order:
  Handles questions about customer orders, order details,
  order history, payment status, shipping status,
  and delivery information.

User question:
{question}

Return only one agent name:
knowledge
order

Do not provide explanations.
"""

    response = model.invoke(prompt)

    route = response.content.strip().lower()

    if route not in ["knowledge", "order"]:
        raise ValueError(f"Invalid supervisor route: {route}")

    return route


def supervisor_route(state: dict) -> str:
    route = state.get("route")

    if route in ["knowledge", "order"]:
        return route

    raise ValueError(f"Invalid supervisor route: {route}")
