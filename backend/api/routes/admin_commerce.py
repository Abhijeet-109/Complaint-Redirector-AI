"""Admin commerce router — live dashboard metrics, order lifecycle, shipments, inventory, payments, returns, and refunds."""

from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_db, require_role
from backend.Database.models import User
from backend.Database.admin_commerce_services import (
    get_store_dashboard_kpis,
    get_revenue_chart_data,
    get_hot_products,
    list_admin_orders,
    get_admin_order_detail,
    update_order_status,
    update_shipment,
    get_shipment_events,
    list_inventory,
    get_category_stock_summary,
    list_payments,
    export_payments_csv,
    list_return_requests,
    update_return_status,
    list_refunds,
    lookup_order_for_refund,
    process_razorpay_refund,
    record_cod_manual_refund,
)

router = APIRouter(prefix="/api/admin/commerce", tags=["Admin Commerce Management"])
logger = logging.getLogger(__name__)
admin_access = require_role("admin", "super_admin")


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class OrderStatusUpdateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    status: str = Field(..., description="Target order status")
    reason: str | None = Field(default=None, min_length=3, max_length=500, description="Optional admin override reason")

    @field_validator("reason", mode="before")
    @classmethod
    def blank_reason_is_absent(cls, value):
        return value.strip() or None if isinstance(value, str) else value


class ShipmentUpdateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    status: Optional[str] = Field(None, description="Shipment status")
    carrier: Optional[str] = Field(None, description="Logistics carrier name")
    tracking_reference: Optional[str] = Field(None, description="Waybill / tracking number")
    tracking_url: Optional[str] = Field(None, description="Public tracking URL")
    estimated_delivery_date: Optional[datetime] = Field(None, description="Estimated delivery timestamp")
    notes: Optional[str] = Field(None, description="Shipment notes")
    reason: str | None = Field(default=None, min_length=3, max_length=500, description="Optional admin override reason")

    @field_validator("reason", mode="before")
    @classmethod
    def blank_reason_is_absent(cls, value):
        return value.strip() or None if isinstance(value, str) else value


class ReturnStatusUpdateInput(BaseModel):
    status: str = Field(..., description="Target return request status")
    restock: bool = Field(False, description="Whether to restock returned units when completed")


class RazorpayRefundInput(BaseModel):
    order_number: Optional[str] = None
    order_id: Optional[int] = None
    payment_attempt_id: int
    amount: Decimal = Field(..., gt=0, description="Refund amount in INR")
    reason: str = Field(..., min_length=3, max_length=500)


class CODManualRefundInput(BaseModel):
    order_number: Optional[str] = None
    order_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0, description="Refund amount in INR")
    refund_method: str = Field(..., description="E.g. manual_cod, manual_bank, upi")
    external_reference: str = Field(..., min_length=1, max_length=120)
    reason: str = Field(..., min_length=3, max_length=500)


# ---------------------------------------------------------------------------
# Dashboard Analytics Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard/kpis")
def get_dashboard_kpis(
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Compute store dashboard KPIs from live PostgreSQL data."""
    try:
        return get_store_dashboard_kpis(db)
    except Exception as exc:
        logger.error("Failed to compute dashboard KPIs: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to compute store metrics")


@router.get("/dashboard/revenue-chart")
def get_revenue_chart(
    period: str = Query("month", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Aggregate actual captured revenue into discrete time buckets."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        return get_revenue_chart_data(db, period=period, now=now)
    except Exception as exc:
        logger.error("Failed to generate revenue chart: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch revenue activity")


@router.get("/dashboard/hot-products")
def get_dashboard_hot_products(
    period: str = Query("week", pattern="^(day|week|month)$"),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Get top performing products ranked by confirmed sales."""
    try:
        return get_hot_products(db, period=period, limit=limit)
    except Exception as exc:
        logger.error("Failed to fetch hot products: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch top selling products")


# ---------------------------------------------------------------------------
# Order Lifecycle Management Endpoints
# ---------------------------------------------------------------------------

@router.get("/orders")
def get_admin_orders(
    search: Optional[str] = Query(None, description="Search by order number"),
    status: Optional[str] = Query(None, description="Order status filter"),
    payment_status: Optional[str] = Query(None, description="Payment status filter"),
    payment_method: Optional[str] = Query(None, description="Payment method filter"),
    shipment_status: Optional[str] = Query(None, description="Shipment status filter"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    cursor_id: Optional[int] = Query(None, description="Keyset pagination cursor"),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """List orders with server-side filters and cursor pagination."""
    return list_admin_orders(
        db,
        search=search,
        status=status,
        payment_status=payment_status,
        payment_method=payment_method,
        shipment_status=shipment_status,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        cursor_id=cursor_id,
    )


@router.get("/orders/lookup/{order_number}")
def lookup_order_for_refund_endpoint(
    order_number: str,
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Lookup order details and eligible captured payment attempts by order_number for refund initiation."""
    order_data = lookup_order_for_refund(db, order_number)
    if order_data is None:
        raise HTTPException(status_code=404, detail=f"Order '{order_number}' not found")
    return order_data


@router.get("/orders/{order_id}")
def get_order_details(
    order_id: int,
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Get comprehensive admin order dossier including items, attempts, shipment, and returns."""
    order = get_admin_order_detail(db, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/orders/{order_id}/status")
def patch_order_status(
    order_id: int,
    payload: OrderStatusUpdateInput,
    db: Session = Depends(get_db),
    actor: User = Depends(admin_access),
):
    """Apply a privileged order status change with an optional audit reason."""
    try:
        return update_order_status(db, order_id, payload.status, changed_by=actor, note=payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to update order %s status: %s", order_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update order status")


# ---------------------------------------------------------------------------
# Shipment Tracking & Events Endpoints
# ---------------------------------------------------------------------------

@router.get("/orders/{order_id}/shipment")
def get_order_shipment(
    order_id: int,
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Get shipment record and event timeline for an order."""
    order = get_admin_order_detail(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order.get("shipment")


@router.patch("/orders/{order_id}/shipment")
def patch_order_shipment(
    order_id: int,
    payload: ShipmentUpdateInput,
    db: Session = Depends(get_db),
    actor: User = Depends(admin_access),
):
    """Apply a privileged shipment update with an optional audit reason."""
    try:
        return update_shipment(
            db,
            order_id,
            status=payload.status,
            carrier=payload.carrier,
            tracking_reference=payload.tracking_reference,
            tracking_url=payload.tracking_url,
            estimated_delivery_date=payload.estimated_delivery_date,
            notes=payload.notes,
            audit_reason=payload.reason,
            changed_by=actor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to update shipment for order %s: %s", order_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update shipment")


@router.get("/orders/{order_id}/shipment/events")
def get_order_shipment_events(
    order_id: int,
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Get the auditable shipment history events timeline."""
    return get_shipment_events(db, order_id)


# ---------------------------------------------------------------------------
# Inventory Management Endpoints
# ---------------------------------------------------------------------------

@router.get("/inventory")
def get_inventory_items(
    search: Optional[str] = Query(None, description="Search by product, SKU, or variant name"),
    stock_status: Optional[str] = Query(None, description="in_stock or out_of_stock"),
    category_id: Optional[int] = Query(None),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """List live stock units by variant/SKU with product and category metadata."""
    return list_inventory(
        db,
        search=search,
        stock_status=stock_status,
        category_id=category_id,
        limit=limit,
        offset=offset,
    )


@router.get("/inventory/categories")
def get_category_inventory_summary(
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Aggregated category stock breakdown supporting parent/child hierarchies without double-counting."""
    return get_category_stock_summary(db)


# ---------------------------------------------------------------------------
# Payment History & CSV Export Endpoints
# ---------------------------------------------------------------------------

@router.get("/payments")
def get_payment_history(
    search: Optional[str] = Query(None, description="Search transaction, order, customer, product"),
    payment_status: Optional[str] = Query(None),
    payment_method: Optional[str] = Query(None),
    shipment_status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    amount_min: Optional[Decimal] = Query(None),
    amount_max: Optional[Decimal] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    cursor_id: Optional[int] = Query(None),
    selected_ids: Optional[str] = Query(None, description="Comma-separated payment IDs"),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Complete transaction ledger: successful, failed, pending Razorpay attempts and COD records."""
    selected_list = [s.strip() for s in selected_ids.split(",") if s.strip()] if selected_ids else None
    return list_payments(
        db,
        search=search,
        payment_status=payment_status,
        payment_method=payment_method,
        shipment_status=shipment_status,
        date_from=date_from,
        date_to=date_to,
        amount_min=amount_min,
        amount_max=amount_max,
        limit=limit,
        cursor_id=cursor_id,
        selected_ids=selected_list,
    )


@router.get("/payments/export/csv")
def export_payment_history_csv(
    mode: str = Query("filtered", pattern="^(filtered|selected)$"),
    search: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    payment_method: Optional[str] = Query(None),
    shipment_status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    selected_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """Export filtered or selected transactions to a CSV file with formula-injection protection."""
    selected_list = [s.strip() for s in selected_ids.split(",") if s.strip()] if selected_ids else None
    filters = {
        "search": search,
        "payment_status": payment_status,
        "payment_method": payment_method,
        "shipment_status": shipment_status,
        "date_from": date_from,
        "date_to": date_to,
    }
    csv_content = export_payments_csv(db, filters=filters, selected_attempt_ids=selected_list)
    filename = f"flatkart_payments_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Returns & Refunds Endpoints
# ---------------------------------------------------------------------------

@router.get("/returns")
def get_return_requests(
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """List customer return requests with order and item details."""
    return list_return_requests(db, status=status, limit=limit, offset=offset)


@router.patch("/returns/{return_id}/status")
def patch_return_status(
    return_id: int,
    payload: ReturnStatusUpdateInput,
    db: Session = Depends(get_db),
    actor: User = Depends(admin_access),
):
    """Update return request status and optionally restock returned items upon completion."""
    try:
        return update_return_status(db, return_id, payload.status, changed_by=actor, restock=payload.restock)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to update return %s status: %s", return_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update return request status")


@router.get("/refunds")
def get_refund_records(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _actor: User = Depends(admin_access),
):
    """List persisted refund transactions."""
    return list_refunds(db, limit=limit, offset=offset)


@router.post("/refunds/razorpay")
def create_razorpay_refund(
    payload: RazorpayRefundInput,
    db: Session = Depends(get_db),
    actor: User = Depends(admin_access),
):
    """Initiate and verify an online refund via Razorpay with idempotency."""
    try:
        return process_razorpay_refund(
            db,
            order_id=payload.order_id,
            payment_attempt_id=payload.payment_attempt_id,
            amount=payload.amount,
            reason=payload.reason,
            processed_by=actor,
            order_number=payload.order_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        logger.error("Razorpay refund exception: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/refunds/cod-manual")
def create_cod_manual_refund(
    payload: CODManualRefundInput,
    db: Session = Depends(get_db),
    actor: User = Depends(admin_access),
):
    """Record an offline/manual COD refund with external transaction reference."""
    try:
        return record_cod_manual_refund(
            db,
            order_id=payload.order_id,
            amount=payload.amount,
            refund_method=payload.refund_method,
            external_reference=payload.external_reference,
            reason=payload.reason,
            processed_by=actor,
            order_number=payload.order_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        logger.error("COD manual refund exception: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
