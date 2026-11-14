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
    Refund,
    Shipment,
    User,
)
from backend.Database.return_reason_codes import normalize_return_reason_code


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

ORDER_DELIVERY_MILESTONES = {
    "refund_pickup": ("pickup_scheduled", "item_collected"),
    "replacement_fulfillment": (
        "pickup_scheduled",
        "item_collected",
        "replacement_prepared",
        "replacement_ready_to_ship",
        "replacement_out_for_delivery",
        "replacement_delivered",
    ),
}


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def evaluate_return_eligibility(
    session: Session,
    *,
    order: CommerceOrder,
    order_item_id: int,
    requested_quantity: int | None = None,
    resolution_type: str | None = None,
    now: datetime | None = None,
    lock: bool = False,
) -> dict:
    """Evaluate the shared return policy for a customer's purchased item.

    Preview callers omit ``requested_quantity`` and ``resolution_type``.
    Claim creation supplies both and evaluates again inside its transaction.
    """
    shipment = session.scalar(select(Shipment).where(Shipment.order_id == order.id))
    delivered_at = shipment.delivered_at if shipment else None
    result = {
        "order_id": order.id,
        "order_item_id": order_item_id,
        "eligible": False,
        "reason_code": None,
        "message": "This item is eligible for a return or replacement.",
        "delivered_at": delivered_at,
        "return_deadline": None,
        "return_window_days": None,
        "quantity_purchased": None,
        "quantity_already_claimed": 0,
        "quantity_available": 0,
        "active_claim": None,
        "available_resolutions": [],
        "_order_item": None,
    }

    if order.status != "delivered" or shipment is None or shipment.status != "delivered":
        result.update(
            reason_code="not_delivered",
            message="A return can only be requested after confirmed delivery.",
        )
        return result
    if delivered_at is None:
        result.update(
            reason_code="delivery_timestamp_missing",
            message="A return can only be requested after confirmed delivery.",
        )
        return result

    if delivered_at.tzinfo is not None:
        delivered_at = delivered_at.astimezone(timezone.utc).replace(tzinfo=None)
    result["delivered_at"] = delivered_at
    now = now or _utcnow_naive()
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    if delivered_at > now:
        result.update(
            reason_code="invalid_delivery_timestamp",
            message="Invalid delivery timestamp.",
        )
        return result

    item_query = (
        select(CommerceOrderItem)
        .options(
            selectinload(CommerceOrderItem.variant)
            .selectinload(ProductVariant.product)
        )
        .where(
            CommerceOrderItem.id == order_item_id,
            CommerceOrderItem.order_id == order.id,
        )
    )
    if lock:
        item_query = item_query.with_for_update()
    order_item = session.scalar(item_query)
    if order_item is None:
        raise LookupError("Order item not found.")
    result["_order_item"] = order_item

    result["quantity_purchased"] = order_item.quantity
    result["quantity_available"] = order_item.quantity
    if requested_quantity is not None and requested_quantity > order_item.quantity:
        result.update(
            reason_code="quantity_exceeds_purchased",
            message="Requested quantity exceeds purchased quantity.",
        )
        return result

    product = order_item.variant.product if order_item.variant else None
    if product is None:
        raise LookupError("Product information not found.")
    if product.is_returnable is None:
        result.update(
            reason_code="policy_not_configured",
            message="Return policy is not configured for this product.",
        )
        return result
    if type(product.is_returnable) is not bool:
        raise RuntimeError("Invalid return-policy configuration.")
    if product.is_returnable is False:
        result.update(
            reason_code="not_returnable",
            message="This product is not returnable.",
        )
        return result
    if product.return_window_days is None:
        result.update(
            reason_code="policy_not_configured",
            message="Return window is not configured for this product.",
        )
        return result
    if type(product.return_window_days) is not int or product.return_window_days < 0:
        raise RuntimeError("Invalid return-window configuration.")
    if product.is_refundable is not None and type(product.is_refundable) is not bool:
        raise RuntimeError("Invalid refund-policy configuration.")

    deadline = delivered_at + timedelta(days=product.return_window_days)
    result["return_window_days"] = product.return_window_days
    result["return_deadline"] = deadline
    result["available_resolutions"] = (
        (["refund"] if product.is_refundable is True else []) + ["replacement"]
    )
    if now > deadline:
        result.update(
            reason_code="return_window_expired",
            message="The return window has expired.",
        )
        return result

    if resolution_type == "refund" and product.is_refundable is None:
        result.update(
            reason_code="refund_policy_not_configured",
            message="Refund policy is not configured for this product.",
        )
        return result
    if resolution_type == "refund" and product.is_refundable is False:
        result.update(
            reason_code="refund_not_available",
            message="This product is not eligible for a refund.",
        )
        return result

    active_claim_query = (
        select(ReturnRequest)
        .where(
            ReturnRequest.order_item_id == order_item.id,
            ReturnRequest.status.in_(ACTIVE_LEGACY_STATUSES),
            or_(
                ReturnRequest.workflow_status.is_(None),
                ReturnRequest.workflow_status.notin_(TERMINAL_WORKFLOW_STATUSES),
            ),
        )
        .limit(1)
    )
    if lock:
        active_claim_query = active_claim_query.with_for_update()
    active_claim = session.scalar(active_claim_query)

    countable_claim = and_(
        ReturnRequest.status.notin_(("rejected", "cancelled")),
        or_(
            ReturnRequest.workflow_status.is_(None),
            ReturnRequest.workflow_status.notin_(("rejected", "cancelled")),
        ),
    )
    previously_claimed = session.scalar(
        select(func.coalesce(func.sum(ReturnRequest.quantity), 0)).where(
            ReturnRequest.order_item_id == order_item.id,
            countable_claim,
        )
    )
    already_claimed = int(previously_claimed or 0)
    remaining_quantity = order_item.quantity - already_claimed
    result["quantity_already_claimed"] = already_claimed
    result["quantity_available"] = max(0, remaining_quantity)

    if active_claim is not None:
        result["active_claim"] = {
            "id": active_claim.id,
            "status": active_claim.status,
            "workflow_status": active_claim.workflow_status,
            "quantity": active_claim.quantity,
            "resolution_type": active_claim.resolution_type,
            "requested_at": active_claim.requested_at,
        }
        result.update(
            reason_code="active_claim_exists",
            message="An active return request already exists for this item.",
        )
        return result

    if requested_quantity is not None and requested_quantity > remaining_quantity:
        result.update(
            reason_code="quantity_exhausted",
            message=f"Only {remaining_quantity} unit(s) remain eligible for return.",
        )
        return result
    if result["quantity_available"] <= 0:
        result.update(
            reason_code="quantity_exhausted",
            message="No units remain eligible for return.",
        )
        return result

    result["eligible"] = True
    result["reason_code"] = "eligible"
    return result


def _raise_eligibility_failure(result: dict) -> None:
    raise ValueError(result["message"])


def create_return_claim(
    session: Session,
    *,
    user_id: int,
    order_id: int,
    order_item_id: int,
    quantity: int,
    resolution_type: str,
    refund_timing: str | None = None,
    reason_code: str,
    description: str | None = None,
    submission_key: str | None = None,
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
    if refund_timing not in {None, "immediate", "after_collection"}:
        raise ValueError("Invalid refund timing.")

    reason_code = normalize_return_reason_code(reason_code)
    if submission_key is not None:
        import uuid
        try:
            submission_key = str(uuid.UUID(submission_key))
        except (AttributeError, TypeError, ValueError) as exc:
            raise ValueError("A valid return submission key is required.") from exc

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

    if submission_key is not None:
        existing = session.scalar(
            select(ReturnRequest)
            .join(CommerceOrder, ReturnRequest.order_id == CommerceOrder.id)
            .where(ReturnRequest.submission_key == submission_key,
                   CommerceOrder.user_id == user_id)
        )
        if existing is not None:
            same_payload = (
                existing.order_id == order_id
                and existing.order_item_id == order_item_id
                and existing.quantity == quantity
                and existing.resolution_type == resolution_type
                and existing.refund_timing == (refund_timing if resolution_type == "refund" else None)
                and existing.reason_code == reason_code
                and existing.description == (description.strip() if description and description.strip() else None)
            )
            if not same_payload:
                raise ValueError("This return submission key is already associated with another request.")
            return existing

    # Evaluation runs again while the order and item are locked. Preview is
    # informational and cannot authorize a later claim submission.
    eligibility = evaluate_return_eligibility(
        session,
        order=order,
        order_item_id=order_item_id,
        requested_quantity=quantity,
        resolution_type=resolution_type,
        lock=True,
    )
    if not eligibility["eligible"]:
        _raise_eligibility_failure(eligibility)
    order_item = eligibility["_order_item"]

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
        refund_timing=refund_timing if resolution_type == "refund" else None,
        reason_code=reason_code,
        description=description,
        workflow_status="submitted",
        submission_key=submission_key,
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
            "refund_timing": claim.refund_timing,
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
    department_ids = {
        department_id
        for row in handoffs
        for department_id in (row.source_department_id, row.destination_department_id)
    }
    departments = {
        row.id: row.name
        for row in session.scalars(select(Department).where(Department.id.in_(department_ids))).all()
    } if department_ids else {}
    actor_ids = {row.actor_user_id for row in events if row.actor_user_id is not None}
    actors = {
        row.id: row.name
        for row in session.scalars(select(User).where(User.id.in_(actor_ids))).all()
    } if actor_ids else {}
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
        "refund_timing": claim.refund_timing,
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
            "view_url": f"/api/v1/departments/returns/{claim.id}/evidence/{row.id}",
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
            "source_department": departments.get(row.source_department_id),
            "destination_department_id": row.destination_department_id,
            "destination_department": departments.get(row.destination_department_id),
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
            "actor_name": actors.get(row.actor_user_id),
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


def _create_handoff(
    session: Session,
    claim: ReturnRequest,
    *,
    source: Department,
    destination: Department,
    handoff_type: str,
    actor_id: int,
    idempotency_key: str,
    payload: dict,
) -> ReturnHandoff:
    handoff = session.scalar(
        select(ReturnHandoff).where(ReturnHandoff.idempotency_key == idempotency_key)
    )
    if handoff is not None:
        return handoff
    handoff = ReturnHandoff(
        return_request_id=claim.id,
        source_department_id=source.id,
        destination_department_id=destination.id,
        handoff_type=handoff_type,
        status="pending",
        idempotency_key=idempotency_key,
        payload=payload,
        created_by_id=actor_id,
    )
    session.add(handoff)
    session.flush()
    _event(
        session,
        claim,
        "department_handoff_created",
        actor_id,
        previous=claim.workflow_status,
        new=claim.workflow_status,
        data={
            "handoff_id": handoff.id,
            "source_department_id": source.id,
            "destination_department_id": destination.id,
            "handoff_type": handoff_type,
        },
    )
    return handoff


def order_delivery_milestone_state(session: Session, handoff: ReturnHandoff) -> dict:
    sequence = ORDER_DELIVERY_MILESTONES.get(handoff.handoff_type, ())
    events = session.scalars(
        select(ReturnRequestEvent)
        .where(
            ReturnRequestEvent.return_request_id == handoff.return_request_id,
            ReturnRequestEvent.event_type == "order_delivery_milestone",
        )
        .order_by(ReturnRequestEvent.created_at, ReturnRequestEvent.id)
    ).all()
    matching = [
        event for event in events
        if (event.event_data or {}).get("handoff_id") == handoff.id
    ]
    completed = [event.new_status for event in matching]
    valid_prefix = list(sequence[:len(completed)]) == completed
    next_milestone = sequence[len(completed)] if valid_prefix and len(completed) < len(sequence) else None
    next_options = [next_milestone] if next_milestone and handoff.status == "in_progress" else []
    return {
        "milestones": [
            {
                "id": event.id,
                "milestone": event.new_status,
                "note": event.note,
                "actor_user_id": event.actor_user_id,
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            for event in matching
        ],
        "next_milestone_options": next_options,
        "milestone_complete": bool(sequence) and completed == list(sequence),
    }


def record_order_delivery_milestone(
    session: Session,
    handoff_id: int,
    *,
    milestone: str,
    actor_id: int,
    note: str,
) -> dict:
    handoff = session.scalar(
        select(ReturnHandoff).where(ReturnHandoff.id == handoff_id).with_for_update()
    )
    if handoff is None:
        raise LookupError("Return handoff not found.")
    sequence = ORDER_DELIVERY_MILESTONES.get(handoff.handoff_type)
    if sequence is None:
        raise ValueError("This handoff does not support Order & Delivery milestones.")
    if handoff.status != "in_progress":
        raise ValueError("The handoff must be in progress before recording milestones.")
    state = order_delivery_milestone_state(session, handoff)
    expected = (state["next_milestone_options"] or [None])[0]
    if milestone != expected:
        raise ValueError(f"Invalid milestone transition. Expected: {expected or 'none (milestones complete)'}")
    if not note.strip():
        raise ValueError("A milestone note is required.")

    claim = get_return_claim(session, handoff.return_request_id, lock=True)
    if claim is None:
        raise LookupError("Return claim not found.")
    previous = state["milestones"][-1]["milestone"] if state["milestones"] else None
    _event(
        session,
        claim,
        "order_delivery_milestone",
        actor_id,
        previous=previous,
        new=milestone,
        note=note.strip(),
        data={"handoff_id": handoff.id, "handoff_type": handoff.handoff_type},
    )

    if milestone == sequence[-1]:
        handoff.status = "completed"
        handoff.updated_at = _utcnow_naive()
        handoff.completed_at = handoff.updated_at
        if handoff.handoff_type == "refund_pickup":
            create_after_collection_refund_handoff(session, handoff, actor_id=actor_id)
    else:
        handoff.updated_at = _utcnow_naive()
    session.flush()
    return {
        "handoff_id": handoff.id,
        "status": handoff.status,
        **order_delivery_milestone_state(session, handoff),
    }


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
    if decision == "approved" and claim.resolution_type == "refund" and claim.refund_timing not in {
        "immediate", "after_collection"
    }:
        raise ValueError("Refund timing must be selected before approving this refund request.")

    claim.workflow_status = decision
    claim.status = "approved" if decision == "approved" else "rejected" if decision == "rejected" else "requested"
    claim.decision_note = note.strip()
    claim.decision_by_id = actor_id
    claim.decided_at = _utcnow_naive() if decision in {"approved", "rejected"} else None
    claim.updated_at = _utcnow_naive()
    _event(session, claim, decision, actor_id, previous=previous, new=decision, note=note.strip())

    if decision == "approved":
        source = _department_by_name(session, "Returns & Replacement")
        target_name = "Order & Delivery"
        target = _department_by_name(session, target_name)
        handoff_type = "refund_pickup" if claim.resolution_type == "refund" else "replacement_fulfillment"
        pickup = _create_handoff(
            session,
            claim,
            source=source,
            destination=target,
            handoff_type=handoff_type,
            actor_id=actor_id,
            idempotency_key=f"return-claim:{claim.id}:{handoff_type}:v1",
            payload={"claim_id": claim.id, "order_id": claim.order_id,
                     "order_item_id": claim.order_item_id, "quantity": claim.quantity,
                     "resolution_type": claim.resolution_type},
        )
        if claim.resolution_type == "refund" and claim.refund_timing == "immediate":
            payments = _department_by_name(session, "Payments & Refunds")
            _create_handoff(
                session,
                claim,
                source=source,
                destination=payments,
                handoff_type="refund_processing",
                actor_id=actor_id,
                idempotency_key=f"return-claim:{claim.id}:refund_processing:v1",
                payload={"claim_id": claim.id, "order_id": claim.order_id,
                         "order_item_id": claim.order_item_id, "quantity": claim.quantity,
                         "resolution_type": claim.resolution_type, "refund_timing": claim.refund_timing,
                         "pickup_handoff_id": pickup.id},
            )
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
    if inspection_type == "physical_pickup":
        if handoff_id is None:
            raise ValueError("Physical pickup inspection requires a valid reverse-pickup handoff.")
        pickup = session.scalar(
            select(ReturnHandoff)
            .where(
                ReturnHandoff.id == handoff_id,
                ReturnHandoff.return_request_id == claim.id,
                ReturnHandoff.handoff_type == "refund_pickup",
                ReturnHandoff.status.in_(("accepted", "in_progress", "completed")),
            )
            .with_for_update()
        )
        delivery = _department_by_name(session, "Order & Delivery")
        returns = _department_by_name(session, "Returns & Replacement")
        if (
            pickup is None
            or pickup.destination_department_id != delivery.id
            or pickup.source_department_id != returns.id
        ):
            raise ValueError("Physical pickup inspection requires an active Order & Delivery reverse-pickup handoff.")
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


def create_after_collection_refund_handoff(
    session: Session, pickup: ReturnHandoff, *, actor_id: int,
) -> ReturnHandoff | None:
    """Create deferred Payments work only after an O&D pickup is completed."""
    if pickup.handoff_type != "refund_pickup" or pickup.status != "completed":
        return None
    claim = get_return_claim(session, pickup.return_request_id, lock=True)
    if claim is None:
        raise LookupError("Return claim not found.")
    if claim.resolution_type != "refund" or claim.refund_timing != "after_collection":
        return None
    delivery = _department_by_name(session, "Order & Delivery")
    returns = _department_by_name(session, "Returns & Replacement")
    if pickup.destination_department_id != delivery.id or pickup.source_department_id != returns.id:
        raise ValueError("Collection must be confirmed on the Order & Delivery pickup handoff.")
    _event(
        session, claim, "collection_confirmed", actor_id,
        previous="in_progress", new="completed",
        data={"handoff_id": pickup.id, "handoff_type": pickup.handoff_type},
    )
    payments = _department_by_name(session, "Payments & Refunds")
    return _create_handoff(
        session,
        claim,
        source=delivery,
        destination=payments,
        handoff_type="refund_processing",
        actor_id=actor_id,
        idempotency_key=f"return-claim:{claim.id}:refund_processing:v1",
        payload={"claim_id": claim.id, "order_id": claim.order_id,
                 "order_item_id": claim.order_item_id, "quantity": claim.quantity,
                 "resolution_type": claim.resolution_type, "refund_timing": claim.refund_timing,
                 "pickup_handoff_id": pickup.id},
    )


def resolve_return_claim(session: Session, claim_id: int, *, actor_id: int, note: str):
    """Manually resolve a return only after its required department work is complete."""
    claim = get_return_claim(session, claim_id, lock=True)
    if claim is None:
        raise LookupError("Return claim not found.")
    if claim.workflow_status != "approved":
        raise ValueError("Only an approved return request can be resolved.")

    handoffs = session.scalars(
        select(ReturnHandoff).where(ReturnHandoff.return_request_id == claim.id).with_for_update()
    ).all()
    required_type = "refund_pickup" if claim.resolution_type == "refund" else "replacement_fulfillment"
    delivery_handoff = next((row for row in handoffs if row.handoff_type == required_type), None)
    if delivery_handoff is None or delivery_handoff.status != "completed":
        raise ValueError("Order & Delivery work must be completed before resolving this request.")
    if claim.resolution_type == "replacement":
        milestone_state = order_delivery_milestone_state(session, delivery_handoff)
        # Older completed handoffs predate milestone capture; retain their existing resolution path.
        if milestone_state["milestones"] and not milestone_state["milestone_complete"]:
            raise ValueError("The replacement must be delivered before resolving this request.")

    if claim.resolution_type == "refund":
        payments_handoff = next((row for row in handoffs if row.handoff_type == "refund_processing"), None)
        if payments_handoff is None or payments_handoff.status != "completed":
            raise ValueError("Payments work must be completed before resolving this refund request.")
        processed_refund = session.scalar(select(Refund.id).where(
            Refund.return_request_id == claim.id, Refund.status == "processed",
        ).limit(1))
        if processed_refund is None:
            raise ValueError("A processed financial refund is required before resolving this request.")
    elif claim.resolution_type != "replacement":
        raise ValueError("This request has no supported resolution type.")

    previous = claim.workflow_status
    claim.workflow_status = "resolved"
    claim.status = "completed"
    claim.updated_at = _utcnow_naive()
    _event(session, claim, "request_manually_resolved", actor_id, previous=previous,
           new="resolved", note=(note or "").strip())
    return claim
