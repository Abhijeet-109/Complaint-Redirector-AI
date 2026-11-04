import logging

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import StateGraph, START, END

from backend.agents.graph_state import GraphState

from backend.agents.supervisor_agent import (
    select_route,
    supervisor_route,
)

from backend.agents.knowledge_agent import run_knowledge_rag
from backend.agents.product_agent import run_product_agent
from backend.agents.cart_agent import run_cart_agent
from backend.agents.order_agent import run_order_agent
from backend.agents.shipping_agent import run_shipping_agent
from backend.agents.returns_agent import run_returns_agent
from backend.agents.support_agent import run_support_agent


logger = logging.getLogger(__name__)


def _question(state: GraphState) -> str:
    request = state.get("user_input")
    return request.question if request is not None else state["question"]


def supervisor_node(state: GraphState):

    logger.info("[SUPERVISOR] Activated.")

    route = select_route(_question(state))

    logger.info("[SUPERVISOR] Selected route: %s", route)

    return {
        "route": route
    }



def knowledge_node(state: GraphState):

    logger.info("[KNOWLEDGE_AGENT] Activated.")

    result = run_knowledge_rag(
        question=_question(state),
        chat_history=state.get("messages", []),
    )

    return {
        "answer": result
    }


def record_assistant_message(state: GraphState):
    answer = state.get("answer")
    if isinstance(answer, dict):
        content = answer.get("answer") or str(answer)
    else:
        content = str(answer or "")
    return {
        "messages": [
            HumanMessage(content=_question(state)),
            AIMessage(content=content),
        ],
        "last_request_id": state.get("request_id"),
    }


def product_node(state: GraphState):

    logger.info("[PRODUCT_AGENT] Activated.")

    result = run_product_agent(
        question=_question(state),
    )

    return {
        "answer": result
    }



def cart_node(state: GraphState):

    logger.info("[CART_AGENT] Activated.")

    user_id = state["user_id"]

    result = run_cart_agent(
        question=_question(state),
        user_id=user_id,
    )

    return {
        "answer": result
    }


def order_node(state: GraphState):

    logger.info("[ORDER_AGENT] Activated.")

    user_id = state["user_id"]

    result = run_order_agent(
        question=_question(state),
        user_id=user_id,
    )

    return {
        "answer": result
    }


def shipping_node(state: GraphState):

    logger.info("[SHIPPING_AGENT] Activated.")

    user_id = state["user_id"]

    result = run_shipping_agent(
        question=_question(state),
        user_id=user_id,
    )

    return {
        "answer": result
    }



def returns_node(state: GraphState):

    logger.info("[RETURNS_AGENT] Activated.")

    user_id = state["user_id"]

    result = run_returns_agent(
        question=_question(state),
        user_id=user_id,
    )

    return {
        "answer": result
    }



def support_node(state: GraphState):

    logger.info("[SUPPORT_AGENT] Activated.")

    result = run_support_agent(
        question=_question(state),
    )

    return {
        "answer": result
    }



def build_graph(checkpointer=None):

    graph = StateGraph(GraphState)

    graph.add_node("supervisor", supervisor_node)

    graph.add_node("knowledge", knowledge_node)
    graph.add_node("product", product_node)
    graph.add_node("cart", cart_node)
    graph.add_node("order", order_node)
    graph.add_node("shipping", shipping_node)
    graph.add_node("returns", returns_node)
    graph.add_node("support", support_node)

    graph.add_edge(START, "supervisor")

    graph.add_conditional_edges(
        "supervisor",
        supervisor_route,
        {
            "knowledge": "knowledge",
            "product": "product",
            "cart": "cart",
            "order": "order",
            "shipping": "shipping",
            "returns": "returns",
            "support": "support",
        }
    )

    graph.add_node("record_assistant_message", record_assistant_message)

    for agent in [
        "knowledge",
        "product",
        "cart",
        "order",
        "shipping",
        "returns",
        "support",
    ]:
        graph.add_edge(agent, "record_assistant_message")
    graph.add_edge("record_assistant_message", END)

    return graph.compile(checkpointer=checkpointer)


agent_graph = build_graph()


if __name__ == "__main__":

    print(agent_graph.get_graph().draw_ascii())
