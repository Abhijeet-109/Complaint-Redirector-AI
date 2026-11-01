
import logging

from langgraph.graph import StateGraph, START, END

from backend.agents.graph_state import GraphState

from backend.agents.supervisor_agent import (
    select_route,
    supervisor_route,
)

from backend.agents.knowledge_agent import run_knowledge_rag
from backend.agents.order_agent import run_order_agent


logger = logging.getLogger(__name__)


def supervisor_node(state: GraphState):
    logger.info("[SUPERVISOR] Supervisor agent activated.")

    try:
        request = state["user_input"]

        route = select_route(request.question)

        logger.info("[SUPERVISOR] Routing decision: %s", route)

        return {
            "route": route
        }

    except Exception:
        logger.exception("[SUPERVISOR] Supervisor execution failed.")
        raise


def knowledge_node(state: GraphState):
    logger.info("[KNOWLEDGE_AGENT] Knowledge agent activated.")

    try:
        request = state["user_input"]

        result = run_knowledge_rag(
            question=request.question,
            session_id=request.session_id,
        )

        logger.info("[KNOWLEDGE_AGENT] Knowledge agent execution completed.")

        return {
            "answer": result
        }

    except Exception:
        logger.exception("[KNOWLEDGE_AGENT] Knowledge agent execution failed.")
        raise


def order_node(state: GraphState):
    logger.info("[ORDER_AGENT] Order agent activated.")

    try:
        request = state["user_input"]

        result = run_order_agent(
            question=request.question,
        )

        logger.info("[ORDER_AGENT] Order agent execution completed.")

        return {
            "answer": result
        }

    except Exception:
        logger.exception("[ORDER_AGENT] Order agent execution failed.")
        raise


def build_graph():

    graph = StateGraph(GraphState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("knowledge", knowledge_node)
    graph.add_node("order", order_node)

    graph.add_edge(START, "supervisor")

    graph.add_conditional_edges(
        "supervisor",
        supervisor_route,
        {
            "knowledge": "knowledge",
            "order": "order",
        }
    )

    graph.add_edge("knowledge", END)
    graph.add_edge("order", END)

    return graph.compile()


agent_graph = build_graph()


if __name__ == "__main__":
    print(agent_graph.get_graph().draw_ascii())
