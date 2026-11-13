"""Returns agent tools."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.models import CommerceOrder, Refund, ReturnEvidence, ReturnHandoff, ReturnRequest
from backend.Database.return_services import claim_details, evaluate_return_eligibility
from backend.Database.services import get_order_by_number


logger = logging.getLogger(__name__)


def _valid_user_id(user_id):
    return isinstance(user_id, int) and not isinstance(user_id, bool) and user_id > 0


def _positive_int(value, field_name):
    """Validate a positive integer that is not a boolean."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return False, f"A valid {field_name} is required."
    return True, None


def _non_empty_string(value, field_name):
    """Validate a non-empty string that is not a boolean."""
    if isinstance(value, bool) or not isinstance(value, str) or not value.strip():
        return False, f"A valid {field_name} is required."
    return True, value.strip()


def _stamp(value):
    return value.isoformat() if value else None


# Keys safe to disclose to customers from ReturnRequestEvent.event_data JSON.
SAFE_EVENT_DATA_KEYS = {
    "order_item_id", "quantity", "resolution_type", "refund_timing", "reason_code",
    "handoff_id", "pickup_handoff_id", "handoff_type", "inspection_id", "inspection_type", "outcome",
    "condition_code", "evidence_id", "content_type", "size_bytes",
}

SAFE_HANDOFF_PAYLOAD_KEYS = {
    "order_item_id", "quantity", "resolution_type", "refund_timing",
    "reason_code", "handoff_id", "pickup_handoff_id", "inspection_id", "inspection_type",
    "outcome", "condition_code",
}


def _sanitize_event_data(event_data):
    """Remove internal/sensitive fields from event_data before customer disclosure."""
    if not isinstance(event_data, dict):
        return {}
    sanitized = {}
    for key, value in event_data.items():
        if key in SAFE_EVENT_DATA_KEYS:
            sanitized[key] = value
    return sanitized


def _sanitize_handoff_payload(payload):
    """Expose only known customer-safe operational fields from handoff payloads."""
    if not isinstance(payload, dict):
        return {}
    return {key: value for key, value in payload.items() if key in SAFE_HANDOFF_PAYLOAD_KEYS}


def _list_customer_requests(session, user_id, order_id=None):
    """Load request summaries and relationships in a fixed number of queries."""
    query = (
        select(ReturnRequest)
        .join(CommerceOrder, ReturnRequest.order_id == CommerceOrder.id)
        .options(
            selectinload(ReturnRequest.order),
            selectinload(ReturnRequest.order_item),
        )
        .where(CommerceOrder.user_id == user_id)
        .order_by(ReturnRequest.requested_at.desc(), ReturnRequest.id.desc())
    )
    if order_id is not None:
        query = query.where(ReturnRequest.order_id == order_id)
    return list(session.scalars(query).all())


def _serialize_return_request(request):
    """Full summary of a return request, scoped to the authenticated customer."""
    item = request.order_item
    order = request.order
    return {
        "return_request_id": request.id,
        "order_number": order.order_number if order else None,
        "product_name": item.product_name if item else None,
        "variant_name": item.variant_name if item else None,
        "sku": item.sku if item else None,
        "quantity": request.quantity,
        "resolution_type": request.resolution_type,
        "refund_timing": request.refund_timing,
        "status": request.status,
        "workflow_status": request.workflow_status,
        "reason": request.reason,
        "reason_code": request.reason_code,
        "description": request.description,
        "decision_note": request.decision_note,
        "decided_at": _stamp(request.decided_at),
        "requested_at": _stamp(request.requested_at),
        "updated_at": _stamp(request.updated_at),
    }


def build_returns_tools(user_id: int):
    if not _valid_user_id(user_id):
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def list_my_return_requests() -> dict:
        """List existing return requests belonging to the authenticated customer."""
        try:
            with SessionLocal() as session:
                requests = _list_customer_requests(session, user_id)
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
        ok, order_number = _non_empty_string(order_number, "order number")
        if not ok:
            return {"success": False, "message": order_number}
        try:
            with SessionLocal() as session:
                order = get_order_by_number(session, user_id, order_number)
                if order is None:
                    return {"success": False, "message": "Order not found."}
                requests = _list_customer_requests(session, user_id, order_id=order.id)
                return {
                    "success": True,
                    "order_number": order.order_number,
                    "return_requests": [_serialize_return_request(request) for request in requests],
                    "count": len(requests),
                }
        except Exception:
            logger.exception("Order return request lookup failed.")
            return {"success": False, "message": "Unable to retrieve return requests right now."}

    @tool
    def get_my_return_request_details(return_request_id: int) -> dict:
        """Retrieve comprehensive details of one of the authenticated customer's return requests."""
        ok, error = _positive_int(return_request_id, "return request ID")
        if not ok:
            return {"success": False, "message": error}
        try:
            with SessionLocal() as session:
                claim = session.scalar(
                    select(ReturnRequest)
                    .join(CommerceOrder, ReturnRequest.order_id == CommerceOrder.id)
                    .options(
                        selectinload(ReturnRequest.order),
                        selectinload(ReturnRequest.order_item),
                    )
                    .where(
                        ReturnRequest.id == return_request_id,
                        CommerceOrder.user_id == user_id,
                    )
                )
                if claim is None:
                    return {"success": False, "message": "Return request not found."}
                order = claim.order
                if order is None or order.user_id != user_id:
                    return {"success": False, "message": "Return request not found."}

                # claim_details() provides request, order, product, audit history,
                # evidence, inspection history, and handoff history (without
                # department names). Refunds are not included by claim_details().
                details = claim_details(session, claim)

                # Supplement: refund records linked to this return request.
                refunds = session.scalars(
                    select(Refund)
                    .where(Refund.return_request_id == claim.id)
                    .order_by(Refund.created_at.desc(), Refund.id.desc())
                ).all()

                # claim_details() intentionally returns active evidence only. Read
                # all metadata here so inactive records remain visible as inactive.
                evidence_rows = session.scalars(
                    select(ReturnEvidence)
                    .where(ReturnEvidence.return_request_id == claim.id)
                    .order_by(ReturnEvidence.uploaded_at, ReturnEvidence.id)
                ).all()

                # Supplement: handoffs with source/destination department names.
                handoffs = session.scalars(
                    select(ReturnHandoff)
                    .options(
                        selectinload(ReturnHandoff.source_department),
                        selectinload(ReturnHandoff.destination_department),
                    )
                    .where(ReturnHandoff.return_request_id == claim.id)
                    .order_by(ReturnHandoff.created_at, ReturnHandoff.id)
                ).all()
                handoff_by_id = {handoff.id: handoff for handoff in handoffs}

                handoff_history = []
                for handoff_data in details.get("handoff_history", []):
                    handoff = handoff_by_id.get(handoff_data["id"])
                    handoff_history.append({
                        **handoff_data,
                        "source_department_name": (
                            handoff.source_department.name
                            if handoff and handoff.source_department else None
                        ),
                        "destination_department_name": (
                            handoff.destination_department.name
                            if handoff and handoff.destination_department else None
                        ),
                        "completed_at": _stamp(handoff.completed_at) if handoff else handoff_data["completed_at"],
                        "failure_reason": handoff.failure_reason if handoff else None,
                        "payload": _sanitize_handoff_payload(handoff.payload) if handoff else {},
                    })

                # Sanitize audit event data before customer disclosure.
                audit_history = []
                for event in details.get("audit_history", []):
                    audit_history.append({
                        "id": event["id"],
                        "type": event["type"],
                        "previous_status": event["previous_status"],
                        "new_status": event["new_status"],
                        "note": event["note"],
                        "event_data": _sanitize_event_data(event.get("event_data")),
                        "timestamp": event["created_at"],
                    })

                # Evidence metadata only - no storage keys or internal paths.
                evidence = []
                for row in evidence_rows:
                    evidence.append({
                        "id": row.id,
                        "filename": row.original_filename,
                        "content_type": row.mime_type,
                        "size_bytes": row.size_bytes,
                        "uploaded_at": _stamp(row.uploaded_at),
                        "active": row.is_active,
                    })

                inspection_history = []
                for row in details.get("inspection_history", []):
                    inspection_history.append({
                        "id": row["id"],
                        "type": row["type"],
                        "outcome": row["outcome"],
                        "condition_code": row["condition_code"],
                        "notes": row["notes"],
                        "inspected_at": row["inspected_at"],
                        "handoff_id": row["handoff_id"],
                    })

                # Refund history: every linked refund record, actual statuses only.
                refund_history = []
                for refund in refunds:
                    refund_history.append({
                        "id": refund.id,
                        "amount": str(refund.amount),
                        "currency": refund.currency,
                        "refund_method": refund.refund_method,
                        "reason": refund.reason,
                        "status": refund.status,
                        "created_at": _stamp(refund.created_at),
                        "updated_at": _stamp(refund.updated_at),
                        "failure_reason": refund.failure_reason,
                    })

                product = details.get("product") or {}
                order_section = details.get("order") or {}

                return {
                    "success": True,
                    "request": {
                        "return_request_id": details["id"],
                        "order_item_id": details["order_item_id"],
                        "order_number": order_section.get("order_number"),
                        "product_name": product.get("product_name"),
                        "variant_name": product.get("variant_name"),
                        "sku": product.get("sku"),
                        "variant_id": product.get("variant_id"),
                        "quantity": details["quantity"],
                        "resolution_type": details["resolution_type"],
                        "refund_timing": details["refund_timing"],
                        "status": details["status"],
                        "workflow_status": details["workflow_status"],
                        "reason": details["reason"],
                        "reason_code": details["reason_code"],
                        "description": details["description"],
                        "decision_note": details["decision_note"],
                        "decided_at": details["decided_at"],
                        "requested_at": details["requested_at"],
                        "updated_at": details["updated_at"],
                    },
                    "order": {
                        "order_number": order_section.get("order_number"),
                        "status": order_section.get("status"),
                        "subtotal": str(order.subtotal) if order and order.subtotal is not None else None,
                        "total_amount": str(order.total_amount) if order and order.total_amount is not None else None,
                        "payment_method": order.payment_method if order else None,
                        "created_at": _stamp(order.created_at) if order else None,
                    },
                    "product": {
                        "product_name": product.get("product_name"),
                        "variant_name": product.get("variant_name"),
                        "sku": product.get("sku"),
                        "variant_id": product.get("variant_id"),
                        "unit_price": product.get("unit_price"),
                    },
                    "current_workflow": {
                        "workflow_status": details["workflow_status"],
                        "decision_note": details["decision_note"],
                        "decided_at": details["decided_at"],
                    },
                    "audit_history": audit_history,
                    "department_handoffs": handoff_history,
                    "inspection_history": inspection_history,
                    "evidence": evidence,
                    "refund_history": refund_history,
                }
        except Exception:
            logger.exception("Return request detail retrieval failed.")
            return {"success": False, "message": "Unable to retrieve return request details right now."}

    @tool
    def check_my_return_eligibility(
        order_number: str,
        order_item_id: int,
        requested_quantity: int | None = None,
        resolution_type: str | None = None,
    ) -> dict:
        """Check return eligibility for an item in one of the authenticated customer's orders.

        Read-only: never creates or modifies any return request.
        """
        ok, order_number = _non_empty_string(order_number, "order number")
        if not ok:
            return {"success": False, "message": order_number}
        ok, error = _positive_int(order_item_id, "order item ID")
        if not ok:
            return {"success": False, "message": error}
        if requested_quantity is not None:
            ok, error = _positive_int(requested_quantity, "requested quantity")
            if not ok:
                return {"success": False, "message": error}
        if resolution_type is not None and resolution_type not in {"refund", "replacement"}:
            return {"success": False, "message": "Resolution type must be refund or replacement."}
        try:
            with SessionLocal() as session:
                order = get_order_by_number(session, user_id, order_number)
                if order is None:
                    return {"success": False, "message": "Order not found."}
                try:
                    eligibility = evaluate_return_eligibility(
                        session,
                        order=order,
                        order_item_id=order_item_id,
                        requested_quantity=requested_quantity,
                        resolution_type=resolution_type,
                    )
                except LookupError:
                    return {"success": False, "message": "Order item not found."}
                active_claim = eligibility.get("active_claim")
                if active_claim is not None:
                    active_claim = {
                        "id": active_claim["id"],
                        "status": active_claim["status"],
                        "workflow_status": active_claim["workflow_status"],
                        "quantity": active_claim["quantity"],
                        "resolution_type": active_claim["resolution_type"],
                        "requested_at": _stamp(active_claim.get("requested_at")),
                    }
                return {
                    "success": True,
                    "order_id": order.id,
                    "order_number": order.order_number,
                    "order_item_id": order_item_id,
                    "eligible": eligibility["eligible"],
                    "reason_code": eligibility["reason_code"],
                    "message": eligibility["message"],
                    "delivered_at": _stamp(eligibility.get("delivered_at")),
                    "return_deadline": _stamp(eligibility.get("return_deadline")),
                    "return_window_days": eligibility.get("return_window_days"),
                    "quantity_purchased": eligibility.get("quantity_purchased"),
                    "quantity_already_claimed": eligibility.get("quantity_already_claimed"),
                    "quantity_available": eligibility.get("quantity_available"),
                    "active_claim": active_claim,
                    "available_resolutions": eligibility.get("available_resolutions", []),
                }
        except Exception:
            logger.exception("Return eligibility check failed.")
            return {"success": False, "message": "Unable to check return eligibility right now."}

    return [
        list_my_return_requests,
        get_my_order_return_requests,
        get_my_return_request_details,
        check_my_return_eligibility,
    ]
