"""Order agent tools."""

import logging
from decimal import Decimal

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import (
    list_orders,
    get_order_by_number,
)


logger = logging.getLogger(__name__)


def serialize_order(order, include_items=False):

    items = []

    total_amount = Decimal("0.00")

    for item in order.items:

        line_total = item.unit_price * item.quantity
        total_amount += line_total

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
        "order_date": (
            order.created_at.isoformat()
            if order.created_at else None
        ),
        "total_amount": str(total_amount),
    }

    if include_items:
        result["items"] = items

    return result


def build_order_tools(user_id: int):

    if not isinstance(user_id, int) or user_id <= 0:
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def list_my_orders() -> dict:
        """Retrieve the authenticated customer's recent orders."""

        try:
            with SessionLocal() as session:

                orders = list_orders(
                    session,
                    user_id,
                    limit=50,
                )

                return {
                    "success": True,
                    "orders": [
                        serialize_order(order)
                        for order in orders
                    ],
                    "count": len(orders),
                }

        except Exception:
            logger.exception("Order listing failed.")

            return {
                "success": False,
                "message": "Unable to retrieve orders right now.",
            }

    @tool
    def get_order_details(order_number: str) -> dict:
        """Retrieve complete details of a customer's order using its order number."""

        order_number = order_number.strip()

        if not order_number:
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
                    "order": serialize_order(
                        order,
                        include_items=True,
                    ),
                }

        except Exception:
            logger.exception("Order detail retrieval failed.")

            return {
                "success": False,
                "message": "Unable to retrieve order details right now.",
            }

    @tool
    def get_order_status(order_number: str) -> dict:
        """Retrieve the current order status using its order number."""

        order_number = order_number.strip()

        if not order_number:
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
                    "order_date": (
                        order.created_at.isoformat()
                        if order.created_at else None
                    ),
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