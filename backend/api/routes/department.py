from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, func, and_, or_, cast, String

from backend.Database.models import (
    Department,
    User,
    Complaint,
    ComplaintRedirection,
    CommerceOrder,
    PaymentAttempt,
    ReturnRequest,
    ReturnEvidence,
    ReturnHandoff,
    Refund,
    ReturnRequestEvent,
    Shipment,
    ShipmentEvent,
    Inventory,
    ProductVariant,
    Product,
    ProductCategory,
)
from backend.Database.return_services import (
    apply_claim_decision, claim_details, create_after_collection_refund_handoff,
    get_return_claim, record_inspection, resolve_return_claim,
    order_delivery_milestone_state, record_order_delivery_milestone,
    has_verified_processed_refund,
)
from backend.Database.admin_commerce_services import (
    execute_return_refund, get_return_refund_tracking, list_return_refund_handoffs,
    list_order_delivery_orders, list_order_delivery_shipments, update_order_status, update_shipment,
    list_inventory, get_category_stock_summary,
)
from backend.Database.return_evidence_storage import read_evidence, signed_evidence_url
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
    refund_timing: str | None = Field(default=None, pattern=r"^(immediate|after_collection)$")


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


class ReturnResolutionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    note: str | None = Field(default=None, max_length=2000)


class OrderDeliveryStatusInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    status: str = Field(min_length=1, max_length=24)
    note: str | None = Field(default=None, max_length=500)


class ShipmentStatusInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    status: str | None = Field(default=None, min_length=1, max_length=24)
    note: str | None = Field(default=None, max_length=500)
    carrier: str | None = Field(default=None, max_length=120)
    tracking_reference: str | None = Field(default=None, max_length=120)
    tracking_url: str | None = Field(default=None, max_length=500)
    estimated_delivery_date: datetime | None = None

    @field_validator("tracking_url")
    @classmethod
    def tracking_url_must_be_http(cls, value):
        if value is None:
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Tracking URL must be an absolute HTTP or HTTPS URL.")
        return value

    @field_validator("status")
    @classmethod
    def reject_blank_status(cls, value):
        if value == "":
            raise ValueError("Status cannot be blank.")
        return value


class OrderDeliveryMilestoneInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    milestone: str = Field(min_length=1, max_length=48)
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

    query = db.query(ReturnRequest).options(
        selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
    )
    if status and status != "all":
        query = query.filter(ReturnRequest.workflow_status == status)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(ReturnRequest.order).join(CommerceOrder.user).filter(
            CommerceOrder.order_number.ilike(term) | User.name.ilike(term) |
            cast(ReturnRequest.id, String).ilike(term)
        )
    total = query.count()
    requests = query.order_by(ReturnRequest.updated_at.desc(), ReturnRequest.id.desc()).offset(offset).limit(limit).all()
    items = []
    for req in requests:
        order = req.order
        tracking = get_return_refund_tracking(db, req.id)
        order_state = tracking["order_delivery"]["status"] if tracking.get("order_delivery") else "not_initiated"
        payments = tracking.get("payments")
        payment_state = "not_required" if req.resolution_type == "replacement" else (
            payments["handoff_status"] if isinstance(payments, dict) and payments.get("handoff_status") else "not_initiated"
        )
        if department_name and department_name != "all":
            if department_name == "order" and order_state == "not_initiated": continue
            if department_name == "payment" and payment_state in {"not_initiated", "not_required"}: continue
        items.append({
            "id": req.id, "request_id": req.id, "claim_id": req.id,
            "order_number": order.order_number if order else None,
            "customer_name": order.user.name if order and order.user else None,
            "customer_id": order.user_id if order else None,
            "order_department_status": order_state,
            "payment_department_status": payment_state,
            "status": req.workflow_status or req.status,
            "overall_status": req.workflow_status or req.status,
            "resolution_type": req.resolution_type,
            "last_updated": req.updated_at.isoformat() if req.updated_at else None,
        })
    total_tracked = db.query(func.count(ReturnRequest.id)).scalar() or 0
    with_other = db.query(func.count(ReturnRequest.id)).filter(ReturnRequest.workflow_status.in_(["approved", "in_process", "under_inspection"])).scalar() or 0
    awaiting = db.query(func.count(ReturnRequest.id)).filter(ReturnRequest.workflow_status.in_(["submitted", "pending_review"])).scalar() or 0
    completed = db.query(func.count(ReturnRequest.id)).filter(ReturnRequest.workflow_status == "completed").scalar() or 0

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
    period: str = Query(default="day", pattern="^(day|week|month)$"),
    days: int | None = Query(default=None, ge=1, le=365),
    request_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, current_user)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if days is not None:
        period = "day"
        bucket_count = min(days, 30)
        first_bucket = today - timedelta(days=bucket_count - 1)
    elif period == "week":
        bucket_count = 8
        first_bucket = today - timedelta(days=today.weekday() + 7 * (bucket_count - 1))
    elif period == "month":
        bucket_count = 6
        first_month = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
        for _ in range(bucket_count - 2):
            first_month = (first_month - timedelta(days=1)).replace(day=1)
        first_bucket = first_month
    else:
        bucket_count = 7
        first_bucket = today - timedelta(days=bucket_count - 1)
    start_time = first_bucket

    query = db.query(ReturnRequest).filter(
        ReturnRequest.requested_at >= start_time,
        ReturnRequest.requested_at <= now,
    )

    if request_type and request_type != "all":
        if request_type not in {"refund", "replacement"}:
            raise HTTPException(status_code=422, detail="Unsupported report request type filter.")
        if request_type == "refund":
            query = query.filter((ReturnRequest.resolution_type == "refund")
                                 | ReturnRequest.resolution_type.is_(None))
        else:
            query = query.filter(ReturnRequest.resolution_type == request_type)

    pending_statuses = {"pending_review", "requested", "under_review", "submitted"}
    progress_statuses = {"in_process", "approved", "under_inspection", "information_requested"}
    resolved_statuses = {"resolved", "completed"}
    if status and status != "all":
        status_groups = {"pending": pending_statuses, "in_progress": progress_statuses,
                         "resolved": resolved_statuses}
        if status not in status_groups:
            raise HTTPException(status_code=422, detail="Unsupported report status filter.")
        query = query.filter(ReturnRequest.workflow_status.in_(status_groups[status]))

    grouped = query.with_entities(ReturnRequest.resolution_type, ReturnRequest.workflow_status,
                                  func.count(ReturnRequest.id)).group_by(
        ReturnRequest.resolution_type, ReturnRequest.workflow_status
    ).all()
    total_requests = sum(count for _resolution, _workflow, count in grouped)
    resolved_count = sum(count for _resolution, workflow, count in grouped if (workflow or "submitted") in resolved_statuses)
    pending_count = sum(count for _resolution, workflow, count in grouped if (workflow or "submitted") in pending_statuses)
    in_progress_count = sum(count for _resolution, workflow, count in grouped if (workflow or "submitted") in progress_statuses)
    returns_count = sum(count for resolution, _workflow, count in grouped if resolution != "replacement")
    replacements_count = sum(count for resolution, _workflow, count in grouped if resolution == "replacement")

    returns_dept = _returns_department(db)
    complaints_count = db.query(Complaint).filter(
        Complaint.department_id == returns_dept.id,
        Complaint.create_at >= start_time
    ).count()

    trend_buckets = []
    bucket_totals = {}
    bucket_type_totals = {}
    if db.get_bind().dialect.name == "postgresql":
        bucket_expr = func.date_trunc(period, ReturnRequest.requested_at)
        series = query.with_entities(bucket_expr, ReturnRequest.resolution_type,
                                     func.count(ReturnRequest.id)).group_by(
            bucket_expr, ReturnRequest.resolution_type
        ).all()
        for bucket_date, resolution, count in series:
            key = bucket_date.replace(hour=0, minute=0, second=0, microsecond=0)
            bucket_totals[key] = bucket_totals.get(key, 0) + count
            type_counts = bucket_type_totals.setdefault(key, {"returns": 0, "replacements": 0})
            type_counts["replacements" if resolution == "replacement" else "returns"] += count
    else:
        rows = query.with_entities(ReturnRequest.requested_at, ReturnRequest.resolution_type).all()
        for row in rows:
            key = row.requested_at.replace(hour=0, minute=0, second=0, microsecond=0)
            if period == "week":
                key -= timedelta(days=key.weekday())
            elif period == "month":
                key = key.replace(day=1)
            bucket_totals[key] = bucket_totals.get(key, 0) + 1
            type_counts = bucket_type_totals.setdefault(key, {"returns": 0, "replacements": 0})
            type_counts["replacements" if row.resolution_type == "replacement" else "returns"] += 1

    for index in range(bucket_count):
        if period == "week":
            bucket_start = first_bucket + timedelta(weeks=index)
            bucket_end = bucket_start + timedelta(days=6)
            label = f"Week {index + 1}"
        elif period == "month":
            bucket_start = first_bucket
            for _ in range(index):
                bucket_start = (bucket_start.replace(day=28) + timedelta(days=4)).replace(day=1)
            bucket_end = (bucket_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            label = bucket_start.strftime("%b")
        else:
            bucket_start = first_bucket + timedelta(days=index)
            bucket_end = bucket_start
            label = bucket_start.strftime("%a") if days is None else bucket_start.strftime("%b %d")
        trend_buckets.append({"label": label, "val": bucket_totals.get(bucket_start, 0),
                              "returns": bucket_type_totals.get(bucket_start, {}).get("returns", 0),
                              "replacements": bucket_type_totals.get(bucket_start, {}).get("replacements", 0),
                              "start": bucket_start.date().isoformat(), "end": min(bucket_end, now).date().isoformat()})

    return {
        "total_requests": total_requests,
        "complaints": complaints_count,
        "resolved": resolved_count,
        "pending": pending_count,
        "in_progress": in_progress_count,
        "returns_count": returns_count,
        "replacements_count": replacements_count,
        "period": period,
        "trend": trend_buckets,
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


@handler_router.get("/returns-tracking")
def list_return_tracking(
    workflow_status: str | None = Query(default=None),
    resolution_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_returns_handler(db, actor)
    query = db.query(ReturnRequest).options(
        selectinload(ReturnRequest.order_item),
        selectinload(ReturnRequest.order),
    )
    if workflow_status and workflow_status != "all":
        query = query.filter(ReturnRequest.workflow_status == workflow_status)
    if resolution_type and resolution_type != "all":
        query = query.filter(ReturnRequest.resolution_type == resolution_type)
    total = query.count()
    claims = query.order_by(ReturnRequest.requested_at.desc(), ReturnRequest.id.desc()).offset(offset).limit(limit).all()
    rows = []
    for claim in claims:
        item = claim.order_item
        variant = item.variant if item else None
        tracking = get_return_refund_tracking(db, claim.id)
        events = db.scalars(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == claim.id,
        ).order_by(ReturnRequestEvent.created_at, ReturnRequestEvent.id)).all()
        payments = tracking["payments"]
        actual_refunds = payments.get("refunds", []) if isinstance(payments, dict) else []
        rows.append({
            "return_request_id": claim.id,
            "product_id": variant.product_id if variant else None,
            "order_id": claim.order_id,
            "request_type": claim.resolution_type,
            "returns_status": claim.workflow_status,
            "order_delivery_status": tracking["order_delivery"]["status"] if tracking["order_delivery"] else None,
            "payments_handoff_status": payments["handoff_status"] if isinstance(payments, dict) else "N/A",
            "financial_refund_status": [row["status"] for row in actual_refunds],
            "overall_status": claim.workflow_status,
            "requested_at": claim.requested_at.isoformat() if claim.requested_at else None,
            "updated_at": claim.updated_at.isoformat() if claim.updated_at else None,
            "history": [{"event_type": event.event_type,
                         "previous_status": event.previous_status,
                         "new_status": event.new_status,
                         "actor_user_id": event.actor_user_id,
                         "note": event.note,
                         "created_at": event.created_at.isoformat() if event.created_at else None}
                        for event in events],
        })
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


@handler_router.get("/order-delivery/return-handoffs")
def list_order_delivery_return_handoffs(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    department = db.scalar(select(Department).where(Department.name == "Order & Delivery"))
    if department is None:
        raise HTTPException(status_code=500, detail="Order & Delivery department is not configured.")
    query = db.query(ReturnHandoff).filter(
        ReturnHandoff.destination_department_id == department.id,
        ReturnHandoff.handoff_type.in_(("refund_pickup", "replacement_fulfillment")),
    )
    if status_filter and status_filter != "all":
        query = query.filter(ReturnHandoff.status == status_filter)
    total = query.count()
    handoffs = query.options(
        selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order),
        selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order_item),
    ).order_by(ReturnHandoff.updated_at.desc(), ReturnHandoff.id.desc()).offset(offset).limit(limit).all()
    items = []
    for handoff in handoffs:
        claim = handoff.return_request
        order = claim.order if claim else None
        product_item = claim.order_item if claim else None
        customer = db.get(User, order.user_id) if order else None
        items.append({
            "handoff_id": handoff.id,
            "id": handoff.id,
            "return_request_id": claim.id if claim else None,
            "claim_id": claim.id if claim else None,
            "handoff_type": handoff.handoff_type,
            "handoff_status": handoff.status,
            "status": handoff.status,
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else None,
            "customer_name": customer.name if customer else None,
            "item_name": product_item.product_name if product_item else None,
            "product_name": product_item.product_name if product_item else None,
            "item": ({"order_item_id": product_item.id, "product_name": product_item.product_name,
                      "variant_name": product_item.variant_name, "sku": product_item.sku,
                      "quantity": claim.quantity} if product_item and claim else None),
            "order_status": order.status if order else None,
            "created_at": handoff.created_at.isoformat() if handoff.created_at else None,
            "updated_at": handoff.updated_at.isoformat() if handoff.updated_at else None,
        })
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@handler_router.get("/order-delivery/return-handoffs/{handoff_id}")
def get_order_delivery_return_handoff(
    handoff_id: int,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    department = db.scalar(select(Department).where(Department.name == "Order & Delivery"))
    if department is None:
        raise HTTPException(status_code=500, detail="Order & Delivery department is not configured.")
    handoff = db.scalar(
        select(ReturnHandoff)
        .options(
            selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
            selectinload(ReturnHandoff.source_department),
            selectinload(ReturnHandoff.destination_department),
        )
        .where(ReturnHandoff.id == handoff_id, ReturnHandoff.destination_department_id == department.id)
    )
    if handoff is None or handoff.handoff_type not in ("refund_pickup", "replacement_fulfillment"):
        raise HTTPException(status_code=404, detail="Order & Delivery handoff not found.")
    claim = handoff.return_request
    order = claim.order if claim else None
    customer = order.user if order else None
    return {
        "id": handoff.id,
        "request_id": claim.id if claim else None,
        "claim_id": claim.id if claim else None,
        "order_id": order.id if order else None,
        "order_number": order.order_number if order else None,
        "customer_name": customer.name if customer else None,
        "customer_email": customer.email if customer else None,
        "current_owner": "Order & Delivery",
        "destination_department_id": handoff.destination_department_id,
        "source_department_id": handoff.source_department_id,
        "handoff_from": handoff.source_department.name if handoff.source_department else "Returns & Replacement",
        "status": handoff.status,
        "handoff_type": handoff.handoff_type,
        "created_at": handoff.created_at.isoformat() if handoff.created_at else None,
        "last_updated": (handoff.updated_at or handoff.created_at).isoformat() if (handoff.updated_at or handoff.created_at) else None,
        "completed_at": handoff.completed_at.isoformat() if handoff.completed_at else None,
        "failure_reason": handoff.failure_reason,
        "payload": handoff.payload or {},
        **order_delivery_milestone_state(db, handoff),
    }


@handler_router.patch("/order-delivery/return-handoffs/{handoff_id}/milestones")
def add_order_delivery_return_handoff_milestone(
    handoff_id: int,
    payload: OrderDeliveryMilestoneInput,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    if actor.role != "department_handler":
        raise HTTPException(status_code=403, detail="Return milestones require an assigned Order & Delivery handler.")
    return _commit_claim_operation(db, lambda: record_order_delivery_milestone(
        db, handoff_id, milestone=payload.milestone, actor_id=actor.id, note=payload.note,
    ))


@handler_router.get("/order-delivery/orders")
def list_order_delivery_orders_for_handler(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    try:
        return list_order_delivery_orders(db, status=status_filter, limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@handler_router.patch("/order-delivery/orders/{order_id}/status")
def patch_order_delivery_order_status(
    order_id: int,
    payload: OrderDeliveryStatusInput,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    try:
        return update_order_status(db, order_id, payload.status, changed_by=actor, note=payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@handler_router.get("/order-delivery/shipments")
def list_order_delivery_shipments_for_handler(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    try:
        return list_order_delivery_shipments(db, status=status_filter, limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@handler_router.patch("/order-delivery/shipments/{order_id}/status")
def patch_order_delivery_shipment_status(
    order_id: int,
    payload: ShipmentStatusInput,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    try:
        return update_shipment(
            db, order_id, status=payload.status, notes=payload.note,
            carrier=payload.carrier, tracking_reference=payload.tracking_reference,
            tracking_url=payload.tracking_url, estimated_delivery_date=payload.estimated_delivery_date,
            changed_by=actor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@handler_router.get("/order-delivery/dashboard")
def get_order_delivery_dashboard(
    period: str = Query(default="month"),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")

    actionable_orders = db.scalar(
        select(func.count(CommerceOrder.id)).where(
            CommerceOrder.status.in_(["placed", "accepted", "processing", "packed", "ready_to_ship"])
        )
    ) or 0
    actionable_shipments = db.scalar(
        select(func.count(Shipment.id)).where(
            Shipment.status.in_(["ready_for_dispatch", "received", "scheduled", "shipped", "out_for_delivery"])
        )
    ) or 0
    orders_requiring_action = actionable_orders + actionable_shipments

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    new_orders = db.scalar(
        select(func.count(CommerceOrder.id)).where(
            CommerceOrder.created_at >= start_of_today,
            CommerceOrder.status.not_in(["cancelled", "payment_failed"]),
        )
    ) or 0
    if new_orders == 0:
        new_orders = db.scalar(
            select(func.count(CommerceOrder.id)).where(CommerceOrder.status == "placed")
        ) or 0

    in_fulfilment = db.scalar(
        select(func.count(CommerceOrder.id)).where(
            CommerceOrder.status.in_(["accepted", "processing", "packed"])
        )
    ) or 0

    ready_to_ship = db.scalar(
        select(func.count(CommerceOrder.id)).where(
            CommerceOrder.status == "ready_to_ship"
        )
    ) or 0

    # Shipment overview counts
    shipment_rows = db.execute(
        select(Shipment.status, func.count(Shipment.id)).group_by(Shipment.status)
    ).all()
    shipment_counts = {r[0]: r[1] for r in shipment_rows}
    shipment_overview = {
        "ready_for_dispatch": shipment_counts.get("ready_for_dispatch", 0),
        "scheduled": shipment_counts.get("scheduled", 0),
        "shipped": shipment_counts.get("shipped", 0),
        "out_for_delivery": shipment_counts.get("out_for_delivery", 0),
        "delivered": shipment_counts.get("delivered", 0),
    }

    # Inventory Health
    total_skus = db.scalar(select(func.count(Inventory.id))) or 0
    low_stock = db.scalar(
        select(func.count(Inventory.id)).where(
            Inventory.available_stock > 0,
            Inventory.available_stock <= 10,
        )
    ) or 0
    out_of_stock = db.scalar(
        select(func.count(Inventory.id)).where(Inventory.available_stock == 0)
    ) or 0
    health_score = int(round(((total_skus - out_of_stock) / total_skus) * 100)) if total_skus > 0 else 100

    # Historical Activity Chart (Orders vs Shipments)
    activity_chart = []
    if period == "day":
        for i in range(6, -1, -1):
            dt = now - timedelta(days=i)
            start_dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
            end_dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            orders_cnt = db.scalar(
                select(func.count(CommerceOrder.id)).where(
                    CommerceOrder.created_at >= start_dt,
                    CommerceOrder.created_at <= end_dt,
                    CommerceOrder.status.not_in(["cancelled", "payment_failed"]),
                )
            ) or 0
            shipments_cnt = db.scalar(
                select(func.count(Shipment.id)).where(
                    Shipment.created_at >= start_dt,
                    Shipment.created_at <= end_dt,
                )
            ) or 0
            activity_chart.append({
                "label": dt.strftime("%a"),
                "orders": orders_cnt,
                "shipments": shipments_cnt,
                "is_current": (i == 0),
            })
    elif period == "week":
        for i in range(3, -1, -1):
            start_dt = now - timedelta(days=(i + 1) * 7)
            end_dt = now - timedelta(days=i * 7)
            orders_cnt = db.scalar(
                select(func.count(CommerceOrder.id)).where(
                    CommerceOrder.created_at >= start_dt,
                    CommerceOrder.created_at <= end_dt,
                    CommerceOrder.status.not_in(["cancelled", "payment_failed"]),
                )
            ) or 0
            shipments_cnt = db.scalar(
                select(func.count(Shipment.id)).where(
                    Shipment.created_at >= start_dt,
                    Shipment.created_at <= end_dt,
                )
            ) or 0
            activity_chart.append({
                "label": f"Wk {4 - i}",
                "orders": orders_cnt,
                "shipments": shipments_cnt,
                "is_current": (i == 0),
            })
    else:  # month
        for i in range(5, -1, -1):
            m = now.month - i
            y = now.year
            while m <= 0:
                m += 12
                y -= 1
            month_start = datetime(y, m, 1)
            next_month = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
            orders_cnt = db.scalar(
                select(func.count(CommerceOrder.id)).where(
                    CommerceOrder.created_at >= month_start,
                    CommerceOrder.created_at < next_month,
                    CommerceOrder.status.not_in(["cancelled", "payment_failed"]),
                )
            ) or 0
            shipments_cnt = db.scalar(
                select(func.count(Shipment.id)).where(
                    Shipment.created_at >= month_start,
                    Shipment.created_at < next_month,
                )
            ) or 0
            activity_chart.append({
                "label": month_start.strftime("%b"),
                "orders": orders_cnt,
                "shipments": shipments_cnt,
                "is_current": (i == 0),
            })

    # Recent Orders
    recent_orders_db = db.scalars(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.user), selectinload(CommerceOrder.items))
        .where(CommerceOrder.status.not_in(["cancelled", "payment_failed"]))
        .order_by(CommerceOrder.created_at.desc(), CommerceOrder.id.desc())
        .limit(5)
    ).all()
    recent_orders = [
        {
            "id": ord.id,
            "order_number": ord.order_number,
            "customer_name": ord.user.name if ord.user else "Customer",
            "total_amount": float(ord.total_amount or 0),
            "currency": ord.currency or "INR",
            "status": ord.status,
            "created_at": ord.created_at.isoformat() if ord.created_at else None,
        }
        for ord in recent_orders_db
    ]

    # Recent Shipments
    recent_shipments_db = db.scalars(
        select(Shipment)
        .join(CommerceOrder, CommerceOrder.id == Shipment.order_id)
        .options(selectinload(Shipment.order).selectinload(CommerceOrder.user))
        .order_by(Shipment.created_at.desc(), Shipment.id.desc())
        .limit(5)
    ).all()
    recent_shipments = []
    for shp in recent_shipments_db:
        addr = shp.order.delivery_address or {} if shp.order else {}
        dest_parts = [addr.get("city"), addr.get("state")]
        dest = ", ".join([p for p in dest_parts if p]) or "Standard Delivery"
        recent_shipments.append({
            "id": shp.id,
            "shipment_id": f"SH-{shp.id:04d}",
            "order_id": shp.order_id,
            "order_number": shp.order.order_number if shp.order else f"#{shp.order_id}",
            "destination": dest,
            "eta": shp.estimated_delivery_date.strftime("%b %d, %H:%M") if shp.estimated_delivery_date else (
                "Today 14:30" if shp.status in ["in_transit", "out_for_delivery"] else "Scheduled"
            ),
            "status": shp.status,
            "carrier": shp.carrier or "Standard Carrier",
        })

    # Inventory Alerts (Low stock or out of stock)
    alert_rows = db.execute(
        select(Inventory, ProductVariant, Product)
        .join(ProductVariant, ProductVariant.id == Inventory.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Inventory.available_stock <= 15)
        .order_by(Inventory.available_stock.asc())
        .limit(5)
    ).all()
    inventory_alerts = [
        {
            "id": inv.id,
            "product_name": prod.name,
            "variant_name": var.name,
            "sku": var.sku,
            "available_stock": inv.available_stock,
            "reorder_level": 20,
            "stock_status": inv.stock_status,
        }
        for inv, var, prod in alert_rows
    ]

    return {
        "orders_requiring_action": orders_requiring_action,
        "new_orders": new_orders,
        "in_fulfilment": in_fulfilment,
        "ready_to_ship": ready_to_ship,
        "shipment_overview": shipment_overview,
        "inventory_health": {
            "total_skus": total_skus,
            "low_stock": low_stock,
            "out_of_stock": out_of_stock,
            "health_score": health_score,
        },
        "activity_chart": activity_chart,
        "recent_orders": recent_orders,
        "recent_shipments": recent_shipments,
        "inventory_alerts": inventory_alerts,
        "updated_at": now.isoformat(),
    }


@handler_router.get("/order-delivery/inventory")
def list_order_delivery_inventory_for_handler(
    search: str | None = Query(default=None),
    stock_status: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    return list_inventory(
        db,
        search=search,
        stock_status=stock_status,
        category_id=category_id,
        limit=limit,
        offset=offset,
    )


@handler_router.get("/order-delivery/inventory/categories")
def get_order_delivery_inventory_categories(
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    return get_category_stock_summary(db)


@handler_router.get("/order-delivery/exceptions")
def list_order_delivery_exceptions(
    search: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    stmt = (
        select(Shipment)
        .join(CommerceOrder, CommerceOrder.id == Shipment.order_id)
        .options(
            selectinload(Shipment.events),
            selectinload(Shipment.order).selectinload(CommerceOrder.items),
            selectinload(Shipment.order).selectinload(CommerceOrder.user),
        )
        .where(
            or_(
                Shipment.status == "failed",
                and_(
                    Shipment.estimated_delivery_date.is_not(None),
                    Shipment.estimated_delivery_date < now,
                    Shipment.status.not_in(["delivered", "cancelled"]),
                ),
            )
        )
    )

    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                CommerceOrder.order_number.ilike(term),
                Shipment.carrier.ilike(term),
                Shipment.tracking_reference.ilike(term),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    shipments = db.scalars(stmt.order_by(Shipment.id.desc()).offset(offset).limit(limit)).all()

    items = []
    for shp in shipments:
        order_data = shp.order
        addr = order_data.delivery_address or {}
        dest_parts = [addr.get("city"), addr.get("state")]
        dest = ", ".join([p for p in dest_parts if p]) or "Address on file"
        reason = "Delivery attempt failed" if shp.status == "failed" else "Overdue delivery date"
        items.append({
            "id": shp.id,
            "shipment_id": f"SH-{shp.id:04d}",
            "order_id": shp.order_id,
            "order_number": order_data.order_number,
            "customer_name": order_data.user.name if order_data.user else "Customer",
            "destination": dest,
            "exception_reason": reason,
            "status": shp.status,
            "estimated_delivery_date": shp.estimated_delivery_date.isoformat() if shp.estimated_delivery_date else None,
            "carrier": shp.carrier or "Not assigned",
            "tracking_reference": shp.tracking_reference or "Not provided",
            "notes": shp.notes,
            "created_at": shp.created_at.isoformat() if shp.created_at else None,
        })

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@handler_router.get("/order-delivery/history-audit")
def list_order_delivery_history_audit(
    search: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")

    stmt = (
        select(ShipmentEvent)
        .options(
            selectinload(ShipmentEvent.changed_by),
            selectinload(ShipmentEvent.shipment).selectinload(Shipment.order),
            selectinload(ShipmentEvent.order),
        )
        .order_by(ShipmentEvent.created_at.desc(), ShipmentEvent.id.desc())
    )

    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                ShipmentEvent.note.ilike(term),
                ShipmentEvent.new_status.ilike(term),
                ShipmentEvent.previous_status.ilike(term),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    events = db.scalars(stmt.offset(offset).limit(limit)).all()

    items = []
    for ev in events:
        ref_id = f"EVT-{ev.id}"
        order_num = None
        if ev.order:
            order_num = ev.order.order_number
        elif ev.shipment and ev.shipment.order:
            order_num = ev.shipment.order.order_number

        items.append({
            "id": ev.id,
            "timestamp": ev.created_at.isoformat() if ev.created_at else None,
            "event_type": ev.event_type,
            "reference_id": order_num or ref_id,
            "previous_status": ev.previous_status,
            "new_status": ev.new_status,
            "performed_by": ev.changed_by.name if ev.changed_by else "System / Handler",
            "note": ev.note or f"Updated status to {ev.new_status}",
        })

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@handler_router.get("/order-delivery/reports-stats")
def get_order_delivery_reports_stats(
    period: str = Query(default="month"),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Order & Delivery")
    department = db.scalar(select(Department).where(Department.name == "Order & Delivery"))

    total_orders = db.scalar(select(func.count(CommerceOrder.id))) or 0
    delivered_orders = db.scalar(
        select(func.count(CommerceOrder.id)).where(CommerceOrder.status == "delivered")
    ) or 0
    shipped_orders = db.scalar(
        select(func.count(Shipment.id)).where(Shipment.status.in_(["shipped", "out_for_delivery", "delivered"]))
    ) or 0
    completed_handoffs = 0
    if department:
        completed_handoffs = db.scalar(
            select(func.count(ReturnHandoff.id)).where(
                ReturnHandoff.destination_department_id == department.id,
                ReturnHandoff.status == "completed",
            )
        ) or 0

    return {
        "total_orders": total_orders,
        "delivered_orders": delivered_orders,
        "shipped_orders": shipped_orders,
        "completed_handoffs": completed_handoffs,
        "period": period,
    }


@handler_router.post("/returns/{claim_id}/resolve")
def resolve_return_claim_handler(
    claim_id: int,
    payload: ReturnResolutionInput,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Returns & Replacement")
    if actor.role != "department_handler":
        raise HTTPException(status_code=403, detail="Final resolution requires an assigned Returns & Replacement handler.")
    _require_claim_access(db, claim_id, actor)
    claim = _commit_claim_operation(db, lambda: resolve_return_claim(
        db, claim_id, actor_id=actor.id, note=payload.note or "",
    ))
    return {"id": claim.id, "workflow_status": claim.workflow_status, "status": claim.status}


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
    if actor.role != "department_handler":
        raise HTTPException(status_code=403, detail="Refund handoffs can only be processed by an assigned Payments & Refunds handler.")
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


@handler_router.get("/payments/dashboard")
def get_payments_dashboard(
    period: str = Query(default="month"),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")

    # 1. Total Online Collections (captured attempts)
    online_collected = db.scalar(
        select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
            PaymentAttempt.status == "captured"
        )
    ) or 0

    # 2. Total COD Collections (delivered COD orders with delivered shipments)
    cod_collected = db.scalar(
        select(func.coalesce(func.sum(CommerceOrder.total_amount), 0))
        .join(Shipment, Shipment.order_id == CommerceOrder.id)
        .where(
            CommerceOrder.payment_method == "cod",
            CommerceOrder.status == "delivered",
            Shipment.status == "delivered",
        )
    ) or 0

    total_collected = float(Decimal(str(online_collected)) + Decimal(str(cod_collected)))

    # 3. Total Refunded (completed/processed refunds)
    total_refunded = float(db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.status == "processed"
        )
    ) or 0)

    # 4. Net Collections
    net_collections = total_collected - total_refunded

    # 5. Refunds Pending (approved refund handoffs awaiting processing)
    payments_dept = db.scalar(select(Department).where(Department.name == "Payments & Refunds"))
    refunds_pending_amount = 0.0
    pending_handoffs_count = 0
    if payments_dept:
        pending_handoffs = db.scalars(
            select(ReturnHandoff)
            .options(
                selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order_item)
            )
            .where(
                ReturnHandoff.destination_department_id == payments_dept.id,
                ReturnHandoff.handoff_type == "refund_processing",
                ReturnHandoff.status.in_(["pending", "in_progress", "accepted"]),
            )
        ).all()
        pending_handoffs_count = len(pending_handoffs)
        for h in pending_handoffs:
            if h.return_request and h.return_request.order_item:
                refunds_pending_amount += float(h.return_request.order_item.unit_price * h.return_request.quantity)

    # 6. Collections & Refunds Activity Chart (Day / Week / Month)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    activity_chart = []
    selected_period_net = 0.0

    if period == "day":
        for i in range(6, -1, -1):
            day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            label = day_start.strftime("%d %b")

            col = float(db.scalar(
                select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
                    PaymentAttempt.status == "captured",
                    PaymentAttempt.created_at >= day_start,
                    PaymentAttempt.created_at < day_end,
                )
            ) or 0)
            ref = float(db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.status == "processed",
                    Refund.created_at >= day_start,
                    Refund.created_at < day_end,
                )
            ) or 0)
            net = col - ref
            activity_chart.append({"label": label, "collections": col, "refunds": ref, "net": net})
        if activity_chart:
            selected_period_net = activity_chart[-1]["net"]

    elif period == "week":
        for i in range(7, -1, -1):
            w_start = (now - timedelta(weeks=i+1)).replace(hour=0, minute=0, second=0, microsecond=0)
            w_end = (now - timedelta(weeks=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            label = f"Wk {w_start.strftime('%W')}"

            col = float(db.scalar(
                select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
                    PaymentAttempt.status == "captured",
                    PaymentAttempt.created_at >= w_start,
                    PaymentAttempt.created_at < w_end,
                )
            ) or 0)
            ref = float(db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.status == "processed",
                    Refund.created_at >= w_start,
                    Refund.created_at < w_end,
                )
            ) or 0)
            net = col - ref
            activity_chart.append({"label": label, "collections": col, "refunds": ref, "net": net})
        if activity_chart:
            selected_period_net = activity_chart[-1]["net"]

    else:
        current_year = now.year
        current_month = now.month
        for m in range(1, 13):
            m_start = datetime(current_year, m, 1)
            if m == 12:
                m_end = datetime(current_year + 1, 1, 1)
            else:
                m_end = datetime(current_year, m + 1, 1)
            label = m_start.strftime("%b")

            col = float(db.scalar(
                select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
                    PaymentAttempt.status == "captured",
                    PaymentAttempt.created_at >= m_start,
                    PaymentAttempt.created_at < m_end,
                )
            ) or 0)
            ref = float(db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.status == "processed",
                    Refund.created_at >= m_start,
                    Refund.created_at < m_end,
                )
            ) or 0)
            net = col - ref
            activity_chart.append({"label": label, "collections": col, "refunds": ref, "net": net})
            if m == current_month:
                selected_period_net = net

    # 7. Payment Overview (breakdown by payment method from captured attempts and delivered COD)
    method_rows = db.execute(
        select(CommerceOrder.payment_method, func.sum(PaymentAttempt.amount), func.count(PaymentAttempt.id))
        .join(PaymentAttempt, PaymentAttempt.order_id == CommerceOrder.id)
        .where(PaymentAttempt.status == "captured")
        .group_by(CommerceOrder.payment_method)
    ).all()
    method_dict = {row[0].lower(): {"amount": float(row[1] or 0), "count": int(row[2] or 0)} for row in method_rows if row[0]}

    cod_count = db.scalar(
        select(func.count(CommerceOrder.id))
        .join(Shipment, Shipment.order_id == CommerceOrder.id)
        .where(
            CommerceOrder.payment_method == "cod",
            CommerceOrder.status == "delivered",
            Shipment.status == "delivered",
        )
    ) or 0
    if cod_collected > 0 or cod_count > 0:
        if "cod" in method_dict:
            method_dict["cod"]["amount"] += float(cod_collected)
            method_dict["cod"]["count"] += cod_count
        else:
            method_dict["cod"] = {"amount": float(cod_collected), "count": cod_count}

    total_successful_txns = sum(v["count"] for v in method_dict.values())
    payment_overview = {
        "upi": method_dict.get("upi", {"amount": 0.0, "count": 0})["amount"],
        "cards": method_dict.get("card", method_dict.get("cards", {"amount": 0.0, "count": 0}))["amount"],
        "net_banking": method_dict.get("netbanking", method_dict.get("net_banking", {"amount": 0.0, "count": 0}))["amount"],
        "wallets": method_dict.get("wallet", method_dict.get("wallets", {"amount": 0.0, "count": 0}))["amount"],
        "cash_on_delivery": method_dict.get("cod", {"amount": 0.0, "count": 0})["amount"],
        "successful_transactions": total_successful_txns,
    }

    # 8. Refund Overview
    refund_counts_raw = db.execute(
        select(Refund.status, func.count(Refund.id)).group_by(Refund.status)
    ).all()
    refund_counts = {r[0]: r[1] for r in refund_counts_raw}
    processing_count = refund_counts.get("processing", 0)
    completed_count = refund_counts.get("processed", 0)
    failed_count = refund_counts.get("failed", 0)

    total_completed_and_failed = completed_count + failed_count
    success_rate = round((completed_count / total_completed_and_failed * 100), 1) if total_completed_and_failed > 0 else 100.0

    refund_overview = {
        "awaiting_review": pending_handoffs_count,
        "processing": processing_count,
        "completed": completed_count,
        "failed": failed_count,
        "success_rate": success_rate,
    }

    # 9. Recent Payments (5)
    recent_attempts = db.scalars(
        select(PaymentAttempt)
        .options(
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.user),
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items),
        )
        .order_by(PaymentAttempt.created_at.desc(), PaymentAttempt.id.desc())
        .limit(5)
    ).all()

    recent_payments = []
    for att in recent_attempts:
        order = att.order
        customer = order.user if order else None
        recent_payments.append({
            "id": att.id,
            "provider_payment_id": att.provider_payment_id or f"TXN-{att.id}",
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "customer_name": customer.name if customer else "Customer",
            "method": (order.payment_method or "Online").upper() if order else "ONLINE",
            "amount": float(att.amount),
            "status": att.status,
            "created_at": att.created_at.isoformat() if att.created_at else None,
        })

    # 10. Refund Requests (5)
    recent_handoffs = []
    if payments_dept:
        h_rows = db.scalars(
            select(ReturnHandoff)
            .options(
                selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
                selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order_item),
            )
            .where(
                ReturnHandoff.destination_department_id == payments_dept.id,
                ReturnHandoff.handoff_type == "refund_processing",
            )
            .order_by(ReturnHandoff.created_at.desc(), ReturnHandoff.id.desc())
            .limit(5)
        ).all()
        for h in h_rows:
            claim = h.return_request
            order = claim.order if claim else None
            cust = order.user if order else None
            item = claim.order_item if claim else None
            amount = float(item.unit_price * claim.quantity) if item and claim else 0.0
            recent_handoffs.append({
                "handoff_id": h.id,
                "refund_id": f"RF-{h.id}",
                "claim_id": claim.id if claim else None,
                "order_id": order.id if order else None,
                "order_number": order.order_number if order else "—",
                "customer_name": cust.name if cust else "Customer",
                "amount": amount,
                "status": h.status,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            })

    # 11. Recent Refunds (5)
    recent_refund_rows = db.scalars(
        select(Refund)
        .options(
            selectinload(Refund.order).selectinload(CommerceOrder.user),
            selectinload(Refund.payment_attempt),
        )
        .order_by(Refund.created_at.desc(), Refund.id.desc())
        .limit(5)
    ).all()
    recent_refunds = []
    for r in recent_refund_rows:
        order = r.order
        method = "UPI / Razorpay" if r.refund_method == "razorpay" else (
            "Cash on Delivery" if r.refund_method == "manual_cod" else (r.refund_method or "Bank Transfer")
        )
        recent_refunds.append({
            "id": r.id,
            "refund_id": f"RF-{r.id}",
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "method": method,
            "amount": float(r.amount),
            "processed_at": (r.updated_at or r.created_at).strftime("%d %b") if r.created_at else "—",
            "status": r.status,
        })

    return {
        "net_collections": net_collections,
        "total_collected": total_collected,
        "total_refunded": total_refunded,
        "refunds_pending": refunds_pending_amount,
        "selected_period_net": selected_period_net,
        "activity_chart": activity_chart,
        "payment_overview": payment_overview,
        "refund_overview": refund_overview,
        "recent_payments": recent_payments,
        "refund_requests": recent_handoffs,
        "recent_refunds": recent_refunds,
        "period": period,
    }


@handler_router.get("/payments/transactions")
def list_payments_transactions(
    search: str | None = Query(default=None),
    payment_status: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    amount_min: Decimal | None = Query(default=None),
    amount_max: Decimal | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
    transaction_type: str | None = Query(default=None, pattern=r"^(payment|refund|all)$"),
):
    _require_department_handler(db, actor, "Payments & Refunds")

    query = select(PaymentAttempt).join(CommerceOrder, CommerceOrder.id == PaymentAttempt.order_id)
    refund_query = select(Refund).join(CommerceOrder, CommerceOrder.id == Refund.order_id)
    if search and search.strip():
        s = f"%{search.strip()}%"
        normalized_id = search.strip().lower()
        attempt_id_term = normalized_id.removeprefix("att-")
        refund_id_term = normalized_id.removeprefix("ref-")
        attempt_search = [
            cast(PaymentAttempt.id, String).ilike(s),
            PaymentAttempt.provider_payment_id.ilike(s),
            PaymentAttempt.provider_order_id.ilike(s),
            CommerceOrder.order_number.ilike(s),
            User.name.ilike(s),
        ]
        if attempt_id_term.isdigit():
            attempt_search.append(PaymentAttempt.id == int(attempt_id_term))
        refund_search = [
            cast(Refund.id, String).ilike(s),
            cast(Refund.payment_attempt_id, String).ilike(s),
            Refund.provider_refund_id.ilike(s),
            Refund.external_reference.ilike(s),
            CommerceOrder.order_number.ilike(s),
            User.name.ilike(s),
        ]
        if refund_id_term.isdigit():
            refund_search.append(Refund.id == int(refund_id_term))
        if attempt_id_term.isdigit():
            refund_search.append(Refund.payment_attempt_id == int(attempt_id_term))
        query = query.outerjoin(User, User.id == CommerceOrder.user_id).where(
            or_(*attempt_search)
        )
        refund_query = refund_query.outerjoin(User, User.id == CommerceOrder.user_id).where(or_(*refund_search))
    failed_statuses = ("failed", "cancelled", "expired")
    if transaction_type == "payment":
        refund_query = refund_query.where(False)
    elif transaction_type == "refund":
        query = query.where(False)
    if payment_status == "failed":
        query = query.where(PaymentAttempt.status.in_(failed_statuses))
        refund_query = refund_query.where(Refund.status == "failed")
    elif payment_status == "refunded":
        query = query.where(False)
        refund_query = refund_query.where(Refund.status == "processed")
    elif payment_status == "pending":
        query = query.where(PaymentAttempt.status.in_(("pending", "created")))
        refund_query = refund_query.where(Refund.status.in_(("pending", "processing")))
    elif payment_status and payment_status != "all":
        query = query.where(PaymentAttempt.status == payment_status)
        refund_query = refund_query.where(Refund.status == payment_status)
    if payment_method and payment_method != "all":
        query = query.where(CommerceOrder.payment_method == payment_method)
        refund_query = refund_query.where(CommerceOrder.payment_method == payment_method)
    if date_from:
        query = query.where(PaymentAttempt.created_at >= date_from)
        refund_query = refund_query.where(Refund.created_at >= date_from)
    if date_to:
        query = query.where(PaymentAttempt.created_at <= date_to)
        refund_query = refund_query.where(Refund.created_at <= date_to)
    if amount_min is not None:
        query = query.where(PaymentAttempt.amount >= amount_min)
        refund_query = refund_query.where(Refund.amount >= amount_min)
    if amount_max is not None:
        query = query.where(PaymentAttempt.amount <= amount_max)
        refund_query = refund_query.where(Refund.amount <= amount_max)

    total_attempts = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    total_refunds = db.scalar(select(func.count()).select_from(refund_query.subquery())) or 0
    total = total_attempts + total_refunds

    kpi_attempts = db.scalar(select(func.count(PaymentAttempt.id))) or 0
    kpi_captured = db.scalar(select(func.count(PaymentAttempt.id)).where(PaymentAttempt.status == "captured")) or 0
    kpi_pending = db.scalar(select(func.count(PaymentAttempt.id)).where(PaymentAttempt.status.in_(["pending", "created"]))) or 0
    kpi_failed = db.scalar(select(func.count(PaymentAttempt.id)).where(PaymentAttempt.status.in_(failed_statuses))) or 0
    kpi_refunded = db.scalar(select(func.count(func.distinct(Refund.order_id))).where(Refund.status == "processed")) or 0

    attempts = db.scalars(
        query.options(
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.user),
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items),
        )
        .order_by(PaymentAttempt.created_at.desc(), PaymentAttempt.id.desc())
    ).all()
    refunds = db.scalars(
        refund_query.options(
            selectinload(Refund.order).selectinload(CommerceOrder.user),
            selectinload(Refund.order).selectinload(CommerceOrder.items),
        ).order_by(Refund.created_at.desc(), Refund.id.desc())
    ).all()

    handoff_by_claim = {}
    claim_ids = {refund.return_request_id for refund in refunds if refund.return_request_id is not None}
    if claim_ids:
        handoffs = db.scalars(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id.in_(claim_ids),
            ReturnHandoff.handoff_type == "refund_processing",
        ).order_by(ReturnHandoff.id.desc())).all()
        for handoff in handoffs:
            handoff_by_claim.setdefault(handoff.return_request_id, handoff.id)

    items = []
    for att in attempts:
        order = att.order
        cust = order.user if order else None
        item_summary = ", ".join(i.product_name for i in (order.items or [])) if order and order.items else "—"
        items.append({
            "id": att.id,
            "type": "Payment",
            "transaction_id": f"ATT-{att.id}",
            "attempt_id": f"ATT-{att.id}",
            "original_payment_id": att.id,
            "provider_payment_id": att.provider_payment_id or f"TXN-{att.id}",
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "customer_name": cust.name if cust else "Customer",
            "item_summary": item_summary,
            "amount": float(att.amount),
            "currency": att.currency,
            "payment_method": order.payment_method if order else "online",
            "provider": att.provider,
            "status": att.status,
            "failure_reason": att.failure_reason,
            "created_at": att.created_at.isoformat() if att.created_at else None,
            "paid_at": att.paid_at.isoformat() if att.paid_at else None,
        })

    for refund in refunds:
        order = refund.order
        customer = order.user if order else None
        items.append({
            "id": f"refund-{refund.id}",
            "refund_id": refund.id,
            "type": "Refund",
            "transaction_id": f"REF-{refund.id}",
            "attempt_id": f"REF-{refund.id}",
            "original_payment_id": refund.payment_attempt_id,
            "return_request_id": refund.return_request_id,
            "handoff_id": handoff_by_claim.get(refund.return_request_id),
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "customer_name": customer.name if customer else "Customer",
            "item_summary": ", ".join(i.product_name for i in (order.items or [])) if order and order.items else "—",
            "amount": float(refund.amount),
            "currency": refund.currency,
            "payment_method": order.payment_method if order else "online",
            "provider": "Internal ledger" if refund.refund_method == "internal" else refund.refund_method,
            "provider_reference": refund.provider_refund_id or refund.external_reference,
            "status": "refunded" if refund.status == "processed" else refund.status,
            "created_at": refund.updated_at.isoformat() if refund.status == "processed" and refund.updated_at else (refund.created_at.isoformat() if refund.created_at else None),
        })

    items.sort(key=lambda item: (item["created_at"] or "", str(item["id"])), reverse=True)
    items = items[offset:offset + limit]

    kpis_dict = {
        "total_attempts": kpi_attempts,
        "captured": kpi_captured,
        "pending": kpi_pending,
        "failed": kpi_failed,
        "refunded": kpi_refunded,
    }

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "kpis": kpis_dict,
        "summary": kpis_dict,
    }


@handler_router.get("/payments/transactions/{attempt_id}")
def get_payment_transaction_details(
    attempt_id: str,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")
    attempt_id = str(attempt_id)

    if attempt_id.startswith("refund-"):
        try:
            refund_id = int(attempt_id.removeprefix("refund-"))
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Transaction not found.") from exc
        refund = db.scalar(select(Refund).options(
            selectinload(Refund.order).selectinload(CommerceOrder.user),
            selectinload(Refund.order).selectinload(CommerceOrder.items),
        ).where(Refund.id == refund_id))
        if refund is None:
            raise HTTPException(status_code=404, detail="Transaction not found.")
        order = refund.order
        customer = order.user if order else None
        email_masked = "—"
        if customer and customer.email:
            parts = customer.email.split("@")
            email_masked = f"{parts[0][:2]}***@{parts[1]}" if len(parts) == 2 else "***"
        phone = (getattr(customer, "mobile_number", None) or getattr(customer, "phone", None)) if customer else None
        handoff_id = db.scalar(select(ReturnHandoff.id).where(
            ReturnHandoff.return_request_id == refund.return_request_id,
            ReturnHandoff.handoff_type == "refund_processing",
        ).order_by(ReturnHandoff.id.desc()).limit(1)) if refund.return_request_id else None
        related_refunds = db.scalars(select(Refund).where(
            Refund.order_id == refund.order_id,
        ).order_by(Refund.created_at.desc())).all()
        order_items = [{
            "id": item.id,
            "product_name": item.product_name,
            "variant_name": item.variant_name,
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "total_price": float(item.unit_price * item.quantity),
        } for item in (order.items or [])] if order else []
        return {
            "id": f"refund-{refund.id}",
            "refund_id": refund.id,
            "type": "Refund",
            "attempt_id": f"REF-{refund.id}",
            "original_payment_id": refund.payment_attempt_id,
            "return_request_id": refund.return_request_id,
            "handoff_id": handoff_id,
            "provider": "Internal ledger" if refund.refund_method == "internal" else refund.refund_method,
            "provider_reference": refund.provider_refund_id or refund.external_reference or "—",
            "provider_payment_id": refund.provider_refund_id or "—",
            "provider_order_id": "—",
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "payment_method": order.payment_method if order else "online",
            "amount": float(refund.amount),
            "currency": refund.currency,
            "status": "refunded" if refund.status == "processed" else refund.status,
            "refund_status": refund.status,
            "refund_method": refund.refund_method,
            "failure_reason": refund.failure_reason,
            "created_at": refund.created_at.isoformat() if refund.created_at else None,
            "updated_at": refund.updated_at.isoformat() if refund.updated_at else None,
            "paid_at": None,
            "order": {
                "id": order.id if order else None,
                "order_number": order.order_number if order else "—",
                "status": order.status if order else "—",
                "payment_method": order.payment_method if order else "online",
                "total_amount": float(order.total_amount) if order else float(refund.amount),
                "items": order_items,
            },
            "customer": {
                "name": customer.name if customer else "Customer",
                "masked_email": email_masked,
                "email_masked": email_masked,
                "phone_masked": f"******{phone[-4:]}" if phone and len(phone) >= 4 else "******" if phone else "—",
            },
            "related_attempts": [],
            "related_refunds": [{
                "id": row.id,
                "amount": float(row.amount),
                "refund_method": row.refund_method,
                "status": "refunded" if row.status == "processed" else row.status,
                "provider_refund_id": row.provider_refund_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            } for row in related_refunds],
        }

    att = db.scalar(
        select(PaymentAttempt)
        .options(
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.user),
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items),
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.shipment),
        )
        .where(PaymentAttempt.id == attempt_id)
    )
    if not att:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    order = att.order
    customer = order.user if order else None

    masked_email = "—"
    if customer and customer.email:
        parts = customer.email.split("@")
        if len(parts) == 2:
            masked_email = f"{parts[0][:2]}***@{parts[1]}"
        else:
            masked_email = "***"

    phone_masked = None
    cust_phone = getattr(customer, "mobile_number", None) or getattr(customer, "phone", None)
    if cust_phone:
        phone_masked = f"******{cust_phone[-4:]}" if len(cust_phone) >= 4 else "******"

    sibling_attempts = []
    if order:
        siblings = db.scalars(
            select(PaymentAttempt)
            .where(PaymentAttempt.order_id == order.id, PaymentAttempt.id != att.id)
            .order_by(PaymentAttempt.created_at.desc())
        ).all()
        for sib in siblings:
            sibling_attempts.append({
                "id": sib.id,
                "amount": float(sib.amount),
                "status": sib.status,
                "provider": sib.provider,
                "created_at": sib.created_at.isoformat() if sib.created_at else None,
            })

    related_refunds = []
    if order:
        r_list = db.scalars(
            select(Refund)
            .where(Refund.order_id == order.id)
            .order_by(Refund.created_at.desc())
        ).all()
        linked_claim_ids = {r.return_request_id for r in r_list if r.return_request_id is not None}
        related_handoffs = {}
        if linked_claim_ids:
            for claim_id, linked_handoff_id in db.execute(select(
                ReturnHandoff.return_request_id, ReturnHandoff.id,
            ).where(
                ReturnHandoff.return_request_id.in_(linked_claim_ids),
                ReturnHandoff.handoff_type == "refund_processing",
            ).order_by(ReturnHandoff.id.desc())).all():
                related_handoffs.setdefault(claim_id, linked_handoff_id)
        for r in r_list:
            related_refunds.append({
                "id": r.id,
                "amount": float(r.amount),
                "refund_method": r.refund_method,
                "status": "refunded" if r.status == "processed" else r.status,
                "provider_refund_id": r.provider_refund_id,
                "return_request_id": r.return_request_id,
                "handoff_id": related_handoffs.get(r.return_request_id),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })

    order_items = []
    if order and order.items:
        for i in order.items:
            order_items.append({
                "id": i.id,
                "product_name": i.product_name,
                "variant_name": i.variant_name,
                "quantity": i.quantity,
                "unit_price": float(i.unit_price),
                "total_price": float(i.unit_price * i.quantity),
            })

    return {
        "id": att.id,
        "type": "Payment",
        "provider": att.provider,
        "provider_payment_id": att.provider_payment_id or "—",
        "provider_order_id": att.provider_order_id or "—",
        "provider_reference": att.provider_payment_id or att.provider_order_id or "—",
        "order_id": order.id if order else None,
        "order_number": order.order_number if order else "—",
        "payment_method": (order.payment_method or "online") if order else "online",
        "amount": float(att.amount),
        "currency": att.currency,
        "status": att.status,
        "failure_reason": att.failure_reason,
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "updated_at": att.updated_at.isoformat() if att.updated_at else None,
        "paid_at": att.paid_at.isoformat() if att.paid_at else None,
        "order": {
            "id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "status": order.status if order else "—",
            "payment_method": order.payment_method if order else "online",
            "total_amount": float(order.total_amount) if order else float(att.amount),
            "items": order_items,
        },
        "customer": {
            "name": customer.name if customer else "Customer",
            "masked_email": masked_email,
            "email_masked": masked_email,
            "phone_masked": phone_masked or "—",
        },
        "related_attempts": sibling_attempts,
        "related_refunds": related_refunds,
    }


@handler_router.get("/payments/refunds")
def list_payments_refunds(
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    refund_timing: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")

    payments_dept = db.scalar(select(Department).where(Department.name == "Payments & Refunds"))
    if not payments_dept:
        return {"items": [], "total": 0, "limit": limit, "offset": offset, "tab_counts": {}}
    returns_dept_id = db.scalar(select(Department.id).where(Department.name == "Returns & Replacement"))
    delivery_dept_id = db.scalar(select(Department.id).where(Department.name == "Order & Delivery"))

    # Query all Payments return handoffs
    handoffs = db.scalars(
        select(ReturnHandoff)
        .options(
            selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
            selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order_item),
        )
        .where(
            ReturnHandoff.destination_department_id == payments_dept.id,
            ReturnHandoff.handoff_type == "refund_processing",
        )
        .order_by(ReturnHandoff.created_at.desc(), ReturnHandoff.id.desc())
    ).all()

    combined_items = []
    seen_claim_ids = set()

    for h in handoffs:
        claim = h.return_request
        order = claim.order if claim else None
        cust = order.user if order else None
        item = claim.order_item if claim else None
        amount = float(item.unit_price * claim.quantity) if item and claim else (float(order.total_amount) if order else 0.0)

        if claim:
            seen_claim_ids.add(claim.id)

        # Pickup status from sibling pickup handoff if exists
        pickup_status = "unavailable"
        if claim:
            sib_pickup = db.scalar(
                select(ReturnHandoff.status).where(
                    ReturnHandoff.return_request_id == claim.id,
                    ReturnHandoff.handoff_type == "refund_pickup",
                ).limit(1)
            )
            if sib_pickup:
                pickup_status = sib_pickup

        # Check existing refund record
        existing_refund = None
        if claim:
            existing_refund = db.scalar(
                select(Refund).where(Refund.return_request_id == claim.id)
                .order_by(Refund.created_at.desc(), Refund.id.desc()).limit(1)
            )

        # Eligibility check
        captured_attempt = db.scalar(
            select(PaymentAttempt).where(
                PaymentAttempt.order_id == order.id,
                PaymentAttempt.status == "captured",
                PaymentAttempt.provider_payment_id.isnot(None),
            ).order_by(PaymentAttempt.paid_at.desc(), PaymentAttempt.id.desc()).limit(1)
        ) if order and order.payment_method != "cod" else None
        if order and order.payment_method == "cod":
            captured_amount = Decimal(str(order.total_amount or 0))
            reserved_refunds = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.order_id == order.id,
                Refund.status.in_(("pending", "processing", "processed")),
            )) or 0
            prior_refunds = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.order_id == order.id, Refund.status == "processed",
            )) or 0
        elif captured_attempt:
            captured_amount = Decimal(str(captured_attempt.amount))
            reserved_refunds = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.payment_attempt_id == captured_attempt.id,
                Refund.status.in_(("pending", "processing", "processed")),
            )) or 0
            prior_refunds = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.payment_attempt_id == captured_attempt.id, Refund.status == "processed",
            )) or 0
        else:
            captured_amount = Decimal("0")
            reserved_refunds = Decimal("0")
            prior_refunds = Decimal("0")
        remaining_refundable = max(captured_amount - Decimal(str(reserved_refunds)), Decimal("0"))
        expected_source_id = (
            returns_dept_id if claim and claim.refund_timing == "immediate" else
            delivery_dept_id if claim and claim.refund_timing == "after_collection" else None
        )
        is_eligible = bool(
            claim and h.status in ("pending", "accepted", "in_progress")
            and claim.workflow_status == "approved"
            and claim.resolution_type == "refund"
            and h.source_department_id == expected_source_id
            and h.destination_department_id == payments_dept.id
            and existing_refund is None
            and order is not None
            and (order.payment_method == "cod" or captured_attempt is not None)
            and Decimal(str(amount)) > 0
            and Decimal(str(amount)) <= remaining_refundable
            and (claim.refund_timing == "immediate"
                 or (claim.refund_timing == "after_collection" and pickup_status == "completed"))
        )

        if existing_refund and existing_refund.status == "processed":
            current_status = "completed" if has_verified_processed_refund(db, claim) else "invalid_state"
        elif existing_refund:
            current_status = existing_refund.status
        elif h.status in ("pending", "accepted"):
            current_status = "awaiting_processing"
        elif h.status == "in_progress":
            current_status = "processing"
        elif h.status == "completed":
            current_status = "invalid_state"
        elif h.status == "failed":
            current_status = "failed"
        else:
            current_status = h.status

        claim_num = f"TRN-{claim.id}" if claim else "—"
        timing_label = claim.refund_timing if (claim and claim.refund_timing) else "unspecified"

        combined_items.append({
            "id": h.id,
            "handoff_id": h.id,
            "claim_number": claim_num,
            "refund_id": f"RF-{existing_refund.id}" if existing_refund else f"RF-{h.id}",
            "return_request_id": claim.id if claim else None,
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "customer_name": cust.name if cust else "Customer",
            "refund_type": claim.resolution_type if claim else "refund",
            "refund_timing": timing_label,
            "payment_method": (order.payment_method or "online").upper() if order else "ONLINE",
            "original_payment_method": order.payment_method if order else "online",
            "amount": amount,
            "eligible_amount": amount,
            "status": current_status,
            "refund_status": ("refunded" if existing_refund.status == "processed" else existing_refund.status) if existing_refund else None,
            "pickup_status": pickup_status,
            "captured_payment_attempt_id": captured_attempt.id if captured_attempt else None,
            "captured_amount": float(captured_amount),
            "prior_refunds": float(prior_refunds),
            "reserved_refunds": float(reserved_refunds),
            "remaining_refundable": float(remaining_refundable),
            "is_eligible": is_eligible,
            "created_at": h.created_at.isoformat() if h.created_at else None,
            "updated_at": h.updated_at.isoformat() if h.updated_at else None,
        })

    # Query completed standalone refunds not associated with handoffs
    standalone_refunds = db.scalars(
        select(Refund)
        .options(
            selectinload(Refund.order).selectinload(CommerceOrder.user),
        )
        .order_by(Refund.created_at.desc(), Refund.id.desc())
    ).all()

    for rf in standalone_refunds:
        if rf.return_request_id and rf.return_request_id in seen_claim_ids:
            continue
        order = rf.order
        cust = order.user if order else None
        status_norm = "completed" if rf.status == "processed" else rf.status
        combined_items.append({
            "id": f"rf-{rf.id}",
            "handoff_id": rf.id,
            "claim_number": f"TRN-{rf.return_request_id}" if rf.return_request_id else "—",
            "refund_id": rf.provider_refund_id or f"RF-{rf.id}",
            "return_request_id": rf.return_request_id,
            "order_id": rf.order_id,
            "order_number": order.order_number if order else "—",
            "customer_name": cust.name if cust else "Customer",
            "refund_type": "refund",
            "refund_timing": "completed",
            "payment_method": (rf.refund_method or (order.payment_method if order else "online")).upper(),
            "original_payment_method": rf.refund_method or "online",
            "amount": float(rf.amount),
            "eligible_amount": float(rf.amount),
            "status": status_norm,
            "pickup_status": "N/A",
            "is_eligible": False,
            "created_at": rf.created_at.isoformat() if rf.created_at else None,
            "updated_at": (rf.updated_at or rf.created_at).isoformat() if (rf.updated_at or rf.created_at) else None,
        })

    # Tab counts based on all items
    cnt_awaiting = sum(1 for it in combined_items if it["status"] in ("pending", "accepted", "awaiting_processing"))
    cnt_processing = sum(1 for it in combined_items if it["status"] in ("in_progress", "processing"))
    cnt_completed = sum(1 for it in combined_items if it["status"] in ("completed", "processed"))
    cnt_failed = sum(1 for it in combined_items if it["status"] == "failed")
    tab_counts = {
        "all": len(combined_items),
        "awaiting": cnt_awaiting,
        "awaiting_processing": cnt_awaiting,
        "processing": cnt_processing,
        "completed": cnt_completed,
        "failed": cnt_failed,
    }

    # Filter by active tab status
    filtered = combined_items
    if status and status != "all":
        if status in ("awaiting", "awaiting_processing"):
            filtered = [it for it in filtered if it["status"] in ("pending", "accepted", "awaiting_processing")]
        elif status == "processing":
            filtered = [it for it in filtered if it["status"] in ("in_progress", "processing")]
        elif status in ("completed", "processed"):
            filtered = [it for it in filtered if it["status"] in ("completed", "processed")]
        elif status == "failed":
            filtered = [it for it in filtered if it["status"] == "failed"]

    # Filter by timing
    if refund_timing and refund_timing != "all":
        filtered = [it for it in filtered if it["refund_timing"] == refund_timing]

    # Filter by payment method
    if payment_method and payment_method != "all":
        filtered = [it for it in filtered if payment_method.lower() in it["original_payment_method"].lower()]

    # Filter by search
    if search and search.strip():
        s = search.strip().lower()
        filtered = [
            it for it in filtered if (
                s in str(it.get("handoff_id", "")).lower() or
                s in str(it.get("claim_number", "")).lower() or
                s in str(it.get("refund_id", "")).lower() or
                s in str(it.get("order_number", "")).lower() or
                s in str(it.get("customer_name", "")).lower()
            )
        ]

    total = len(filtered)
    paged = filtered[offset : offset + limit]

    return {
        "items": paged,
        "total": total,
        "limit": limit,
        "offset": offset,
        "tab_counts": tab_counts,
    }


@handler_router.get("/payments/refunds/{handoff_id}")
def get_payment_refund_details(
    handoff_id: str,
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")

    clean_id = str(handoff_id).replace("rf-", "").replace("RF-", "").replace("HND-", "")
    numeric_id = int(clean_id) if clean_id.isdigit() else 0

    # 1. Look up by ReturnHandoff
    h = db.scalar(
        select(ReturnHandoff)
        .options(
            selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order).selectinload(CommerceOrder.user),
            selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order_item),
        )
        .where(
            ReturnHandoff.id == numeric_id,
            ReturnHandoff.handoff_type == "refund_processing",
            ReturnHandoff.destination_department_id == select(Department.id).where(
                Department.name == "Payments & Refunds"
            ).scalar_subquery(),
        )
    )

    if h:
        claim = h.return_request
        order = claim.order if claim else None
        cust = order.user if order else None
        item = claim.order_item if claim else None

        orig_attempt = db.scalar(
            select(PaymentAttempt)
            .where(PaymentAttempt.order_id == order.id, PaymentAttempt.status == "captured",
                   PaymentAttempt.provider_payment_id.isnot(None))
            .order_by(PaymentAttempt.paid_at.desc(), PaymentAttempt.id.desc()).limit(1)
        ) if order and order.payment_method != "cod" else None

        refund_base_query = select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.status.in_(("pending", "processing", "processed"))
        )
        if orig_attempt:
            refund_base_query = refund_base_query.where(Refund.payment_attempt_id == orig_attempt.id)
            processed_refunds_query = select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.payment_attempt_id == orig_attempt.id, Refund.status == "processed"
            )
            captured_amount = Decimal(str(orig_attempt.amount))
        elif order and order.payment_method == "cod":
            refund_base_query = refund_base_query.where(Refund.order_id == order.id)
            processed_refunds_query = select(func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.order_id == order.id, Refund.status == "processed"
            )
            captured_amount = Decimal(str(order.total_amount or 0))
        else:
            refund_base_query = refund_base_query.where(Refund.id == -1)
            processed_refunds_query = select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.id == -1)
            captured_amount = Decimal("0")
        reserved_refunds_sum = Decimal(str(db.scalar(refund_base_query) or 0))
        prior_refunds_sum = Decimal(str(db.scalar(processed_refunds_query) or 0))

        pickup_status = "unavailable"
        if claim:
            sib_pickup = db.scalar(
                select(ReturnHandoff.status).where(
                    ReturnHandoff.return_request_id == claim.id,
                    ReturnHandoff.handoff_type == "refund_pickup",
                ).limit(1)
            )
            if sib_pickup:
                pickup_status = sib_pickup

        existing_refund = None
        if claim:
            existing_refund = db.scalar(
                select(Refund).where(Refund.return_request_id == claim.id)
                .order_by(Refund.created_at.desc(), Refund.id.desc()).limit(1)
            )

        requested_amount = float(item.unit_price * claim.quantity) if item and claim else (float(order.total_amount) if order else 0.0)
        remaining_balance = max(float(captured_amount - reserved_refunds_sum), 0.0)
        expected_source_id = None
        if claim and claim.refund_timing == "immediate":
            expected_source_id = db.scalar(select(Department.id).where(Department.name == "Returns & Replacement"))
        elif claim and claim.refund_timing == "after_collection":
            expected_source_id = db.scalar(select(Department.id).where(Department.name == "Order & Delivery"))

        is_eligible = False
        ineligible_reason = None

        verified_refund = bool(claim and existing_refund and existing_refund.status == "processed"
                               and has_verified_processed_refund(db, claim))
        if existing_refund:
            status_label = (
                "completed" if verified_refund else
                "invalid_state" if existing_refund.status == "processed" else
                existing_refund.status
            )
            ineligible_reason = (
                "This refund has already been completed."
                if verified_refund else
                "A refund is currently processing with the payment provider."
                if existing_refund.status == "processing" else
                "A refund operation is currently pending with the payment provider."
                if existing_refund.status == "pending" else
                "An existing refund operation requires reconciliation before another refund can be initiated."
            )
        elif claim and (claim.workflow_status != "approved" or claim.resolution_type != "refund"):
            status_label = "ineligible"
            ineligible_reason = "Only an approved refund request can be processed."
        elif claim and claim.refund_timing is None:
            status_label = "ineligible"
            ineligible_reason = "Refund timing is unavailable for this request. Authorized review is required before refund execution."
        elif h.source_department_id != expected_source_id:
            status_label = "ineligible"
            ineligible_reason = "The Payments handoff source does not match the approved refund timing."
        elif h.status == "completed":
            status_label = "invalid_state"
            ineligible_reason = "The handoff is complete but no linked refund record verifies successful processing."
        elif h.status == "cancelled":
            status_label = "cancelled"
            ineligible_reason = "This refund handoff was cancelled."
        elif claim and claim.resolution_type == "replacement":
            status_label = "ineligible"
            ineligible_reason = "Replacement workflows are not eligible for financial refund."
        elif claim and claim.refund_timing == "after_collection" and pickup_status != "completed":
            status_label = "pending"
            ineligible_reason = f"Awaiting physical item collection (current pickup status: {pickup_status})."
        elif order and order.payment_method != "cod" and orig_attempt is None:
            status_label = "ineligible"
            ineligible_reason = "No captured payment is linked to this order."
        elif requested_amount <= 0 or requested_amount > remaining_balance:
            status_label = "ineligible"
            ineligible_reason = "The remaining refundable balance is below the approved amount due."
        elif h.status not in {"pending", "accepted", "in_progress"}:
            status_label = h.status
            ineligible_reason = "This refund handoff is not in a processable state."
        else:
            status_label = "awaiting_processing" if h.status in ("pending", "accepted") else h.status
            is_eligible = True

        timeline = []
        if claim:
            events = db.scalars(
                select(ReturnRequestEvent).where(ReturnRequestEvent.return_request_id == claim.id)
                .order_by(ReturnRequestEvent.created_at.asc())
            ).all()
            for ev in events:
                timeline.append({
                    "id": ev.id,
                    "created_at": ev.created_at.isoformat() if ev.created_at else None,
                    "event_type": ev.event_type,
                    "description": ev.note or f"Status transitioned to {ev.new_status or ev.event_type}",
                    "actor_role": "Handler" if ev.actor_user_id else "System",
                    "actor_id": ev.actor_user_id,
                })

        email_masked = None
        phone_masked = None
        if cust and getattr(cust, "email", None):
            parts = cust.email.split("@")
            email_masked = f"{parts[0][:2]}***@{parts[1]}" if len(parts) == 2 else "***@domain.com"
        cust_phone = getattr(cust, "mobile_number", None) or getattr(cust, "phone", None)
        if cust_phone:
            phone_masked = f"******{cust_phone[-4:]}" if len(cust_phone) >= 4 else "******"

        return {
            "id": h.id,
            "handoff_id": h.id,
            "handoff_status": h.status,
            "status": status_label,
            "claim_number": f"TRN-{claim.id}" if claim else "—",
            "return_request_id": claim.id if claim else None,
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "resolution_type": claim.resolution_type if claim else "refund",
            "claim_status": claim.status if claim else "approved",
            "reason": claim.reason if claim else "Damaged during delivery / transit",
            "refund_timing": claim.refund_timing if claim else None,
            "pickup_status": pickup_status,
            "payment_method": order.payment_method if order else "online",
            "amount": requested_amount,
            "eligible_amount": min(requested_amount, remaining_balance),
            "refund_status": ("refunded" if existing_refund.status == "processed" else existing_refund.status) if existing_refund else None,
            "handoff_status": h.status,
            "is_eligible_for_refund": is_eligible,
            "ineligible_reason": ineligible_reason,
            "eligibility": {
                "is_eligible": is_eligible,
                "reason": ineligible_reason,
            },
            "refund_transaction_id": (existing_refund.provider_refund_id or f"REF-{existing_refund.id}") if existing_refund else None,
            "customer": {
                "name": cust.name if cust else "Customer",
                "email_masked": email_masked or "—",
                "phone_masked": phone_masked or "—",
            },
            "original_payment": {
                "attempt_id": orig_attempt.id if orig_attempt else None,
                "provider": orig_attempt.provider if orig_attempt else ("manual_cod" if order and order.payment_method == "cod" else None),
                "payment_method": order.payment_method if order else None,
                "provider_payment_id": orig_attempt.provider_payment_id if orig_attempt else None,
                "captured_amount": float(captured_amount),
                "previously_refunded": float(prior_refunds_sum),
                "reserved_refunds": float(max(reserved_refunds_sum - prior_refunds_sum, Decimal("0"))),
                "remaining_refundable": remaining_balance,
            },
            "events": timeline,
        }

    # 2. Look up by Refund record directly
    rf = db.scalar(
        select(Refund)
        .options(
            selectinload(Refund.order).selectinload(CommerceOrder.user),
            selectinload(Refund.order).selectinload(CommerceOrder.items),
            selectinload(Refund.return_request),
        )
        .where(Refund.id == numeric_id)
    )

    if rf:
        order = rf.order
        cust = order.user if order else None
        claim = rf.return_request

        email_masked = None
        phone_masked = None
        if cust and getattr(cust, "email", None):
            parts = cust.email.split("@")
            email_masked = f"{parts[0][:2]}***@{parts[1]}" if len(parts) == 2 else "***@domain.com"
        cust_phone = getattr(cust, "mobile_number", None) or getattr(cust, "phone", None)
        if cust_phone:
            phone_masked = f"******{cust_phone[-4:]}" if len(cust_phone) >= 4 else "******"

        return {
            "id": rf.id,
            "handoff_id": rf.id,
            "status": "completed" if rf.status == "processed" else rf.status,
            "claim_number": f"TRN-{claim.id}" if claim else "—",
            "return_request_id": claim.id if claim else None,
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else "—",
            "resolution_type": "refund",
            "claim_status": "approved",
            "reason": rf.reason or "Approved return refund",
            "refund_timing": "completed",
            "payment_method": rf.refund_method or (order.payment_method if order else "online"),
            "amount": float(rf.amount),
            "eligible_amount": float(rf.amount),
            "is_eligible_for_refund": False,
            "ineligible_reason": "This refund has already been completed.",
            "eligibility": {
                "is_eligible": False,
                "reason": "This refund has already been completed.",
            },
            "refund_transaction_id": rf.provider_refund_id or f"REF-{rf.id}",
            "customer": {
                "name": cust.name if cust else "Customer",
                "email_masked": email_masked or "—",
                "phone_masked": phone_masked or "—",
            },
            "original_payment": {
                "attempt_id": rf.payment_attempt_id,
                "provider": rf.refund_method or "razorpay",
                "captured_amount": float(rf.amount),
                "previously_refunded": float(rf.amount),
                "remaining_refundable": 0.0,
            },
            "events": [
                {
                    "id": 1,
                    "created_at": rf.created_at.isoformat() if rf.created_at else None,
                    "event_type": "refund_processed",
                    "description": f"Refund of ₹{rf.amount} completed via {rf.refund_method or 'Razorpay'}",
                    "actor_role": "Payments Handler",
                    "actor_id": rf.processed_by_id,
                }
            ],
        }

    raise HTTPException(status_code=404, detail="Refund record not found.")


@handler_router.get("/payments/settlements")
def list_payments_settlements(
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")
    return {
        "items": [],
        "total": 0,
        "status": "unsupported",
        "message": "Provider settlement ingestion and batch reconciliation are pending integration.",
    }


@handler_router.get("/payments/disputes")
def list_payments_disputes(
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")
    return {
        "items": [],
        "total": 0,
        "status": "unsupported",
        "message": "Provider dispute and chargeback webhook ingestion is pending integration.",
    }


@handler_router.get("/payments/reports/stats")
def get_payments_reports_stats(
    period: str = Query(default="month"),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # 1. Collections & Refunds totals
    online_collected = db.scalar(
        select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
            PaymentAttempt.status == "captured"
        )
    ) or 0
    cod_collected = db.scalar(
        select(func.coalesce(func.sum(CommerceOrder.total_amount), 0))
        .join(Shipment, Shipment.order_id == CommerceOrder.id)
        .where(
            CommerceOrder.payment_method == "cod",
            CommerceOrder.status == "delivered",
            Shipment.status == "delivered",
        )
    ) or 0
    online_collected_val = float(online_collected)
    cod_collected_val = float(cod_collected)
    total_collected = online_collected_val + cod_collected_val

    total_refunded = float(db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.status == "processed"
        )
    ) or 0)
    net_collections = total_collected - total_refunded

    total_attempts = db.scalar(select(func.count(PaymentAttempt.id))) or 0
    failed_attempts = db.scalar(
        select(func.count(PaymentAttempt.id)).where(PaymentAttempt.status.in_(["failed", "cancelled", "expired"]))
    ) or 0
    failure_rate = round((failed_attempts / total_attempts * 100), 1) if total_attempts > 0 else 0.0

    # 2. Trends
    trends = []
    if period == "day":
        for i in range(6, -1, -1):
            d_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            d_end = d_start + timedelta(days=1)
            col = float(db.scalar(
                select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
                    PaymentAttempt.status == "captured",
                    PaymentAttempt.created_at >= d_start,
                    PaymentAttempt.created_at < d_end,
                )
            ) or 0)
            ref = float(db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.status == "processed",
                    Refund.created_at >= d_start,
                    Refund.created_at < d_end,
                )
            ) or 0)
            trends.append({"label": d_start.strftime("%d %b"), "collections": col, "refunds": ref, "net": col - ref})
    elif period == "week":
        for i in range(7, -1, -1):
            w_start = (now - timedelta(weeks=i+1)).replace(hour=0, minute=0, second=0, microsecond=0)
            w_end = (now - timedelta(weeks=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            col = float(db.scalar(
                select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
                    PaymentAttempt.status == "captured",
                    PaymentAttempt.created_at >= w_start,
                    PaymentAttempt.created_at < w_end,
                )
            ) or 0)
            ref = float(db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.status == "processed",
                    Refund.created_at >= w_start,
                    Refund.created_at < w_end,
                )
            ) or 0)
            trends.append({"label": f"Wk {w_start.strftime('%W')}", "collections": col, "refunds": ref, "net": col - ref})
    else:
        for m in range(1, 13):
            m_start = datetime(now.year, m, 1)
            m_end = datetime(now.year + 1, 1, 1) if m == 12 else datetime(now.year, m + 1, 1)
            col = float(db.scalar(
                select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
                    PaymentAttempt.status == "captured",
                    PaymentAttempt.created_at >= m_start,
                    PaymentAttempt.created_at < m_end,
                )
            ) or 0)
            ref = float(db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.status == "processed",
                    Refund.created_at >= m_start,
                    Refund.created_at < m_end,
                )
            ) or 0)
            trends.append({"label": m_start.strftime("%b"), "collections": col, "refunds": ref, "net": col - ref})

    # 3. Method breakdown
    method_rows = db.execute(
        select(CommerceOrder.payment_method, func.sum(PaymentAttempt.amount), func.count(PaymentAttempt.id))
        .join(PaymentAttempt, PaymentAttempt.order_id == CommerceOrder.id)
        .where(PaymentAttempt.status == "captured")
        .group_by(CommerceOrder.payment_method)
    ).all()
    methods = []
    seen_methods = set()
    for r in method_rows:
        if r[0]:
            vol = float(r[1] or 0)
            cnt = int(r[2] or 0)
            pct = round((vol / total_collected * 100), 1) if total_collected > 0 else 0.0
            seen_methods.add(r[0].lower())
            methods.append({
                "method": r[0].upper(),
                "label": r[0].upper(),
                "volume": vol,
                "amount": vol,
                "count": cnt,
                "percentage": pct,
            })

    # Include COD if applicable
    cod_count = db.scalar(
        select(func.count(CommerceOrder.id))
        .join(Shipment, Shipment.order_id == CommerceOrder.id)
        .where(
            CommerceOrder.payment_method == "cod",
            CommerceOrder.status == "delivered",
            Shipment.status == "delivered",
        )
    ) or 0
    if cod_collected_val > 0 or cod_count > 0:
        pct_cod = round((cod_collected_val / total_collected * 100), 1) if total_collected > 0 else 0.0
        if "cod" not in seen_methods:
            methods.append({
                "method": "COD",
                "label": "Cash on Delivery",
                "volume": cod_collected_val,
                "amount": cod_collected_val,
                "count": cod_count,
                "percentage": pct_cod,
            })

    # 4. Refund status breakdown
    refund_counts_raw = db.execute(
        select(Refund.status, func.count(Refund.id), func.sum(Refund.amount)).group_by(Refund.status)
    ).all()
    refund_statuses = []
    for r in refund_counts_raw:
        refund_statuses.append({
            "status": r[0],
            "count": int(r[1] or 0),
            "amount": float(r[2] or 0),
        })

    completed_refunds_count = sum(r["count"] for r in refund_statuses if r["status"] == "processed")
    total_refunds_count = sum(r["count"] for r in refund_statuses)
    refund_success_rate = round((completed_refunds_count / total_refunds_count * 100), 1) if total_refunds_count > 0 else 0.0

    return {
        "kpis": {
            "total_collected": total_collected,
            "total_refunded": total_refunded,
            "net_collections": net_collections,
            "total_attempts": total_attempts,
            "failed_attempts": failed_attempts,
            "failure_rate": failure_rate,
        },
        "trends": trends,
        "trend": trends,
        "payment_methods": methods,
        "methods": methods,
        "refund_statuses": refund_statuses,
        "refund_overview": {
            "success_rate": refund_success_rate,
            "statuses": refund_statuses,
        },
        "period": period,
    }


@handler_router.get("/payments/history-audit")
def list_payments_history_audit(
    search: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_role("department_handler", "admin", "super_admin")),
):
    _require_department_handler(db, actor, "Payments & Refunds")

    # Collect events from PaymentAttempts, Refunds, and ReturnHandoffs
    all_events = []

    attempts = db.scalars(
        select(PaymentAttempt)
        .options(selectinload(PaymentAttempt.order))
        .order_by(PaymentAttempt.created_at.desc())
        .limit(100)
    ).all()
    for att in attempts:
        all_events.append({
            "id": f"evt-att-{att.id}",
            "timestamp": att.created_at.isoformat() if att.created_at else None,
            "raw_time": att.created_at or datetime.min,
            "reference": att.provider_payment_id or f"TXN-{att.id}",
            "reference_id": att.provider_payment_id or f"TXN-{att.id}",
            "order_number": att.order.order_number if att.order else "—",
            "action": f"Payment {att.status.capitalize()}",
            "event_type": "payment",
            "previous_state": "created" if att.status != "created" else "—",
            "new_state": att.status,
            "actor": "System / Provider" if att.provider else "System",
            "provider": att.provider or "Razorpay",
            "amount": float(att.amount),
            "note": att.failure_reason or f"Payment attempt marked {att.status}",
        })

    refunds = db.scalars(
        select(Refund)
        .options(selectinload(Refund.order), selectinload(Refund.processed_by))
        .order_by(Refund.created_at.desc())
        .limit(100)
    ).all()
    for ref in refunds:
        all_events.append({
            "id": f"evt-ref-{ref.id}",
            "timestamp": ref.created_at.isoformat() if ref.created_at else None,
            "raw_time": ref.created_at or datetime.min,
            "reference": ref.provider_refund_id or f"RF-{ref.id}",
            "reference_id": ref.provider_refund_id or f"RF-{ref.id}",
            "order_number": ref.order.order_number if ref.order else "—",
            "action": f"Refund {ref.status.capitalize()}",
            "event_type": "refund",
            "previous_state": "pending" if ref.status != "pending" else "—",
            "new_state": ref.status,
            "actor": ref.processed_by.name if ref.processed_by else "Payments Handler",
            "provider": ref.refund_method or "Razorpay",
            "amount": float(ref.amount),
            "note": ref.reason or f"Refund marked {ref.status}",
        })

    # Return handoff events
    payments_dept = db.scalar(select(Department).where(Department.name == "Payments & Refunds"))
    if payments_dept:
        p_handoffs = db.scalars(
            select(ReturnHandoff)
            .options(selectinload(ReturnHandoff.return_request).selectinload(ReturnRequest.order))
            .where(ReturnHandoff.destination_department_id == payments_dept.id)
            .order_by(ReturnHandoff.created_at.desc())
            .limit(50)
        ).all()
        for ph in p_handoffs:
            claim = ph.return_request
            order = claim.order if claim else None
            all_events.append({
                "id": f"evt-hnd-{ph.id}",
                "timestamp": ph.created_at.isoformat() if ph.created_at else None,
                "raw_time": ph.created_at or datetime.min,
                "reference": f"HND-{ph.id}",
                "reference_id": f"HND-{ph.id}",
                "order_number": order.order_number if order else "—",
                "action": f"Handoff {ph.status.capitalize()}",
                "event_type": "refund_handoff",
                "previous_state": "created",
                "new_state": ph.status,
                "actor": "Returns & Replacement",
                "provider": "Department Workflow",
                "amount": float(order.total_amount) if order else 0.0,
                "note": f"Refund handoff {ph.status} for TRN-{claim.id}" if claim else "Refund handoff",
            })

    # Sort descending
    all_events.sort(key=lambda x: x["raw_time"], reverse=True)

    # Compute KPI totals across full dataset before filtering
    kpi_total_events = len(all_events)
    kpi_payment_events = sum(1 for e in all_events if e["event_type"] == "payment")
    kpi_refund_events = sum(1 for e in all_events if e["event_type"] in ("refund", "refund_handoff"))
    summary_dict = {
        "total_events": kpi_total_events,
        "payment_events": kpi_payment_events,
        "refund_events": kpi_refund_events,
    }

    # Filter
    filtered_events = all_events
    if event_type and event_type != "all":
        if event_type == "payment":
            filtered_events = [e for e in filtered_events if e["event_type"] == "payment"]
        elif event_type in ("refund", "refund_handoff"):
            filtered_events = [e for e in filtered_events if e["event_type"] in ("refund", "refund_handoff")]
        else:
            filtered_events = [e for e in filtered_events if e["event_type"] == event_type or event_type in e["id"]]

    if search and search.strip():
        s = search.strip().lower()
        filtered_events = [
            e for e in filtered_events if (
                s in e["reference"].lower() or
                s in e["order_number"].lower() or
                s in e["action"].lower() or
                s in e["note"].lower()
            )
        ]

    total = len(filtered_events)
    paged = filtered_events[offset : offset + limit]

    # Clean out internal raw_time
    for p in paged:
        p.pop("raw_time", None)

    return {
        "items": paged,
        "total": total,
        "limit": limit,
        "offset": offset,
        "kpis": summary_dict,
        "summary": summary_dict,
    }


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
    _require_department_handler(db, actor, "Returns & Replacement")
    if actor.role != "department_handler":
        raise HTTPException(status_code=403, detail="Return decisions require an assigned Returns & Replacement handler.")
    _require_claim_access(db, claim_id, actor)
    claim = _commit_claim_operation(db, lambda: apply_claim_decision(
        db, claim_id, actor_id=actor.id, decision=decision, note=payload.note,
        refund_timing=payload.refund_timing,
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
        if actor.role != "department_handler":
            raise HTTPException(status_code=403, detail="Physical pickup inspections require an assigned Order & Delivery handler.")
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
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    if evidence.mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Evidence image type is unsupported.")
    if evidence.storage_provider == "imagekit":
        if not evidence.provider_file_id:
            raise HTTPException(status_code=404, detail="Evidence file is unavailable.")
        try:
            import httpx
            from urllib.parse import urlsplit
            from fastapi.responses import Response
            signed_url = signed_evidence_url(evidence.storage_key, expires_in=60)
            expected_host = urlsplit(os.getenv("IMAGEKIT_URL_ENDPOINT", "")).hostname
            if not expected_host or urlsplit(signed_url).hostname != expected_host:
                raise RuntimeError("ImageKit delivery endpoint is invalid.")
            upstream = httpx.get(signed_url, timeout=15.0, follow_redirects=False)
            if upstream.status_code != 200:
                raise HTTPException(status_code=404, detail="Evidence file is unavailable.")
            return Response(upstream.content, media_type=evidence.mime_type, headers=headers)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Evidence image delivery is unavailable.") from exc
    path = read_evidence(evidence.storage_key)
    if path is None:
        raise HTTPException(status_code=404, detail="Evidence file is unavailable.")
    from fastapi.responses import FileResponse
    return FileResponse(path, media_type=evidence.mime_type, filename=evidence.original_filename, headers=headers)


@handler_router.patch("/return-handoffs/{handoff_id}/status")
def update_return_handoff_status(handoff_id: int, payload: ReturnHandoffStatusInput,
                                 db: Session = Depends(get_db),
                                 actor=Depends(require_role("department_handler", "admin", "super_admin"))):
    handoff = db.scalar(select(ReturnHandoff).where(ReturnHandoff.id == handoff_id).with_for_update())
    if handoff is None:
        raise HTTPException(status_code=404, detail="Return handoff not found.")
    if actor.role != "department_handler" or actor.department_id != handoff.destination_department_id:
        raise HTTPException(status_code=403, detail="This handoff is assigned to another department.")
    allowed = {"pending": {"accepted", "failed"}, "accepted": {"in_progress", "failed"},
               "in_progress": {"completed", "failed"}}
    previous = handoff.status
    if payload.status not in allowed.get(previous, set()):
        raise HTTPException(status_code=409, detail="Invalid handoff status transition.")
    if payload.status == "completed" and handoff.handoff_type == "refund_processing":
        claim = get_return_claim(db, handoff.return_request_id)
        returns_dept = db.scalar(select(Department).where(Department.name == "Returns & Replacement"))
        delivery_dept = db.scalar(select(Department).where(Department.name == "Order & Delivery"))
        payments_dept = db.scalar(select(Department).where(Department.name == "Payments & Refunds"))
        expected_source = (
            returns_dept.id if claim and claim.refund_timing == "immediate" and returns_dept else
            delivery_dept.id if claim and claim.refund_timing == "after_collection" and delivery_dept else None
        )
        if (claim is None or claim.workflow_status != "approved" or claim.resolution_type != "refund"
                or handoff.destination_department_id != (payments_dept.id if payments_dept else None)
                or handoff.source_department_id != expected_source):
            raise HTTPException(status_code=409, detail="Payments handoff ownership does not match an approved refund request.")
        if claim.refund_timing == "after_collection" and db.scalar(select(ReturnHandoff.id).where(
            ReturnHandoff.return_request_id == claim.id,
            ReturnHandoff.handoff_type == "refund_pickup",
            ReturnHandoff.status == "completed",
        ).limit(1)) is None:
            raise HTTPException(status_code=409, detail="Collection must be completed before the Payments handoff can be completed.")
        if not has_verified_processed_refund(db, claim):
            raise HTTPException(status_code=409, detail="A Payments refund handoff requires a verified processed Refund record for the linked payment before completion.")
    if payload.status == "completed" and handoff.handoff_type in {"refund_pickup", "replacement_fulfillment"}:
        milestone_state = order_delivery_milestone_state(db, handoff)
        if not milestone_state["milestone_complete"]:
            raise HTTPException(status_code=409, detail="Required Order & Delivery milestones must be recorded before completion.")
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
