"""Backend agents package - unified exports for backward compatibility."""

# Shared infrastructure
from backend.agents.graph_state import GraphState
from backend.agents.model_factory import get_model, MODEL_CONFIG
from backend.agents.response_schema import (
    AgentResponse,
    AgentName,
    ResponseType,
    STRUCTURED_RESPONSE_KEY,
    text_response,
    ProductData,
    ProductListData,
    CartData,
    OrderData,
    OrderListData,
    ShipmentData,
    ReturnRequestData,
    ReturnRequestListData,
)
from backend.agents.response_builder import build_agent_response, TOOL_TYPES

# Supervisor
from backend.agents.supervisor import (
    select_route,
    supervisor_route,
    ALLOWED_ROUTES,
    validate_route,
    detect_intent_deterministic,
)

# Individual agents - function exports
from backend.agents.knowledge import run_knowledge_rag
from backend.agents.product import build_product_agent, run_product_agent, build_product_tools
from backend.agents.cart import build_cart_agent, run_cart_agent, build_cart_tools
from backend.agents.order import build_order_agent, run_order_agent, build_order_tools
from backend.agents.shipping import build_shipping_agent, run_shipping_agent, build_shipping_tools
from backend.agents.returns import build_returns_agent, run_returns_agent, build_returns_tools
from backend.agents.support import build_support_agent, run_support_agent, build_support_tools

# Individual agents - submodule exports for backward compatibility
from backend.agents import knowledge as knowledge_agent
from backend.agents import product as product_agent
from backend.agents import cart as cart_agent
from backend.agents import order as order_agent
from backend.agents import shipping as shipping_agent
from backend.agents import returns as returns_agent
from backend.agents import support as support_agent
from backend.agents import supervisor as supervisor_agent

# Graph
from backend.agents.agent_graph import agent_graph, build_graph

__all__ = [
    # Shared
    "GraphState",
    "get_model",
    "MODEL_CONFIG",
    "AgentResponse",
    "AgentName",
    "ResponseType",
    "STRUCTURED_RESPONSE_KEY",
    "text_response",
    "ProductData",
    "ProductListData",
    "CartData",
    "OrderData",
    "OrderListData",
    "ShipmentData",
    "ReturnRequestData",
    "ReturnRequestListData",
    "build_agent_response",
    "TOOL_TYPES",
    # Supervisor
    "select_route",
    "supervisor_route",
    "ALLOWED_ROUTES",
    "validate_route",
    "detect_intent_deterministic",
    # Agents - functions
    "run_knowledge_rag",
    "build_product_agent",
    "run_product_agent",
    "build_product_tools",
    "build_cart_agent",
    "run_cart_agent",
    "build_cart_tools",
    "build_order_agent",
    "run_order_agent",
    "build_order_tools",
    "build_shipping_agent",
    "run_shipping_agent",
    "build_shipping_tools",
    "build_returns_agent",
    "run_returns_agent",
    "build_returns_tools",
    "build_support_agent",
    "run_support_agent",
    "build_support_tools",
    # Agents - submodules (backward compatibility)
    "knowledge_agent",
    "product_agent",
    "cart_agent",
    "order_agent",
    "shipping_agent",
    "returns_agent",
    "support_agent",
    "supervisor_agent",
    # Graph
    "agent_graph",
    "build_graph",
]