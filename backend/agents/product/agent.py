"""Product agent implementation and execution logic."""

from langchain.agents import create_agent

from backend.agents.model_factory import get_model
from backend.agents.product.tools import build_product_tools
from backend.agents.product.prompts import PRODUCT_SYSTEM_PROMPT
from backend.agents.response_builder import build_agent_response


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

    messages = result.get("messages", [])
    answer = messages[-1].content if messages else "I couldn't retrieve product information right now."
    return build_agent_response("product", messages, answer)