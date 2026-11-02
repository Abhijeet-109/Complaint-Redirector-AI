
import logging

from langgraph.graph import StateGraph, START, END

from backend.agents.graph_state import GraphState

from backend.agents.supervisor_agent import (
    select_route,
    supervisor_route,
)

from backend.agents.knowledge_agent import run_knowledge_rag
from backend.agents.product_agent import run_product_agent
from backend.agents.order_agent import run_order_agent


logger = logging.getLogger(__name__)


def supervisor_node(state: GraphState):

    logger.info("[SUPERVISOR] Supervisor activated.")

    request = state["user_input"]

    route = select_route(request.question)

    logger.info("[SUPERVISOR] Selected route: %s", route)

    return {
        "route": route
    }


def knowledge_node(state: GraphState):

    logger.info("[KNOWLEDGE_AGENT] Activated.")

    request = state["user_input"]

    result = run_knowledge_rag(
        question=request.question,
        session_id=request.session_id,
    )

    return {
        "answer": result
    }


def product_node(state: GraphState):

    logger.info("[PRODUCT_AGENT] Activated.")

    request = state["user_input"]

    result = run_product_agent(
        question=request.question,
    )

    return {
        "answer": result
    }


def order_node(state: GraphState):

    logger.info("[ORDER_AGENT] Activated.")

    request = state["user_input"]

    user_id = state["user_id"]

    result = run_order_agent(
        question=request.question,
        user_id=user_id,
    )

    return {
        "answer": result
    }


def build_graph():

    graph = StateGraph(GraphState)

    # Register nodes
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("knowledge", knowledge_node)
    graph.add_node("product", product_node)
    graph.add_node("order", order_node)

    # Entry point
    graph.add_edge(START, "supervisor")

    # Supervisor routing
    graph.add_conditional_edges(
        "supervisor",
        supervisor_route,
        {
            "knowledge": "knowledge",
            "product": "product",
            "order": "order",
        }
    )

    # Specialist agents terminate the graph
    graph.add_edge("knowledge", END)
    graph.add_edge("product", END)
    graph.add_edge("order", END)

    return graph.compile()


agent_graph = build_graph()


if __name__ == "__main__":
    print(agent_graph.get_graph().draw_ascii())
