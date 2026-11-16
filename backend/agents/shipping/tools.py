"""Shipping agent tools."""

import logging
from urllib.parse import urlsplit

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import get_order_by_number, get_shipment, list_orders


logger = logging.getLogger(__name__)


def _valid_user_id(user_id):
    return isinstance(user_id, int) and not isinstance(user_id, bool) and 1 <= user_id <= 2_147_483_647


def _safe_tracking_url(value):
    if not isinstance(value, str) or not value.strip() or any(ord(char) < 32 for char in value):
        return None
    try:
        parsed = urlsplit(value.strip())
        parsed.port  # Accessing this validates a malformed explicit port.
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username is not None or parsed.password is not None:
            return None
        return value.strip()
    except ValueError:
        return None


def _serialize_shipment(order, shipment, *, include_events=False):
    if shipment is None:
        return {
            "order_number": order.order_number,
            "shipment_available": False,
            "message": "Stored shipment information is not available yet.",
            "tracking_reference": None,
            "status": None,
            "carrier": None,
            "tracking_url": None,
            "estimated_delivery_date": None,
            "shipped_at": None,
            "delivered_at": None,
            **({"events": []} if include_events else {}),
        }
    result = {
        "order_number": order.order_number,
        "shipment_available": True,
        "tracking_reference": shipment.tracking_reference,
        "status": shipment.status,
        "carrier": shipment.carrier,
        "tracking_url": _safe_tracking_url(shipment.tracking_url),
        "estimated_delivery_date": (
            shipment.estimated_delivery_date.isoformat()
            if shipment.estimated_delivery_date else None
        ),
        "shipped_at": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
        "delivered_at": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
    }
    if include_events:
        result["events"] = [
            {
                "previous_status": event.previous_status,
                "new_status": event.new_status,
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            for event in sorted(shipment.events, key=lambda row: (row.created_at, row.id))
        ]
    return result


def build_shipping_tools(user_id: int):
    if not _valid_user_id(user_id):
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def list_my_shipments() -> dict:
        """Read-only stored shipment summaries for the customer's recent orders."""
        try:
            with SessionLocal() as session:
                orders = list_orders(session, user_id, limit=50)
                shipments = [_serialize_shipment(order, order.shipment) for order in orders]
                return {"success": True, "shipments": shipments, "count": len(shipments)}
        except Exception:
            logger.exception("Shipment listing failed.")
            return {"success": False, "message": "Unable to retrieve shipment information right now."}

    @tool
    def get_my_shipment(order_number: str) -> dict:
        """Read-only stored shipment details and events for a customer-owned order."""
        if not isinstance(order_number, str) or not order_number.strip() or len(order_number.strip()) > 40:
            return {"success": False, "message": "A valid order number is required."}
        try:
            with SessionLocal() as session:
                order = get_order_by_number(session, user_id, order_number.strip())
                if order is None:
                    return {"success": False, "message": "Order not found."}
                shipment = get_shipment(session, user_id, order.id)
                return {
                    "success": True,
                    "shipment": _serialize_shipment(order, shipment, include_events=True),
                }
        except Exception:
            logger.exception("Shipment retrieval failed.")
            return {"success": False, "message": "Unable to retrieve shipment information right now."}

    return [list_my_shipments, get_my_shipment]
