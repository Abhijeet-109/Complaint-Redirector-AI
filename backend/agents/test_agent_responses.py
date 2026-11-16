import json
import sys
import types
from types import SimpleNamespace
from unittest.mock import patch

from langchain_core.messages import AIMessage
_pipeline = types.ModuleType("backend.chatbot.answer_pipeline")
_pipeline.answer_question = lambda question, chat_history=None: {"answer": "Test knowledge answer", "sources": []}
_pipeline.detect_obvious_security_request = lambda question: None
sys.modules.setdefault("backend.chatbot.answer_pipeline", _pipeline)

from langchain_core.messages import ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph

from backend.agents.agent_graph import record_assistant_message
from backend.agents.graph_state import GraphState
from backend.agents.response_builder import build_agent_response
from backend.agents.response_schema import AgentResponse


def test_product_data_comes_from_named_tool_result_not_generated_answer():
    tool_result = {
        "success": True,
        "products": [{
            "product_id": 4,
            "name": "Stored Watch",
            "brand": "Example",
            "description": "Actual record",
            "variants": [{"variant_id": 8, "sku": "W-8", "name": "Black", "price": "1200.00", "is_available": True}],
        }],
    }
    messages = [ToolMessage(content=json.dumps(tool_result), name="search_products", tool_call_id="call-1")]

    response = build_agent_response("product", messages, "| Price |\n| --- |\n| ₹1.00 |")

    assert response["response_type"] == "product_list"
    assert response["data"]["products"][0]["variants"][0]["price"] == "1200.00"
    assert response["answer"] == "I found 1 matching product."
    assert "| Price |" not in response["answer"]
    AgentResponse.model_validate(response)


def test_latest_tool_operation_controls_type_and_failed_calls_fall_back_to_text():
    messages = [
        ToolMessage(content=json.dumps({"success": True, "products": [{"name": "Watch"}]}), name="search_products", tool_call_id="call-1"),
        ToolMessage(content=json.dumps({"success": False, "message": "missing"}), name="get_product_details", tool_call_id="call-2"),
    ]

    response = build_agent_response("product", messages, "No product was found.")

    assert response["response_type"] == "text"
    assert response["data"] is None

    malformed = ToolMessage(content="not-json", name="search_products", tool_call_id="call-3")
    response = build_agent_response("product", [malformed], "I couldn't retrieve products.")
    assert response["response_type"] == "text"


def test_multiple_calls_of_one_operation_aggregate_only_their_own_tool_data():
    messages = [
        ToolMessage(content=json.dumps({"success": True, "products": [{"name": "Watch"}]}), name="search_products", tool_call_id="call-1"),
        ToolMessage(content=json.dumps({"success": True, "products": [{"name": "Bag"}]}), name="search_products_by_category", tool_call_id="call-2"),
    ]
    response = build_agent_response("product", messages, "Verbose table omitted")
    assert [product["name"] for product in response["data"]["products"]] == ["Watch", "Bag"]
    assert response["answer"] == "I found 2 matching products."


def test_empty_structured_results_get_meaningful_summaries():
    cases = [
        ("search_products", {"success": True, "products": []}, "I couldn't find any matching products."),
        ("list_my_orders", {"success": True, "orders": []}, "You don't have any recent orders."),
        ("list_my_shipments", {"success": True, "shipments": []}, "No shipment information was found."),
        ("list_my_return_requests", {"success": True, "return_requests": []}, "You don't have any existing return requests."),
    ]
    for index, (tool_name, output, expected_answer) in enumerate(cases):
        message = ToolMessage(content=json.dumps(output), name=tool_name, tool_call_id=f"empty-{index}")
        response = build_agent_response("support", [message], "Verbose empty-result answer.")
        assert response["answer"] == expected_answer


def test_cart_mutation_requires_confirmed_tool_success():
    failed = ToolMessage(content=json.dumps({"success": False, "message": "not enough stock"}), name="add_item_to_my_cart", tool_call_id="call-1")
    response = build_agent_response("cart", [failed], "The item was added.")
    assert response["response_type"] == "text"
    assert response["data"] is None
    assert response["answer"] == "not enough stock"

    succeeded = ToolMessage(content=json.dumps({
        "success": True,
        "cart": {"items": [], "item_count": 0, "total": "0.00"},
    }), name="remove_item_from_my_cart", tool_call_id="call-2")
    response = build_agent_response("cart", [succeeded], "The item was removed.")
    assert response["response_type"] == "cart_update"
    assert response["data"]["total"] == "0.00"
    assert response["answer"] == "Your cart has been updated."

    unverifiable = ToolMessage(content=json.dumps({"success": True, "message": "Item removed."}), name="remove_item_from_my_cart", tool_call_id="call-3")
    response = build_agent_response("cart", [unverifiable], "The item was removed.")
    assert response["response_type"] == "text"
    assert "can't confirm" in response["answer"]


def test_supported_response_types_validate_with_explicit_payload_models():
    examples = [
        ("product_list", {"products": []}),
        ("product_details", {"product": {"name": "Watch"}}),
        ("product_comparison", {"products": []}),
        ("cart_summary", {"items": [], "item_count": 0, "total": "0"}),
        ("cart_update", {"items": [], "item_count": 0, "total": "0"}),
        ("order_list", {"orders": []}),
        ("order_details", {"order": {"order_number": "O1"}}),
        ("order_status", {"order_number": "O1", "status": "placed"}),
        ("shipment_list", {"shipments": []}),
        ("shipment_details", {"shipment": {"order_number": "O1", "shipment_available": False}}),
        ("return_request_list", {"return_requests": []}),
    ]
    for response_type, data in examples:
        parsed = AgentResponse.model_validate({
            "schema_version": 1,
            "agent": "support",
            "response_type": response_type,
            "answer": "Details follow.",
            "data": data,
        })
        assert parsed.response_type == response_type


def test_every_business_response_type_extracts_its_actual_tool_fields():
    cases = [
        ("get_product_details", {"success": True, "product": {"product_id": 3, "name": "Watch", "variants": []}}, "product_details"),
        ("compare_products", {"success": True, "products": [{"name": "Watch"}]}, "product_comparison"),
        ("get_my_cart", {"success": True, "cart": {"items": [], "item_count": 0, "total": "0"}}, "cart_summary"),
        ("update_my_cart_item_quantity", {"success": True, "cart": {"items": [], "item_count": 0, "total": "0"}}, "cart_update"),
        ("list_my_orders", {"success": True, "orders": [{"order_number": "O-1", "status": "placed", "total_amount": "19.50"}]}, "order_list"),
        ("get_order_details", {"success": True, "order": {"order_number": "O-1", "items": [{"product": "Watch", "quantity": 1, "unit_price": "19.50", "line_total": "19.50"}]}}, "order_details"),
        ("get_order_status", {"success": True, "order_number": "O-1", "status": "placed"}, "order_status"),
        ("list_my_shipments", {"success": True, "shipments": [{"order_number": "O-1", "shipment_available": False}]}, "shipment_list"),
        ("get_my_shipment", {"success": True, "shipment": {"order_number": "O-1", "shipment_available": True, "status": "shipped"}}, "shipment_details"),
        ("list_my_return_requests", {"success": True, "return_requests": [{"return_request_id": 5, "quantity": 1, "status": "requested"}]}, "return_request_list"),
        ("get_my_order_return_requests", {"success": True, "return_requests": [{"return_request_id": 6, "quantity": 2, "status": "requested"}]}, "return_request_list"),
    ]
    for index, (tool_name, output, expected_type) in enumerate(cases):
        tool_message = ToolMessage(content=json.dumps(output), name=tool_name, tool_call_id=f"call-{index}")
        response = build_agent_response("support", [tool_message], "Retrieved stored information.")
        assert AgentResponse.model_validate(response).response_type == expected_type
        assert "Retrieved stored information." not in response["answer"]
        assert "|" not in response["answer"]
        if expected_type == "cart_summary":
            assert response["answer"] == "Your cart is empty."


def test_structured_summaries_use_actual_counts_for_lists():
    cases = [
        ("list_my_orders", {"success": True, "orders": [{"order_number": "O1"}, {"order_number": "O2"}]}, "Here are your 2 recent orders."),
        ("list_my_shipments", {"success": True, "shipments": [{"order_number": "O1", "shipment_available": False}]}, "Here is shipment information for 1 order."),
        ("list_my_return_requests", {"success": True, "return_requests": [{"return_request_id": 1, "quantity": 1}, {"return_request_id": 2, "quantity": 2}]}, "Here are your 2 existing return requests."),
    ]
    for index, (tool_name, output, expected) in enumerate(cases):
        message = ToolMessage(content=json.dumps(output), name=tool_name, tool_call_id=f"count-{index}")
        response = build_agent_response("support", [message], "A long generated table follows.")
        assert response["answer"] == expected


def test_langgraph_checkpoint_restores_json_response_metadata():
    graph = StateGraph(GraphState)
    graph.add_node("record", record_assistant_message)
    graph.add_edge(START, "record")
    graph.add_edge("record", END)
    app = graph.compile(checkpointer=MemorySaver())
    response = {
        "schema_version": 1,
        "agent": "product",
        "response_type": "product_list",
        "answer": "One product found.",
        "data": {"products": [{"name": "Watch", "variants": []}]},
    }
    config = {"configurable": {"thread_id": "response-test"}}

    app.invoke({"question": "find a watch", "answer": response}, config=config)
    restored = app.get_state(config).values["messages"][-1]

    assert restored.content == "One product found."
    assert restored.additional_kwargs["flatkart_response"] == AgentResponse.model_validate(response).as_json()

    # PostgresSaver uses LangGraph's JsonPlusSerializer by default.
    serializer = JsonPlusSerializer()
    encoded = serializer.dumps_typed(restored)
    postgres_style_restored = serializer.loads_typed(encoded)
    assert postgres_style_restored.additional_kwargs == restored.additional_kwargs


def test_all_seven_specialists_return_canonical_envelopes():
    from backend.agents import cart_agent, knowledge_agent, order_agent, product_agent
    from backend.agents import returns_agent, shipping_agent, support_agent

    fake = SimpleNamespace(invoke=lambda _input: {"messages": [AIMessage(content="A concise answer.")]})
    cases = [
        (product_agent, "build_product_agent", product_agent.run_product_agent, ("question",)),
        (cart_agent, "build_cart_agent", cart_agent.run_cart_agent, ("question", 7)),
        (order_agent, "build_order_agent", order_agent.run_order_agent, ("question", 7)),
        (shipping_agent, "build_shipping_agent", shipping_agent.run_shipping_agent, ("question", 7)),
        (returns_agent, "build_returns_agent", returns_agent.run_returns_agent, ("question", 7)),
        (support_agent, "build_support_agent", support_agent.run_support_agent, ("question", 7)),
    ]
    for module, factory_name, runner, args in cases:
        with patch.object(module, factory_name, return_value=fake):
            response = runner(*args)
        assert AgentResponse.model_validate(response).response_type == "text"

    with patch.object(knowledge_agent, "answer_question", return_value={"answer": "Grounded answer", "sources": []}):
        response = knowledge_agent.run_knowledge_rag("question", [])
    assert AgentResponse.model_validate(response).response_type == "text"


def test_support_node_passes_authenticated_identity_to_support_agent():
    from backend.agents.agent_graph import support_node

    with patch("backend.agents.agent_graph.run_support_agent", return_value={"answer": "ok"}) as runner:
        result = support_node({"question": "Show my account details", "user_id": 81, "messages": []})

    runner.assert_called_once()
    assert runner.call_args.kwargs["user_id"] == 81
    assert result["answer"]["answer"] == "ok"


def test_customer_agent_builders_construct_with_the_current_tool_factories():
    from backend.agents import cart_agent, order_agent, product_agent, returns_agent, shipping_agent, support_agent

    cases = [
        (product_agent, "build_product_agent", ()),
        (cart_agent, "build_cart_agent", (7,)),
        (order_agent, "build_order_agent", (7,)),
        (shipping_agent, "build_shipping_agent", (7,)),
        (returns_agent, "build_returns_agent", (7,)),
        (support_agent, "build_support_agent", (7,)),
    ]
    for module, builder_name, args in cases:
        builder_module = __import__(module.__name__ + ".agent", fromlist=[builder_name])
        with patch.object(builder_module, "get_model", return_value="model"), patch.object(
            builder_module, "create_agent", side_effect=lambda **kwargs: kwargs,
        ):
            constructed = getattr(module, builder_name)(*args)
        assert constructed["tools"]


def test_conversation_api_restores_only_valid_structured_metadata():
    from backend.api.routes.chatbot import _conversation_message
    from langchain_core.messages import AIMessage

    good = AIMessage(content="A watch is available.", additional_kwargs={
        "flatkart_response": {
            "schema_version": 1,
            "agent": "product",
            "response_type": "product_list",
            "answer": "A watch is available.",
            "data": {"products": [{"name": "Watch"}]},
        },
    })
    old = AIMessage(content="Legacy text answer.")
    malformed = AIMessage(content="Safe fallback.", additional_kwargs={"flatkart_response": {"bad": True}})

    assert _conversation_message(good)["structured_response"]["response_type"] == "product_list"
    assert "structured_response" not in _conversation_message(old)
    assert "structured_response" not in _conversation_message(malformed)
