"""Order agent tools."""

import logging

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import (
    list_orders,
    get_order_by_number,
)


logger = logging.getLogger(__name__)

ORDER_STATUSES = {
    "placed", "processing", "packed", "shipped", "out_for_delivery", "delivered",
    "cancelled", "payment_failed", "pending_payment",
}


def serialize_order(order, include_items=False):
    items = []
    for item in order.items:
        line_total = item.unit_price * item.quantity
        if include_items:
            items.append({
                "product": item.product_name,
                "variant": item.variant_name,
                "sku": item.sku,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "line_total": str(line_total),
            })

    result = {
        "order_number": order.order_number,
        "status": order.status,
        "order_date": order.created_at.isoformat() if order.created_at else None,
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "total_amount": str(order.total_amount) if order.total_amount is not None else None,
        "currency": order.currency,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "item_count": sum(item.quantity for item in order.items),
    }

    if include_items:
        result["items"] = items

    return result


def build_order_tools(user_id: int):
    if isinstance(user_id, bool) or not isinstance(user_id, int) or not 1 <= user_id <= 2_147_483_647:
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def list_my_orders(status: str | None = None, limit: int | bool = 50) -> dict:
        """Read-only list of recent customer-owned orders by stored status."""
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            return {"success": False, "message": "Limit must be an integer from 1 to 100."}
        if status is not None:
            if not isinstance(status, str) or not status.strip():
                return {"success": False, "message": "A valid order status is required."}
            status = status.strip().lower()
            if status not in ORDER_STATUSES:
                return {"success": False, "message": "That order status is not supported."}
        try:
            with SessionLocal() as session:
                orders = list_orders(
                    session,
                    user_id,
                    limit=limit,
                    status=status,
                )
                return {
                    "success": True,
                    "orders": [serialize_order(order) for order in orders],
                    "count": len(orders),
                }
        except Exception:
            logger.exception("Order listing failed.")
            return {
                "success": False,
                "message": "Unable to retrieve orders right now.",
            }

    def _validated_order_number(order_number):
        if not isinstance(order_number, str):
            return None
        value = order_number.strip()
        if not value or len(value) > 40:
            return None
        return value

    @tool
    def get_order_details(order_number: str) -> dict:
        """Read-only details of a customer-owned order by its order number."""

        order_number = _validated_order_number(order_number)
        if order_number is None:
            return {
                "success": False,
                "message": "A valid order number is required.",
            }

        try:
            with SessionLocal() as session:
                order = get_order_by_number(
                    session,
                    user_id,
                    order_number,
                )

                if order is None:
                    return {
                        "success": False,
                        "message": "Order not found.",
                    }

                serialized = serialize_order(order, include_items=True)
                return {
                    "success": True,
                    "order": serialized,
                }

        except Exception:
            logger.exception("Order detail retrieval failed.")

            return {
                "success": False,
                "message": "Unable to retrieve order details right now.",
            }

    @tool
    def get_order_status(order_number: str) -> dict:
        """Read-only current stored status of a customer-owned order."""

        order_number = _validated_order_number(order_number)
        if order_number is None:
            return {
                "success": False,
                "message": "A valid order number is required.",
            }

        try:
            with SessionLocal() as session:

                order = get_order_by_number(
                    session,
                    user_id,
                    order_number,
                )

                if order is None:
                    return {
                        "success": False,
                        "message": "Order not found.",
                    }

                return {
                    "success": True,
                    "order_number": order.order_number,
                    "status": order.status,
                    "order_date": order.created_at.isoformat() if order.created_at else None,
                    "placed_at": order.placed_at.isoformat() if order.placed_at else None,
                    "payment_status": order.payment_status,
                }

        except Exception:
            logger.exception("Order status retrieval failed.")

            return {
                "success": False,
                "message": "Unable to retrieve order status right now.",
            }

    return [
        list_my_orders,
        get_order_details,
        get_order_status,
    ]
