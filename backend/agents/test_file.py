
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

    assert result["route"] == "knowledge"
    assert "answer" in result

    print("\nKnowledge Agent:", result["answer"])


def test_order_agent_flow():

    request = ChatRequest(
        question="Show me all my orders.",
        session_id="graph-test-002",
    )

    result = agent_graph.invoke({
        "user_input": request
    })

    assert result["route"] == "order"
    assert "answer" in result
    assert result["answer"]["data_source"] == "MOCK_ORDER_DATA"

    print("\nOrder Agent:", result["answer"])


if __name__ == "__main__":
    test_knowledge_agent_flow()
    test_order_agent_flow()

    print("\nAll graph tests passed.")
