"""Returns agent tools."""

import logging

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import get_order_by_number, list_returns


logger = logging.getLogger(__name__)


def _valid_user_id(user_id):
    return isinstance(user_id, int) and not isinstance(user_id, bool) and user_id > 0


def _serialize_return_request(request):
    item = request.order_item
    return {
        "return_request_id": request.id,
        "order_number": request.order.order_number if request.order else None,
        "product_name": item.product_name if item else None,
        "variant_name": item.variant_name if item else None,
        "quantity": request.quantity,
        "reason": request.reason,
        "status": request.status,
        "requested_at": request.requested_at.isoformat() if request.requested_at else None,
    }


def build_returns_tools(user_id: int):
    if not _valid_user_id(user_id):
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def list_my_return_requests() -> dict:
        """List existing return requests belonging to the authenticated customer."""
        try:
            with SessionLocal() as session:
                requests = list_returns(session, user_id)
                return {
                    "success": True,
                    "return_requests": [_serialize_return_request(request) for request in requests],
                    "count": len(requests),
                }
        except Exception:
            logger.exception("Return request listing failed.")
            return {"success": False, "message": "Unable to retrieve return requests right now."}

    @tool
    def get_my_order_return_requests(order_number: str) -> dict:
        """List existing return requests for one of the authenticated customer's orders."""
        if not isinstance(order_number, str) or not order_number.strip():
            return {"success": False, "message": "A valid order number is required."}
        try:
            with SessionLocal() as session:
                order = get_order_by_number(session, user_id, order_number.strip())
                if order is None:
                    return {"success": False, "message": "Order not found."}
                requests = list_returns(session, user_id, order_id=order.id)
                return {
                    "success": True,
                    "order_number": order.order_number,
                    "return_requests": [_serialize_return_request(request) for request in requests],
                    "count": len(requests),
                }
        except Exception:
            logger.exception("Order return request lookup failed.")
            return {"success": False, "message": "Unable to retrieve return requests right now."}

    return [list_my_return_requests, get_my_order_return_requests]