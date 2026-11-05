"""Build structured responses only from successful LangChain tool results."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping

from langchain_core.messages import ToolMessage
from pydantic import ValidationError

from backend.agents.response_schema import AgentResponse, text_response

logger = logging.getLogger(__name__)


TOOL_TYPES = {
    "search_products": ("product_list", "products"),
    "search_products_by_category": ("product_list", "products"),
    "get_product_details": ("product_details", "product"),
    "compare_products": ("product_comparison", "products"),
    "get_my_cart": ("cart_summary", "cart"),
    "add_item_to_my_cart": ("cart_update", "cart"),
    "remove_item_from_my_cart": ("cart_update", "cart"),
    "list_my_orders": ("order_list", "orders"),
    "get_order_details": ("order_details", "order"),
    "get_order_status": ("order_status", None),
    "list_my_shipments": ("shipment_list", "shipments"),
    "get_my_shipment": ("shipment_details", "shipment"),
    "list_my_return_requests": ("return_request_list", "return_requests"),
    "get_my_order_return_requests": ("return_request_list", "return_requests"),
}


def _decoded_tool_output(message: ToolMessage) -> Mapping | None:
    content = message.content
    if isinstance(content, Mapping):
        value = content
    elif isinstance(content, str):
        try:
            value = json.loads(content)
        except (TypeError, ValueError):
            return None
    else:
        return None
    if not isinstance(value, Mapping):
        return None
    return value


def _tool_output(message: ToolMessage) -> Mapping | None:
    value = _decoded_tool_output(message)
    if getattr(message, "status", "success") != "success" or not value or value.get("success") is not True:
        return None
    return value


def _project_output(kind: str, key: str, value: Mapping):
    if kind == "order_status":
        return value
    output = value.get(key)
    if output is None:
        return None
    if kind in {"product_list", "product_comparison", "order_list", "shipment_list", "return_request_list"}:
        if not isinstance(output, list):
            return None
        return output
    if not isinstance(output, Mapping):
        return None
    return output


def _structured_data(messages, response_type: str):
    selected = []
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        mapping = TOOL_TYPES.get(getattr(message, "name", None))
        if mapping is None or mapping[0] != response_type:
            continue
        value = _tool_output(message)
        if value is None:
            return None
        projected = _project_output(*mapping, value)
        if projected is None:
            return None
        selected.append(projected)
    if not selected:
        return None

    # List operations may be called several times in one execution. Preserve the
    # selected operation and merge only its own successful tool results.
    if response_type == "product_list":
        return {"products": [item for result in selected for item in result]}
    if response_type == "product_comparison":
        return {"products": selected[-1]}
    if response_type == "order_list":
        return {"orders": [item for result in selected for item in result]}
    if response_type == "shipment_list":
        return {"shipments": [item for result in selected for item in result]}
    if response_type == "return_request_list":
        return {"return_requests": [item for result in selected for item in result]}
    if response_type in {"cart_summary", "cart_update"}:
        return selected[-1]
    if response_type == "product_details":
        return {"product": selected[-1]}
    if response_type == "order_details":
        return {"order": selected[-1]}
    if response_type == "order_status":
        return {"order_number": selected[-1].get("order_number"), "status": selected[-1].get("status")}
    if response_type == "shipment_details":
        return {"shipment": selected[-1]}
    return None


def build_agent_response(agent: str, messages, answer: str) -> dict:
    """Validate a specialist response; safely fall back to text on any mismatch."""
    safe_answer = answer if isinstance(answer, str) else ""
    tool_messages = [message for message in messages if isinstance(message, ToolMessage)]
    applicable = [
        message for message in tool_messages
        if getattr(message, "name", None) in TOOL_TYPES
    ]
    if not applicable:
        return text_response(agent, safe_answer)

    # The latest relevant tool determines the operation being answered. A failed
    # final call must not silently borrow an earlier result for a different call.
    latest = applicable[-1]
    response_type = TOOL_TYPES[latest.name][0]
    latest_result = _decoded_tool_output(latest)
    if _tool_output(latest) is None:
        if response_type == "cart_update":
            failure_message = latest_result.get("message") if latest_result else None
            return text_response(
                agent,
                failure_message if isinstance(failure_message, str) and failure_message.strip()
                else "I couldn't confirm that cart change, so I can't say it succeeded.",
            )
        return text_response(agent, safe_answer)
    try:
        data = _structured_data(messages, response_type)
        if data is None:
            if response_type == "cart_update":
                return text_response(agent, "I couldn't verify the updated cart, so I can't confirm that change.")
            return text_response(agent, safe_answer)
        return AgentResponse(
            agent=agent,
            response_type=response_type,
            answer=safe_answer,
            data=data,
        ).as_json()
    except (ValidationError, TypeError, ValueError, KeyError):
        logger.info("Agent structured response validation failed; returning text.")
        return text_response(agent, safe_answer)
