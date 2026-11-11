from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from backend.Database.models import (
    Department,
    User,
    Complaint,
    ComplaintRedirection,
    CommerceOrder,
    ReturnRequest,
    ReturnEvidence,
    ReturnHandoff,
    ReturnRequestEvent,
)
from backend.Database.return_services import (
    apply_claim_decision, claim_details, get_return_claim, record_inspection,
)
from backend.Database.return_evidence_storage import read_evidence
from backend.Database.schemas import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse
)
from backend.auth.dependencies import get_db, require_role


router = APIRouter(
    prefix="/api/admin/departments",
    tags=["Department Management"]
)

handler_router = APIRouter(
    prefix="/api/v1/departments",
    tags=["Department"],
)


class ReturnDecisionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    note: str = Field(min_length=3, max_length=2000)


class ReturnInspectionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    inspection_type: str = Field(pattern=r"^(evidence_review|physical_pickup)$")
    outcome: str = Field(pattern=r"^(passed|failed|needs_more_info)$")
    notes: str = Field(min_length=3, max_length=2000)
    condition_code: str | None = Field(default=None, max_length=40)


class ReturnHandoffStatusInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    status: str = Field(pattern=r"^(accepted|in_progress|completed|failed)$")
    note: str = Field(min_length=3, max_length=2000)


def _returns_department(db: Session):
    department = db.scalar(select(Department).where(Department.name == "Returns & Replacement"))
    if department is None:
        raise HTTPException(status_code=500, detail="Returns department is not configured.")
    return department


def _require_returns_handler(db: Session, actor):
    if actor.role == "department_handler" and actor.department_id != _returns_department(db).id:
        raise HTTPException(status_code=403, detail="You are not assigned to the Returns & Replacement department.")


def _require_department_handler(db: Session, actor, department_name: str):
    if actor.role != "department_handler":
        return
    department = db.scalar(select(Department).where(Department.name == department_name))
    if department is None:
        raise HTTPException(status_code=500, detail=f"{department_name} department is not configured.")
    if actor.department_id != department.id:
        raise HTTPException(status_code=403, detail=f"You are not assigned to the {department_name} department.")


def _require_claim_access(db: Session, claim_id: int, actor):
    _require_returns_handler(db, actor)
    claim = get_return_claim(db, claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Return claim not found.")
    return claim


@handler_router.get(
    "",
    response_model=list[DepartmentResponse],
)
def list_departments_for_handlers(
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("department_handler", "admin", "super_admin")
    ),
):
    return db.query(Department).order_by(Department.id).all()


@handler_router.get("/returns")
def list_return_claims_for_handler(
    workflow_status: str | None = Query(default=None, min_length=1),
    include_all: bool = Query(default=False),
    resolution_type: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("department_handler", "admin", "super_admin")
    ),
):
    _require_returns_handler(db, current_user)

    query = db.query(ReturnRequest).options(
        selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
        selectinload(ReturnRequest.order_item),
    )

    if not include_all:
        query = query.filter(
            ReturnRequest.workflow_status.isnot(None),
            ReturnRequest.workflow_status.notin_(
                ["rejected", "completed", "cancelled"]
            ),
        )

    if workflow_status:
        query = query.filter(
            ReturnRequest.workflow_status == workflow_status
        )

    if resolution_type:
        query = query.filter(
            ReturnRequest.resolution_type == resolution_type
        )

    if search:
        search_term = f"%{search.strip()}%"
        query = query.join(ReturnRequest.order, isouter=True).join(CommerceOrder.user, isouter=True).filter(
            (CommerceOrder.order_number.ilike(search_term)) |
            (User.name.ilike(search_term)) |
            (ReturnRequest.reason.ilike(search_term)) |
            (ReturnRequest.description.ilike(search_term))
        )

    total = query.count()

    claims = query.order_by(
        ReturnRequest.requested_at.desc()
    ).offset(offset).limit(limit).all()

    items = []

    for claim in claims:
        order = claim.order
        customer = order.user if order else None
        order_item = claim.order_item

        items.append({
            "id": claim.id,
            "order_id": claim.order_id,
            "order_number": order.order_number if order else None,
            "order_item_id": claim.order_item_id,
            "product_name": order_item.product_name if order_item else None,
            "variant_name": order_item.variant_name if order_item else None,
            "sku": order_item.sku if order_item else None,
            "quantity": claim.quantity,
            "customer_name": customer.name if customer else None,
            "resolution_type": claim.resolution_type,
            "reason_code": claim.reason_code,
            "description": claim.description,
            "workflow_status": claim.workflow_status,
            "requested_at": (
                claim.requested_at.isoformat()
                if claim.requested_at else None
            ),
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@handler_router.get("/tracking-handoffs")
def list_tracking_handoffs_for_handler(
    department_name: str | None = Query(default=None),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)

    query = db.query(ReturnHandoff).options(
        selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
        selectinload(ReturnHandoff.source_department),
        selectinload(ReturnHandoff.destination_department),
    )

    if status:
        query = query.filter(ReturnHandoff.status == status)

    if department_name:
        query = query.join(ReturnHandoff.destination_department).filter(Department.name == department_name)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.join(ReturnHandoff.return_request).join(ReturnRequest.order).join(CommerceOrder.user).filter(
            (CommerceOrder.order_number.ilike(search_term)) |
            (User.name.ilike(search_term))
        )

    total = query.count()
    handoffs = query.order_by(ReturnHandoff.updated_at.desc()).offset(offset).limit(limit).all()

    items = []
    for h in handoffs:
        req = h.return_request
        order = req.order if req else None
        customer = order.user if order else None
        items.append({
            "id": h.id,
            "request_id": f"TRN-{1000 + (req.id if req else h.id)}",
            "claim_id": req.id if req else None,
            "order_number": order.order_number if order else f"FK-ORD-{h.id}",
            "customer_name": customer.name if customer else "Customer",
            "current_owner": h.destination_department.name if h.destination_department else "Pending",
            "handoff_from": h.source_department.name if h.source_department else "Returns & Replacement",
            "status": h.status,
            "handoff_type": h.handoff_type,
            "last_updated": (h.updated_at or h.created_at).isoformat() if (h.updated_at or h.created_at) else None,
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@handler_router.get("/history-audit")
def list_history_audit_for_handler(
    action: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)

    query = db.query(ReturnRequestEvent).options(
        selectinload(ReturnRequestEvent.return_request).selectinload(ReturnRequest.order),
        selectinload(ReturnRequestEvent.actor),
    )

    if action:
        query = query.filter(ReturnRequestEvent.event_type == action)

    total = query.count()
    events = query.order_by(ReturnRequestEvent.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for ev in events:
        req = ev.return_request
        actor = ev.actor
        action_name = ev.event_type.replace("_", " ").title()
        ref_id = f"TRN-{1000 + req.id}" if req else f"EVT-{ev.id}"
        details_text = ev.note or f"Status changed to {ev.new_status or ev.event_type}"
        performed_by_name = f"{actor.name} (R&R)" if actor and actor.name else "System"

        items.append({
            "id": ev.id,
            "timestamp": ev.created_at.isoformat() if ev.created_at else None,
            "action": action_name,
            "reference_id": ref_id,
            "details": details_text,
            "performed_by": performed_by_name,
            "new_status": ev.new_status,
            "event_type": ev.event_type,
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@handler_router.get("/overview-stats")
def get_handler_overview_stats(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)

    total_requests = db.query(ReturnRequest).count()
    pending_review = db.query(ReturnRequest).filter(
        ReturnRequest.workflow_status.in_(["pending_review", "requested", "under_review"])
    ).count()
    in_process = db.query(ReturnRequest).filter(
        ReturnRequest.workflow_status.in_(["in_process", "approved", "under_inspection", "information_requested"])
    ).count()
    resolved = db.query(ReturnRequest).filter(
        ReturnRequest.workflow_status.in_(["resolved", "completed"])
    ).count()

    returns_dept = _returns_department(db)
    complaints_count = db.query(Complaint).filter(Complaint.department_id == returns_dept.id).count()

    returns_count = db.query(ReturnRequest).filter(
        (ReturnRequest.resolution_type == "refund") | (ReturnRequest.resolution_type.is_(None))
    ).count()
    replacements_count = db.query(ReturnRequest).filter(ReturnRequest.resolution_type == "replacement").count()

    return {
        "total_requests": total_requests,
        "pending_review": pending_review,
        "in_process": in_process,
        "resolved": resolved,
        "complaints": complaints_count,
        "returns_count": returns_count,
        "replacements_count": replacements_count,
    }


@handler_router.get("/reports-stats")
def get_handler_reports_stats(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)

    total_requests = db.query(ReturnRequest).count()
    returns_dept = _returns_department(db)
    complaints_count = db.query(Complaint).filter(Complaint.department_id == returns_dept.id).count()

    resolved_count = db.query(ReturnRequest).filter(ReturnRequest.workflow_status.in_(["resolved", "completed"])).count()
    pending_count = db.query(ReturnRequest).filter(ReturnRequest.workflow_status.in_(["pending_review", "requested"])).count()
    in_progress_count = db.query(ReturnRequest).filter(ReturnRequest.workflow_status.in_(["in_process", "under_inspection", "information_requested"])).count()

    returns_count = db.query(ReturnRequest).filter(
        (ReturnRequest.resolution_type == "refund") | (ReturnRequest.resolution_type.is_(None))
    ).count()
    replacements_count = db.query(ReturnRequest).filter(ReturnRequest.resolution_type == "replacement").count()

    return {
        "total_requests": total_requests,
        "complaints": complaints_count,
        "resolved": resolved_count,
        "pending": pending_count,
        "in_progress": in_progress_count,
        "returns_count": returns_count,
        "replacements_count": replacements_count,
    }


@handler_router.get("/returns/{claim_id}")
def handler_return_claim_details(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    claim = _require_claim_access(db, claim_id, current_user)
    return claim_details(db, claim)


def _commit_claim_operation(db: Session, operation):
    try:
        result = operation()
        db.commit()
        return result
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="The return claim conflicts with existing workflow data.") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Return workflow operation failed.") from exc


def _decide_claim(claim_id: int, decision: str, payload: ReturnDecisionInput, db: Session, actor):
    _require_claim_access(db, claim_id, actor)
    claim = _commit_claim_operation(db, lambda: apply_claim_decision(
        db, claim_id, actor_id=actor.id, decision=decision, note=payload.note,
    ))
    return {"id": claim.id, "status": claim.status, "workflow_status": claim.workflow_status}


@handler_router.post("/returns/{claim_id}/approve")
def approve_return_claim(claim_id: int, payload: ReturnDecisionInput,
                         db: Session = Depends(get_db),
                         actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    return _decide_claim(claim_id, "approved", payload, db, actor)


@handler_router.post("/returns/{claim_id}/reject")
def reject_return_claim(claim_id: int, payload: ReturnDecisionInput,
                        db: Session = Depends(get_db),
                        actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    return _decide_claim(claim_id, "rejected", payload, db, actor)


@handler_router.post("/returns/{claim_id}/request-information")
def request_return_information(claim_id: int, payload: ReturnDecisionInput,
                               db: Session = Depends(get_db),
                               actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    return _decide_claim(claim_id, "information_requested", payload, db, actor)


@handler_router.post("/returns/{claim_id}/inspections", status_code=status.HTTP_201_CREATED)
def create_return_inspection(claim_id: int, payload: ReturnInspectionInput,
                             db: Session = Depends(get_db),
                             actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    if payload.inspection_type == "evidence_review":
        claim = _require_claim_access(db, claim_id, actor)
    else:
        _require_department_handler(db, actor, "Order & Delivery")
        claim = get_return_claim(db, claim_id)
        if claim is None:
            raise HTTPException(status_code=404, detail="Return claim not found.")
    handoff_id = None
    if payload.inspection_type == "physical_pickup":
        handoff_id = db.scalar(select(ReturnHandoff.id).where(
            ReturnHandoff.return_request_id == claim.id,
            ReturnHandoff.handoff_type == "refund_pickup",
            ReturnHandoff.source_department_id == select(Department.id).where(
                Department.name == "Returns & Replacement"
            ).scalar_subquery(),
            ReturnHandoff.destination_department_id == select(Department.id).where(
                Department.name == "Order & Delivery"
            ).scalar_subquery(),
            ReturnHandoff.status.in_(("accepted", "in_progress", "completed")),
        ).order_by(ReturnHandoff.created_at.desc()).limit(1))
        if handoff_id is None:
            raise HTTPException(status_code=409, detail="Physical inspection requires an accepted Order & Delivery reverse-pickup handoff.")
    row = _commit_claim_operation(db, lambda: record_inspection(
        db, claim.id, actor_id=actor.id, inspection_type=payload.inspection_type,
        outcome=payload.outcome, notes=payload.notes, condition_code=payload.condition_code,
        handoff_id=handoff_id,
    ))
    return {"id": row.id, "inspection_type": row.inspection_type, "outcome": row.outcome,
            "inspected_at": row.inspected_at.isoformat() if row.inspected_at else None}


@handler_router.get("/returns/{claim_id}/evidence/{evidence_id}")
def handler_get_return_evidence(claim_id: int, evidence_id: int,
                                db: Session = Depends(get_db),
                                actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    claim = _require_claim_access(db, claim_id, actor)
    evidence = db.scalar(select(ReturnEvidence).where(
        ReturnEvidence.id == evidence_id,
        ReturnEvidence.return_request_id == claim.id,
        ReturnEvidence.is_active.is_(True),
    ))
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found.")
    path = read_evidence(evidence.storage_key)
    if path is None:
        raise HTTPException(status_code=404, detail="Evidence file is unavailable.")
    from fastapi.responses import FileResponse
    return FileResponse(path, media_type=evidence.mime_type, filename=evidence.original_filename,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@handler_router.patch("/return-handoffs/{handoff_id}/status")
def update_return_handoff_status(handoff_id: int, payload: ReturnHandoffStatusInput,
                                 db: Session = Depends(get_db),
                                 actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    handoff = db.scalar(select(ReturnHandoff).where(ReturnHandoff.id == handoff_id).with_for_update())
    if handoff is None:
        raise HTTPException(status_code=404, detail="Return handoff not found.")
    if actor.role == "department_handler" and actor.department_id != handoff.destination_department_id:
        raise HTTPException(status_code=403, detail="This handoff is assigned to another department.")
    allowed = {"pending": {"accepted", "failed"}, "accepted": {"in_progress", "failed"},
               "in_progress": {"completed", "failed"}}
    previous = handoff.status
    if payload.status not in allowed.get(previous, set()):
        raise HTTPException(status_code=409, detail="Invalid handoff status transition.")
    from datetime import datetime, timezone
    handoff.status = payload.status
    handoff.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if payload.status == "accepted":
        handoff.accepted_by_id = actor.id
    if payload.status in {"completed", "failed"}:
        handoff.completed_at = handoff.updated_at
    if payload.status == "failed":
        handoff.failure_reason = payload.note
    db.add(ReturnRequestEvent(
        return_request_id=handoff.return_request_id,
        event_type="department_handoff_status_changed",
        actor_user_id=actor.id,
        previous_status=previous,
        new_status=payload.status,
        note=payload.note,
        event_data={"handoff_id": handoff.id, "destination_department_id": handoff.destination_department_id},
    ))
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Handoff status could not be updated.") from exc
    return {"id": handoff.id, "status": handoff.status}


@router.post(
    "",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED
)
def create_department(
    department: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("admin", "super_admin")
    )
):

    existing_department = db.query(Department).filter(
        Department.name == department.name
    ).first()

    if existing_department:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Department already exists"
        )

    new_department = Department(
        name=department.name,
        email=department.email
    )

    db.add(new_department)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Department already exists"
        )

    db.refresh(new_department)

    return new_department


@router.get(
    "",
    response_model=list[DepartmentResponse]
)
def list_departments(
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("admin", "super_admin")
    )
):

    return db.query(Department).order_by(
        Department.id
    ).all()


@router.get(
    "/{department_id}",
    response_model=DepartmentResponse
)
def get_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("admin", "super_admin")
    )
):

    department = db.query(Department).filter(
        Department.id == department_id
    ).first()

    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )

    return department


@router.put(
    "/{department_id}",
    response_model=DepartmentResponse
)
def update_department(
    department_id: int,
    department_data: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("admin", "super_admin")
    )
):
    department = db.query(Department).filter(
        Department.id == department_id
    ).first()

    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )

    updates = department_data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No department fields provided"
        )

    if "name" in updates and updates["name"]:
        existing = db.query(Department).filter(
            Department.name == updates["name"],
            Department.id != department.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Department name already exists"
            )
        department.name = updates["name"]

    if "email" in updates and updates["email"]:
        department.email = updates["email"]

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Department name already exists"
        )

    db.refresh(department)
    return department


@router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_role("admin", "super_admin")
    )
):
    department = db.query(Department).filter(
        Department.id == department_id
    ).first()

    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )

    # Check for active staff assigned to this department
    has_handlers = db.query(User).filter(User.department_id == department_id).first()
    if has_handlers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete department '{department.name}': Staff members are currently assigned to it."
        )

    # Check for complaints referencing this department
    has_complaints = db.query(Complaint).filter(
        (Complaint.department_id == department_id) | (Complaint.predicted_department_id == department_id)
    ).first()
    if has_complaints:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete department '{department.name}': Active complaints reference this department."
        )

    # Check for redirection history
    has_redirections = db.query(ComplaintRedirection).filter(
        (ComplaintRedirection.from_department_id == department_id) | (ComplaintRedirection.to_department_id == department_id)
    ).first()
    if has_redirections:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete department '{department.name}': Historical redirection records reference this department."
        )

    db.delete(department)
    db.commit()
