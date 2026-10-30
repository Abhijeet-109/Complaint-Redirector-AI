from backend.api.routes.chatbot import ChatRequest
from backend.agents.agent_graph import agent_graph


def test_knowledge_agent_flow():

    request = ChatRequest(
        question="What information is available about the company?",
        session_id="graph-test-001",
    )

    result = agent_graph.invoke({
        "user_input": request
    })

    print("\nSupervisor Route:", result["route"])
    print("\nFinal Answer:", result["answer"]["answer"])
    print("\nSources:", result["answer"]["sources"])

    assert result["route"] == "knowledge"
    assert "answer" in result
    assert "sources" in result["answer"]

if __name__ == "__main__":
    test_knowledge_agent_flow()