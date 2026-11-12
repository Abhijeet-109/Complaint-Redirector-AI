from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, func, and_

from backend.Database.models import (
    Department,
    User,
    Complaint,
    ComplaintRedirection,
    CommerceOrder,
    ReturnRequest,
    ReturnEvidence,
    ReturnHandoff,
    Refund,
    ReturnRequestEvent,
)
from backend.Database.return_services import (
    apply_claim_decision, claim_details, create_after_collection_refund_handoff,
    get_return_claim, record_inspection,
)
from backend.Database.admin_commerce_services import (
    execute_return_refund, get_return_refund_tracking, list_return_refund_handoffs,
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


class ReturnRefundExecutionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    external_reference: str | None = Field(default=None, min_length=1, max_length=120)


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

    if workflow_status and workflow_status != "all":
        query = query.filter(
            ReturnRequest.workflow_status == workflow_status
        )

    if resolution_type and resolution_type != "all":
        query = query.filter(
            ReturnRequest.resolution_type == resolution_type
        )

    if search and search.strip():
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
            "customer_email": customer.email if customer else None,
            "resolution_type": claim.resolution_type,
            "reason_code": claim.reason_code,
            "description": claim.description,
            "workflow_status": claim.workflow_status,
            "requested_at": (
                claim.requested_at.isoformat()
                if claim.requested_at else None
            ),
        })

    # Calculate real tab counts for Review Queue
    active_base = db.query(ReturnRequest).filter(
        ReturnRequest.workflow_status.isnot(None),
        ReturnRequest.workflow_status.notin_(["rejected", "completed", "cancelled"])
    )
    total_queue = active_base.count()
    pending_queue = active_base.filter(ReturnRequest.workflow_status.in_(["pending_review", "requested", "under_review"])).count()
    info_queue = active_base.filter(ReturnRequest.workflow_status == "information_requested").count()
    inspection_queue = active_base.filter(ReturnRequest.workflow_status.in_(["under_inspection", "inspection"])).count()

    # Calculate real KPI counts for Requests Directory
    total_all = db.query(ReturnRequest).count()
    returns_all = db.query(ReturnRequest).filter(
        (ReturnRequest.resolution_type == "refund") | (ReturnRequest.resolution_type.is_(None))
    ).count()
    replacements_all = db.query(ReturnRequest).filter(ReturnRequest.resolution_type == "replacement").count()
    pending_all = db.query(ReturnRequest).filter(ReturnRequest.workflow_status.in_(["pending_review", "requested", "under_review"])).count()
    resolved_all = db.query(ReturnRequest).filter(ReturnRequest.workflow_status.in_(["resolved", "completed"])).count()

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "tab_counts": {
            "all": total_queue,
            "pending": pending_queue,
            "info": info_queue,
            "inspection": inspection_queue,
        },
        "kpi_counts": {
            "total_requests": total_all,
            "returns": returns_all,
            "replacements": replacements_all,
            "pending_action": pending_all,
            "resolved": resolved_all,
        }
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

    if status and status != "all":
        query = query.filter(ReturnHandoff.status == status)

    if department_name and department_name != "all":
        query = query.join(ReturnHandoff.destination_department).filter(Department.name.ilike(f"%{department_name}%"))

    if search and search.strip():
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
            "request_id": req.id if req else None,
            "claim_id": req.id if req else None,
            "order_number": order.order_number if order else None,
            "customer_name": customer.name if customer else None,
            "current_owner": h.destination_department.name if h.destination_department else "Pending",
            "handoff_from": h.source_department.name if h.source_department else "Returns & Replacement",
            "status": h.status,
            "handoff_type": h.handoff_type,
            "last_updated": (h.updated_at or h.created_at).isoformat() if (h.updated_at or h.created_at) else None,
        })

    total_tracked = db.query(ReturnHandoff).count()
    with_other = db.query(ReturnHandoff).filter(ReturnHandoff.status.in_(["accepted", "in_progress"])).count()
    awaiting = db.query(ReturnHandoff).filter(ReturnHandoff.status == "pending").count()
    completed = db.query(ReturnHandoff).filter(ReturnHandoff.status == "completed").count()

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "kpi_counts": {
            "total_tracked": total_tracked,
            "with_other": with_other,
            "awaiting": awaiting,
            "completed": completed,
        }
    }


@handler_router.get("/tracking-handoffs/{handoff_id}")
def get_tracking_handoff_details(
    handoff_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)
    h = db.query(ReturnHandoff).options(
        selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
        selectinload(ReturnHandoff.source_department),
        selectinload(ReturnHandoff.destination_department),
    ).filter(ReturnHandoff.id == handoff_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Return handoff not found")

    req = h.return_request
    order = req.order if req else None
    customer = order.user if order else None

    return {
        "id": h.id,
        "request_id": req.id if req else None,
        "claim_id": req.id if req else None,
        "order_number": order.order_number if order else None,
        "customer_name": customer.name if customer else None,
        "customer_email": customer.email if customer else None,
        "current_owner": h.destination_department.name if h.destination_department else "Pending",
        "destination_department_id": h.destination_department_id,
        "source_department_id": h.source_department_id,
        "handoff_from": h.source_department.name if h.source_department else "Returns & Replacement",
        "status": h.status,
        "handoff_type": h.handoff_type,
        "created_at": h.created_at.isoformat() if h.created_at else None,
        "last_updated": (h.updated_at or h.created_at).isoformat() if (h.updated_at or h.created_at) else None,
        "completed_at": h.completed_at.isoformat() if h.completed_at else None,
        "failure_reason": h.failure_reason,
        "payload": h.payload or {},
    }


@handler_router.get("/history-audit")
def list_history_audit_for_handler(
    action: str | None = Query(default=None),
    module: str | None = Query(default=None),
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

    if action and action != "all":
        query = query.filter(ReturnRequestEvent.event_type.ilike(f"%{action}%"))

    if search and search.strip():
        search_term = f"%{search.strip()}%"
        query = query.join(ReturnRequestEvent.actor, isouter=True).filter(
            (ReturnRequestEvent.event_type.ilike(search_term)) |
            (ReturnRequestEvent.note.ilike(search_term)) |
            (User.name.ilike(search_term))
        )

    total = query.count()
    events = query.order_by(ReturnRequestEvent.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for ev in events:
        req = ev.return_request
        actor = ev.actor
        action_name = ev.event_type.replace("_", " ").title()
        ref_id = f"TRN-{req.id}" if req else f"EVT-{ev.id}"
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

    total_activities = db.query(ReturnRequestEvent).count()
    request_updates = db.query(ReturnRequestEvent).filter(
        ReturnRequestEvent.event_type.ilike("%status%") | ReturnRequestEvent.event_type.ilike("%request%")
    ).count()
    handoffs_count = db.query(ReturnRequestEvent).filter(
        ReturnRequestEvent.event_type.ilike("%handoff%")
    ).count()
    audit_logs_count = db.query(ReturnRequestEvent).filter(
        ReturnRequestEvent.event_type.ilike("%audit%") | ReturnRequestEvent.event_type.ilike("%inspection%") | ReturnRequestEvent.event_type.ilike("%decision%")
    ).count()

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "kpi_counts": {
            "total_activities": total_activities,
            "request_updates": request_updates,
            "handoffs": handoffs_count,
            "audit_logs": audit_logs_count,
        }
    }


@handler_router.get("/overview-stats")
def get_handler_overview_stats(
    period: str = Query(default="month"),
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

    # Time-series activity based on real timestamps
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    activity_data = []

    if period == "day":
        days_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for i in range(6, -1, -1):
            dt = now - timedelta(days=i)
            start_dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
            end_dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            cnt = db.query(ReturnRequest).filter(
                ReturnRequest.requested_at >= start_dt,
                ReturnRequest.requested_at <= end_dt
            ).count()
            activity_data.append({
                "label": dt.strftime("%a"),
                "value": cnt,
                "is_current": (i == 0)
            })
    elif period == "week":
        for i in range(3, -1, -1):
            start_dt = now - timedelta(days=(i + 1) * 7)
            end_dt = now - timedelta(days=i * 7)
            cnt = db.query(ReturnRequest).filter(
                ReturnRequest.requested_at >= start_dt,
                ReturnRequest.requested_at <= end_dt
            ).count()
            activity_data.append({
                "label": f"Wk {4 - i}",
                "value": cnt,
                "is_current": (i == 0)
            })
    else:  # month (last 6 months)
        for i in range(5, -1, -1):
            # calculate year and month
            m = now.month - i
            y = now.year
            while m <= 0:
                m += 12
                y -= 1
            month_start = datetime(y, m, 1)
            if m == 12:
                next_month = datetime(y + 1, 1, 1)
            else:
                next_month = datetime(y, m + 1, 1)

            cnt = db.query(ReturnRequest).filter(
                ReturnRequest.requested_at >= month_start,
                ReturnRequest.requested_at < next_month
            ).count()
            activity_data.append({
                "label": month_start.strftime("%b"),
                "value": cnt,
                "is_current": (i == 0)
            })

    # compute height_pct
    max_val = max([a["value"] for a in activity_data] + [1])
    for a in activity_data:
        a["height_pct"] = int((a["value"] / max_val) * 85) if a["value"] > 0 else 0

    return {
        "total_requests": total_requests,
        "pending_review": pending_review,
        "in_process": in_process,
        "resolved": resolved,
        "complaints": complaints_count,
        "returns_count": returns_count,
        "replacements_count": replacements_count,
        "activity": activity_data,
    }


@handler_router.get("/reports-stats")
def get_handler_reports_stats(
    days: int = Query(default=30, ge=1, le=365),
    request_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start_time = now - timedelta(days=days)

    query = db.query(ReturnRequest).filter(ReturnRequest.requested_at >= start_time)

    if request_type and request_type != "all":
        query = query.filter(ReturnRequest.resolution_type == request_type)

    if status and status != "all":
        query = query.filter(ReturnRequest.workflow_status == status)

    total_requests = query.count()

    resolved_count = query.filter(ReturnRequest.workflow_status.in_(["resolved", "completed"])).count()
    pending_count = query.filter(ReturnRequest.workflow_status.in_(["pending_review", "requested", "under_review"])).count()
    in_progress_count = query.filter(ReturnRequest.workflow_status.in_(["in_process", "approved", "under_inspection", "information_requested"])).count()

    returns_count = query.filter(
        (ReturnRequest.resolution_type == "refund") | (ReturnRequest.resolution_type.is_(None))
    ).count()
    replacements_count = query.filter(ReturnRequest.resolution_type == "replacement").count()

    returns_dept = _returns_department(db)
    complaints_count = db.query(Complaint).filter(
        Complaint.department_id == returns_dept.id,
        Complaint.create_at >= start_time
    ).count()

    # Time series trend data (11 points across the days window)
    num_points = 11
    interval = max(1, days // (num_points - 1))
    trend_data = []

    for i in range(num_points):
        pt_date = start_time + timedelta(days=i * interval)
        if pt_date > now:
            pt_date = now
        pt_start = pt_date.replace(hour=0, minute=0, second=0, microsecond=0)
        pt_end = pt_date.replace(hour=23, minute=59, second=59, microsecond=999999)

        pt_cnt = query.filter(
            ReturnRequest.requested_at >= pt_start,
            ReturnRequest.requested_at <= pt_end
        ).count()

        trend_data.append({
            "label": pt_date.strftime("%b %d"),
            "val": pt_cnt
        })

    return {
        "total_requests": total_requests,
        "complaints": complaints_count,
        "resolved": resolved_count,
        "pending": pending_count,
        "in_progress": in_progress_count,
        "returns_count": returns_count,
        "replacements_count": replacements_count,
        "trend": trend_data,
    }


@handler_router.get("/returns/{claim_id}")
def handler_return_claim_details(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    claim = _require_claim_access(db, claim_id, current_user)
    details = claim_details(db, claim)
    details["tracking"] = {
        "return_request_id": claim.id,
        "order": details["order"],
        "order_item": {"id": claim.order_item_id, "quantity": claim.quantity,
                       **(details["product"] or {})},
        "resolution_type": claim.resolution_type,
        "refund_timing": claim.refund_timing,
        "returns_status": claim.workflow_status,
        **get_return_refund_tracking(db, claim.id),
        "event_history": details["audit_history"],
    }
    return details


@handler_router.get("/payments/refund-handoffs")
def list_payments_refund_handoffs(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")
    if db.scalar(select(Department.id).where(Department.name == "Payments & Refunds")) is None:
        raise HTTPException(status_code=500, detail="Payments & Refunds department is not configured.")
    return list_return_refund_handoffs(db, status=status_filter, limit=limit, offset=offset)


@handler_router.post("/return-handoffs/{handoff_id}/process-refund")
def process_return_refund_handoff(
    handoff_id: int,
    payload: ReturnRefundExecutionInput,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")
    try:
        return execute_return_refund(
            db, handoff_id=handoff_id, actor=actor,
            external_reference=payload.external_reference,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Refund processing could not be completed safely.") from exc


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
    if payload.status == "completed" and handoff.handoff_type == "refund_processing":
        processed_refund = db.scalar(select(Refund.id).where(
            Refund.return_request_id == handoff.return_request_id,
            Refund.status == "processed",
        ).limit(1))
        if processed_refund is None:
            raise HTTPException(status_code=409, detail="A Payments refund handoff requires a processed Refund record before completion.")
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
    if handoff.handoff_type == "refund_processing" and payload.status in {"accepted", "in_progress"}:
        db.add(ReturnRequestEvent(
            return_request_id=handoff.return_request_id,
            event_type=("payments_handoff_accepted" if payload.status == "accepted"
                        else "payments_processing_started"),
            actor_user_id=actor.id,
            previous_status=previous,
            new_status=payload.status,
            note=payload.note,
            event_data={"handoff_id": handoff.id,
                        "destination_department_id": handoff.destination_department_id},
        ))
    try:
        if payload.status == "completed":
            create_after_collection_refund_handoff(db, handoff, actor_id=actor.id)
        db.commit()
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
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
