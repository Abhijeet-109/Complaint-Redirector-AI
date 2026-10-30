from langgraph.graph import StateGraph, START, END

from backend.agents.graph_state import GraphState
from backend.agents.supervisor_agent import supervisor_route
from backend.agents.knowledge_agent import run_knowledge_rag


def supervisor_node(state: GraphState):
    request = state["user_input"]

    route = supervisor_route(
        request.question
    )

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


def route_query(state: GraphState):
    return state["route"]


def build_graph():

    graph = StateGraph(GraphState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("knowledge", knowledge_node)

    graph.add_edge(START, "supervisor")

    graph.add_conditional_edges(
        "supervisor",
        route_query,
        {
            "knowledge": "knowledge"
        }
    )

    graph.add_edge("knowledge", END)

    return graph.compile()


agent_graph = build_graph()

agent_graph 