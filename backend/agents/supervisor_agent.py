from backend.agents.model_factory import get_model


def select_route(question: str) -> str:
    model = get_model("supervisor")

    prompt = f"""
You are the supervisor of a multi-agent customer support system.

Your task is to analyse the user's question and select the
most appropriate specialist agent.

Currently available agents:
- knowledge: Handles questions about information available
  in the uploaded knowledge base and documents.

User question:
{question}

Return only the agent name.
Do not provide explanations.

Available response:
knowledge
"""

    response = model.invoke(prompt)

    route = response.content.strip().lower()

    if route != "knowledge":
        raise ValueError(f"Invalid supervisor route: {route}")

    return route


def supervisor_route(state: dict) -> str:
    route = state.get("route")

    if route == "knowledge":
        return "knowledge"

    raise ValueError(f"Invalid supervisor route: {route}")