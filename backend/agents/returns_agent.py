from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.returns_tools import build_returns_tools


RETURNS_SYSTEM_PROMPT = """
You are the Returns Specialist Agent for Flatkart.

Use the tools to retrieve existing return requests belonging to the
authenticated customer. Report only database returned request details and
status. If no request exists, say so clearly. The backend can read return
requests but does not create, cancel, approve, reject, or process returns or
refunds. Do not infer eligibility, policy, or an outcome from a request's
status. Keep answers concise and customer-friendly.
"""


def build_returns_agent(user_id: int):
    tools = build_returns_tools(user_id)
    return create_agent(
        model=get_model("returns"),
        tools=tools,
        system_prompt=RETURNS_SYSTEM_PROMPT,
    )


def run_returns_agent(question: str, user_id: int) -> dict:
    returns_agent = build_returns_agent(user_id)
    result = returns_agent.invoke({"messages": [{"role": "user", "content": question}]})
    return {"answer": result["messages"][-1].content, "agent": "returns"}
