"""Customer return-claim creation and eligibility validation."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import (
    CommerceOrder,
    CommerceOrderItem,
    Department,
    ProductVariant,
    ReturnEvidence,
    ReturnHandoff,
    ReturnInspection,
    ReturnRequest,
    ReturnRequestEvent,
    Shipment,
)


ACTIVE_LEGACY_STATUSES = (
    "requested",
    "approved",
    "item_received",
    "inspected",
)

TERMINAL_WORKFLOW_STATUSES = (
    "rejected",
    "completed",
    "cancelled",
)


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_return_claim(
    session: Session,
    *,
    user_id: int,
    order_id: int,
    order_item_id: int,
    quantity: int,
    resolution_type: str,
    reason_code: str,
    description: str | None = None,
) -> ReturnRequest:
    """
    Validate and create a customer return/replacement claim.

    The caller is responsible for committing or rolling back
    the surrounding database transaction.
    """

    # 1. Validate request fields.
    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    if resolution_type not in {"refund", "replacement"}:
        raise ValueError("Invalid resolution type.")

    reason_code = reason_code.strip()
    if not reason_code:
        raise ValueError("A reason code is required.")

    description = description.strip() if description else None

    if description == "":
        description = None

    if description and len(description) > 2000:
        raise ValueError("Description cannot exceed 2000 characters.")

    # 2. Lock the customer's order.
    order = session.scalar(
        select(CommerceOrder)
        .where(
            CommerceOrder.id == order_id,
            CommerceOrder.user_id == user_id,
        )
        .with_for_update()
    )

    if order is None:
        raise LookupError("Order not found.")

    # 3. Verify delivery.
    shipment = session.scalar(
        select(Shipment).where(
            Shipment.order_id == order.id
        )
    )

    if (
        shipment is None
        or shipment.status != "delivered"
        or shipment.delivered_at is None
    ):
        raise ValueError(
            "A return can only be requested after confirmed delivery."
        )

    delivered_at = shipment.delivered_at

    if delivered_at.tzinfo is not None:
        delivered_at = delivered_at.astimezone(
            timezone.utc
        ).replace(tzinfo=None)

    now = _utcnow_naive()

    if delivered_at > now:
        raise ValueError("Invalid delivery timestamp.")

    # 4. Lock the purchased order item and load its product.
    order_item = session.scalar(
        select(CommerceOrderItem)
        .options(
            selectinload(CommerceOrderItem.variant)
            .selectinload(ProductVariant.product)
        )
        .where(
            CommerceOrderItem.id == order_item_id,
            CommerceOrderItem.order_id == order.id,
        )
        .with_for_update()
    )

    if order_item is None:
        raise LookupError("Order item not found.")

    if quantity > order_item.quantity:
        raise ValueError(
            "Requested quantity exceeds purchased quantity."
        )

    variant = order_item.variant
    product = variant.product if variant else None

    if product is None:
        raise LookupError("Product information not found.")

    # 5. Validate product return policy.
    if product.is_returnable is None:
        raise ValueError(
            "Return policy is not configured for this product."
        )

    if product.is_returnable is False:
        raise ValueError("This product is not returnable.")

    if product.return_window_days is None:
        raise ValueError(
            "Return window is not configured for this product."
        )

    if product.return_window_days < 0:
        raise RuntimeError(
            "Invalid return-window configuration."
        )

    deadline = delivered_at + timedelta(
        days=product.return_window_days
    )

    if now > deadline:
        raise ValueError("The return window has expired.")

    if resolution_type == "refund":
        if product.is_refundable is None:
            raise ValueError(
                "Refund policy is not configured for this product."
            )

        if product.is_refundable is False:
            raise ValueError(
                "This product is not eligible for a refund."
            )

    # 6. Prevent another active claim for this order item.
    active_claim_id = session.scalar(
        select(ReturnRequest.id)
        .where(
            ReturnRequest.order_item_id == order_item.id,
            ReturnRequest.status.in_(ACTIVE_LEGACY_STATUSES),
            or_(
                ReturnRequest.workflow_status.is_(None),
                ReturnRequest.workflow_status.notin_(
                    TERMINAL_WORKFLOW_STATUSES
                ),
            ),
        )
        .limit(1)
        .with_for_update()
    )

    if active_claim_id is not None:
        raise ValueError(
            "An active return request already exists for this item."
        )

    # 7. Calculate previously claimed/returned quantity.
    countable_claim = and_(
        ReturnRequest.status.notin_(("rejected", "cancelled")),
        or_(
            ReturnRequest.workflow_status.is_(None),
            ReturnRequest.workflow_status.notin_(
                ("rejected", "cancelled")
            ),
        ),
    )

    previously_claimed = session.scalar(
        select(
            func.coalesce(
                func.sum(ReturnRequest.quantity),
                0,
            )
        ).where(
            ReturnRequest.order_item_id == order_item.id,
            countable_claim,
        )
    )

    remaining_quantity = (
        order_item.quantity - int(previously_claimed or 0)
    )

    if quantity > remaining_quantity:
        raise ValueError(
            f"Only {remaining_quantity} unit(s) remain eligible for return."
        )

    # 8. Create the return request.
    claim = ReturnRequest(
        order_id=order.id,
        order_item_id=order_item.id,
        quantity=quantity,

        # Retain legacy status/reason compatibility.
        status="requested",
        reason=(description or reason_code)[:500],

        # New workflow fields.
        resolution_type=resolution_type,
        reason_code=reason_code,
        description=description,
        workflow_status="submitted",
    )

    session.add(claim)
    session.flush()

    # 9. Record the initial audit event.
    event = ReturnRequestEvent(
        return_request_id=claim.id,
        event_type="claim_submitted",
        previous_status=None,
        new_status="submitted",
        actor_user_id=user_id,
        event_data={
            "order_item_id": order_item.id,
            "quantity": quantity,
            "resolution_type": resolution_type,
            "reason_code": reason_code,
        },
    )

    session.add(event)
    session.flush()

    return claim


def get_return_claim(session: Session, claim_id: int, *, lock: bool = False):
    query = (
        select(ReturnRequest)
        .options(
            selectinload(ReturnRequest.order),
            selectinload(ReturnRequest.order_item),
        )
        .where(ReturnRequest.id == claim_id)
    )
    if lock:
        query = query.with_for_update()
    return session.scalar(query)


def claim_details(session: Session, claim: ReturnRequest) -> dict:
    item = claim.order_item
    order = claim.order
    events = session.scalars(
        select(ReturnRequestEvent)
        .where(ReturnRequestEvent.return_request_id == claim.id)
        .order_by(ReturnRequestEvent.created_at, ReturnRequestEvent.id)
    ).all()
    evidence = session.scalars(
        select(ReturnEvidence)
        .where(ReturnEvidence.return_request_id == claim.id, ReturnEvidence.is_active.is_(True))
        .order_by(ReturnEvidence.uploaded_at, ReturnEvidence.id)
    ).all()
    inspections = session.scalars(
        select(ReturnInspection)
        .where(ReturnInspection.return_request_id == claim.id)
        .order_by(ReturnInspection.inspected_at, ReturnInspection.id)
    ).all()
    handoffs = session.scalars(
        select(ReturnHandoff)
        .where(ReturnHandoff.return_request_id == claim.id)
        .order_by(ReturnHandoff.created_at, ReturnHandoff.id)
    ).all()
    stamp = lambda value: value.isoformat() if value else None
    return {
        "id": claim.id,
        "order": {"id": order.id, "order_number": order.order_number, "status": order.status} if order else None,
        "product": {
            "product_name": item.product_name,
            "variant_name": item.variant_name,
            "sku": item.sku,
            "variant_id": item.variant_id,
            "unit_price": str(item.unit_price),
        } if item else None,
        "order_item_id": claim.order_item_id,
        "quantity": claim.quantity,
        "resolution_type": claim.resolution_type,
        "reason_code": claim.reason_code,
        "reason": claim.reason,
        "description": claim.description,
        "status": claim.status,
        "workflow_status": claim.workflow_status,
        "requested_at": stamp(claim.requested_at),
        "updated_at": stamp(claim.updated_at),
        "decided_at": stamp(claim.decided_at),
        "decision_note": claim.decision_note,
        "evidence": [{
            "id": row.id,
            "filename": row.original_filename,
            "content_type": row.mime_type,
            "size_bytes": row.size_bytes,
            "sha256": row.sha256,
            "uploaded_by_id": row.uploaded_by_id,
            "uploaded_at": stamp(row.uploaded_at),
            "active": row.is_active,
        } for row in evidence],
        "inspection_history": [{
            "id": row.id,
            "type": row.inspection_type,
            "outcome": row.outcome,
            "condition_code": row.condition_code,
            "notes": row.notes,
            "inspected_by_id": row.inspected_by_id,
            "inspected_at": stamp(row.inspected_at),
            "handoff_id": row.handoff_id,
        } for row in inspections],
        "handoff_history": [{
            "id": row.id,
            "source_department_id": row.source_department_id,
            "destination_department_id": row.destination_department_id,
            "type": row.handoff_type,
            "status": row.status,
            "created_at": stamp(row.created_at),
            "updated_at": stamp(row.updated_at),
            "completed_at": stamp(row.completed_at),
        } for row in handoffs],
        "audit_history": [{
            "id": row.id,
            "type": row.event_type,
            "previous_status": row.previous_status,
            "new_status": row.new_status,
            "actor_user_id": row.actor_user_id,
            "note": row.note,
            "event_data": row.event_data,
            "created_at": stamp(row.created_at),
        } for row in events],
    }


def _event(session, claim, event_type, actor_id, *, previous=None, new=None, note=None, data=None):
    session.add(ReturnRequestEvent(
        return_request_id=claim.id,
        event_type=event_type,
        previous_status=previous,
        new_status=new,
        actor_user_id=actor_id,
        note=note,
        event_data=data or {},
    ))


def _department_by_name(session: Session, name: str) -> Department:
    department = session.scalar(select(Department).where(Department.name == name))
    if department is None:
        raise LookupError(f"Required department '{name}' is not configured.")
    return department


def apply_claim_decision(session: Session, claim_id: int, *, actor_id: int, decision: str, note: str):
    claim = get_return_claim(session, claim_id, lock=True)
    if claim is None:
        raise LookupError("Return claim not found.")
    previous = claim.workflow_status or "submitted"
    if previous not in {"submitted", "under_review", "information_requested"}:
        raise ValueError("This claim can no longer be reviewed.")
    if not note.strip():
        raise ValueError("A decision note is required.")
    if decision not in {"approved", "rejected", "information_requested"}:
        raise ValueError("Invalid claim decision.")
    if decision == "approved" and claim.resolution_type not in {"refund", "replacement"}:
        raise ValueError("This claim has no valid resolution type and cannot be approved.")

    claim.workflow_status = decision
    claim.status = "approved" if decision == "approved" else "rejected" if decision == "rejected" else "requested"
    claim.decision_note = note.strip()
    claim.decision_by_id = actor_id
    claim.decided_at = _utcnow_naive() if decision in {"approved", "rejected"} else None
    claim.updated_at = _utcnow_naive()
    _event(session, claim, decision, actor_id, previous=previous, new=decision, note=note.strip())

    if decision == "approved":
        source = _department_by_name(session, "Returns & Replacement")
        target_name = "Payments & Refunds" if claim.resolution_type == "refund" else "Order & Delivery"
        target = _department_by_name(session, target_name)
        handoff_type = "refund_processing" if claim.resolution_type == "refund" else "replacement_fulfillment"
        key = f"return-claim:{claim.id}:{handoff_type}:v1"
        handoff = session.scalar(select(ReturnHandoff).where(ReturnHandoff.idempotency_key == key))
        if handoff is None:
            handoff = ReturnHandoff(
                return_request_id=claim.id,
                source_department_id=source.id,
                destination_department_id=target.id,
                handoff_type=handoff_type,
                status="pending",
                idempotency_key=key,
                payload={"claim_id": claim.id, "order_id": claim.order_id,
                         "order_item_id": claim.order_item_id, "quantity": claim.quantity,
                         "resolution_type": claim.resolution_type},
                created_by_id=actor_id,
            )
            session.add(handoff)
            session.flush()
            _event(session, claim, "department_handoff_created", actor_id,
                   previous=decision, new=decision,
                   data={"handoff_id": handoff.id, "destination_department_id": target.id,
                         "handoff_type": handoff_type})
    return claim


def request_customer_information(session: Session, claim_id: int, *, actor_id: int, note: str):
    return apply_claim_decision(session, claim_id, actor_id=actor_id, decision="information_requested", note=note)


def record_customer_response(session: Session, claim_id: int, *, actor_id: int, message: str | None,
                             has_evidence: bool = False):
    claim = get_return_claim(session, claim_id, lock=True)
    if claim is None:
        raise LookupError("Return claim not found.")
    if claim.workflow_status != "information_requested":
        raise ValueError("This claim is not waiting for customer information.")
    if not (message and message.strip()) and not has_evidence:
        raise ValueError("Provide a response or attach evidence.")
    previous = claim.workflow_status
    claim.workflow_status = "under_review"
    claim.status = "requested"
    claim.updated_at = _utcnow_naive()
    response = message.strip() if message and message.strip() else None
    _event(session, claim, "customer_response", actor_id, previous=previous,
           new=claim.workflow_status, note=response, data={"response": response, "evidence_attached": has_evidence})
    return claim


def record_inspection(session: Session, claim_id: int, *, actor_id: int, inspection_type: str,
                      outcome: str, notes: str, condition_code: str | None = None,
                      handoff_id: int | None = None):
    claim = get_return_claim(session, claim_id, lock=True)
    if claim is None:
        raise LookupError("Return claim not found.")
    if claim.workflow_status in TERMINAL_WORKFLOW_STATUSES:
        raise ValueError("Terminal claims cannot be inspected.")
    if inspection_type not in {"evidence_review", "physical_pickup"}:
        raise ValueError("Invalid inspection type.")
    if outcome not in {"passed", "failed", "needs_more_info"}:
        raise ValueError("Invalid inspection outcome.")
    if not notes.strip():
        raise ValueError("Inspection notes are required.")
    row = ReturnInspection(
        return_request_id=claim.id, inspection_type=inspection_type,
        outcome=outcome, condition_code=condition_code, notes=notes.strip(),
        inspected_by_id=actor_id, handoff_id=handoff_id,
    )
    session.add(row)
    session.flush()
    _event(session, claim, "evidence_review" if inspection_type == "evidence_review" else "physical_inspection",
           actor_id, previous=claim.workflow_status, new=claim.workflow_status,
           note=notes.strip(), data={"inspection_id": row.id, "inspection_type": inspection_type,
                                     "outcome": outcome, "condition_code": condition_code,
                                     "handoff_id": handoff_id})
    return row
