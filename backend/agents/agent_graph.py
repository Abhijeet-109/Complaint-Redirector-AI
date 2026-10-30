from langgraph.graph import StateGraph, START, END

from backend.agents.graph_state import GraphState

from backend.agents.supervisor_agent import (
    select_route,
    supervisor_route,
)

from backend.agents.knowledge_agent import run_knowledge_rag
from backend.agents.order_agent import run_order_agent


def supervisor_node(state: GraphState):
    request = state["user_input"]

    route = select_route(request.question)

    return {
        "route": route
    }


def knowledge_node(state: GraphState):
    request = state["user_input"]

    result = run_knowledge_rag(
        question=request.question,
        session_id=request.session_id,
    )

    return {
        "answer": result
    }


def order_node(state: GraphState):
    request = state["user_input"]

    result = run_order_agent(
        question=request.question,
    )

    return {
        "answer": result
    }


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
