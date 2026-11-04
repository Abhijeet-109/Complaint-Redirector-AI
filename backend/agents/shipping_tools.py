import logging

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import get_order_by_number, get_shipment, list_orders


logger = logging.getLogger(__name__)


def _valid_user_id(user_id):
    return isinstance(user_id, int) and not isinstance(user_id, bool) and user_id > 0


def _serialize_shipment(order, shipment):
    if shipment is None:
        return {
            "order_number": order.order_number,
            "shipment_available": False,
            "message": "Stored shipment information is not available yet.",
            "tracking_reference": None,
            "status": None,
            "shipped_at": None,
            "delivered_at": None,
        }
    return {
        "order_number": order.order_number,
        "shipment_available": True,
        "tracking_reference": shipment.tracking_reference,
        "status": shipment.status,
        "shipped_at": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
        "delivered_at": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
    }


def build_shipping_tools(user_id: int):
    if not _valid_user_id(user_id):
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def list_my_shipments() -> dict:
        """List stored shipment details for the authenticated customer's recent orders."""
        try:
            with SessionLocal() as session:
                orders = list_orders(session, user_id, limit=50)
                shipments = []
                for order in orders:
                    shipment = get_shipment(session, user_id, order.id)
                    shipments.append(_serialize_shipment(order, shipment))
                return {"success": True, "shipments": shipments, "count": len(shipments)}
        except Exception:
            logger.exception("Shipment listing failed.")
            return {"success": False, "message": "Unable to retrieve shipment information right now."}

    @tool
    def get_my_shipment(order_number: str) -> dict:
        """Retrieve stored shipment details for one of the authenticated customer's orders."""
        if not isinstance(order_number, str) or not order_number.strip():
            return {"success": False, "message": "A valid order number is required."}
        try:
            with SessionLocal() as session:
                order = get_order_by_number(session, user_id, order_number.strip())
                if order is None:
                    return {"success": False, "message": "Order not found."}
                shipment = get_shipment(session, user_id, order.id)
                return {"success": True, "shipment": _serialize_shipment(order, shipment)}
        except Exception:
            logger.exception("Shipment retrieval failed.")
            return {"success": False, "message": "Unable to retrieve shipment information right now."}

    return [list_my_shipments, get_my_shipment]
