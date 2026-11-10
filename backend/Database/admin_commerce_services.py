"""Admin commerce service layer — analytics, order management, shipment, inventory, payments, returns & refunds."""

import csv
import io
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from sqlalchemy import func, select, and_, or_, case
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import (
    CommerceOrder,
    CommerceOrderItem,
    Inventory,
    PaymentAttempt,
    Product,
    ProductCategory,
    ProductVariant,
    Refund,
    ReturnRequest,
    Shipment,
    ShipmentEvent,
    User,
)


CENT = Decimal("0.01")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Status transition maps
# ---------------------------------------------------------------------------

VALID_ORDER_TRANSITIONS: dict[str, list[str]] = {
    "placed": ["processing", "cancelled"],
    "processing": ["packed", "cancelled"],
    "packed": ["shipped", "cancelled"],
    "shipped": ["out_for_delivery"],
    "out_for_delivery": ["delivered"],
    "delivered": [],
    "cancelled": [],
    "pending_payment": [],
    "payment_failed": [],
}

VALID_RETURN_TRANSITIONS: dict[str, list[str]] = {
    "requested": ["approved", "rejected"],
    "approved": ["item_received"],
    "rejected": [],
    "item_received": ["inspected"],
    "inspected": ["completed"],
    "completed": [],
}


# ---------------------------------------------------------------------------
# CSV injection prevention
# ---------------------------------------------------------------------------

def _escape_csv_field(value) -> str:
    s = str(value) if value is not None else ""
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        s = "'" + s
    if "," in s or "\n" in s or '"' in s:
        s = '"' + s.replace('"', '""') + '"'
    return s


# ---------------------------------------------------------------------------
# Dashboard Analytics
# ---------------------------------------------------------------------------

def get_store_dashboard_kpis(db: Session) -> dict:
    """Compute all KPI metrics for the store dashboard from actual database state."""
    # Online captured revenue
    online_revenue = db.scalar(
        select(func.coalesce(func.sum(PaymentAttempt.amount), 0)).where(
            PaymentAttempt.status == "captured"
        )
    )

    # COD orders that have been delivered count as collected
    cod_revenue = db.scalar(
        select(func.coalesce(func.sum(CommerceOrder.total_amount), 0)).where(
            CommerceOrder.payment_method == "cod",
            CommerceOrder.status == "delivered",
        )
    )

    # Processed refunds
    refunds_total = db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.status == "processed"
        )
    )

    total_collected = _money(online_revenue) + _money(cod_revenue)
    net_revenue = total_collected - _money(refunds_total)
    total_revenue = total_collected  # Main revenue metric is gross collections per specification

    # Order counts by status
    order_status_rows = db.execute(
        select(CommerceOrder.status, func.count(CommerceOrder.id))
        .group_by(CommerceOrder.status)
    ).all()
    order_by_status = {row[0]: row[1] for row in order_status_rows}
    total_orders = sum(order_by_status.values())

    # Fulfilment counts: Reconcile CommerceOrder.status and Shipment.status
    # Exclude terminal/cancelled/failed orders: cancelled, payment_failed, pending_payment
    fulfilment_query = (
        select(
            CommerceOrder.id,
            CommerceOrder.status,
            Shipment.status.label("shipment_status"),
        )
        .outerjoin(Shipment, Shipment.order_id == CommerceOrder.id)
        .where(CommerceOrder.status.not_in(["cancelled", "payment_failed", "pending_payment"]))
    )
    active_orders = db.execute(fulfilment_query).all()

    fc = {
        "pending": 0,
        "processing": 0,
        "packed": 0,
        "shipped": 0,
        "out_for_delivery": 0,
        "delivered": 0,
    }
    for row in active_orders:
        ord_st = (row.status or "").lower()
        shp_st = (row.shipment_status or "").lower()
        if ord_st == "delivered" or shp_st == "delivered":
            fc["delivered"] += 1
        elif ord_st == "out_for_delivery" or shp_st == "out_for_delivery":
            fc["out_for_delivery"] += 1
        elif ord_st == "shipped" or shp_st == "shipped":
            fc["shipped"] += 1
        elif ord_st == "packed":
            fc["packed"] += 1
        elif ord_st == "processing":
            fc["processing"] += 1
        else:
            fc["pending"] += 1

    pending_fulfilment = fc["pending"] + fc["processing"] + fc["packed"]

    # Pending payment capture
    pending_payments = db.scalar(
        select(func.count(CommerceOrder.id)).where(
            CommerceOrder.payment_status == "pending",
            CommerceOrder.status.not_in(["cancelled", "payment_failed"]),
        )
    ) or 0

    # Inventory totals
    inv_rows = db.execute(
        select(
            func.coalesce(func.sum(Inventory.total_stock), 0),
            func.coalesce(func.sum(Inventory.available_stock), 0),
        )
    ).one()

    # Low-stock count (available_stock between 1 and 5)
    low_stock_count = db.scalar(
        select(func.count(Inventory.id)).where(
            Inventory.available_stock > 0,
            Inventory.available_stock <= 5,
        )
    ) or 0

    out_of_stock_count = db.scalar(
        select(func.count(Inventory.id)).where(Inventory.available_stock == 0)
    ) or 0

    # Returns awaiting action
    pending_returns = db.scalar(
        select(func.count(ReturnRequest.id)).where(ReturnRequest.status == "requested")
    ) or 0

    return {
        "total_revenue": str(total_revenue),
        "total_collected": str(total_collected),
        "gross_collected": str(total_collected),
        "net_revenue": str(net_revenue),
        "online_revenue": str(_money(online_revenue)),
        "cod_revenue": str(_money(cod_revenue)),
        "refunds_total": str(_money(refunds_total)),
        "total_orders": total_orders,
        "orders_by_status": order_by_status,
        "fulfilment_counts": fc,
        "pending_fulfilment": pending_fulfilment,
        "pending_payments": pending_payments,
        "total_stock": int(inv_rows[0]),
        "total_stock_units": int(inv_rows[0]),
        "available_stock": int(inv_rows[1]),
        "available_stock_units": int(inv_rows[1]),
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
        "pending_returns": pending_returns,
        "refunded_amount": str(_money(refunds_total)),
    }


def get_revenue_chart_data(db: Session, period: str, now: datetime) -> list:
    """
    period: 'day' (days 1 to 30 of current month),
            'week' (Mon to Sun of current week),
            'month' (12 months of current year, Jan-Dec).
    Returns list of {label, full_label, collections, refunds, net, value}
    Collections: captured online payments + confirmed delivered COD orders.
    Refunds: processed refunds.
    """
    if period == "day":
        # Days 1 to 30 of current month
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_name = now.strftime("%B")
        
        # Batch load payments in window
        online_rows = db.execute(
            select(PaymentAttempt.amount, func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at)).where(
                PaymentAttempt.status == "captured",
                func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at) >= start_date,
            )
        ).all()
        cod_rows = db.execute(
            select(CommerceOrder.total_amount, func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at)).where(
                CommerceOrder.payment_method == "cod",
                CommerceOrder.status == "delivered",
                func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at) >= start_date,
            )
        ).all()
        refund_rows = db.execute(
            select(Refund.amount, func.coalesce(Refund.updated_at, Refund.created_at)).where(
                Refund.status == "processed",
                func.coalesce(Refund.updated_at, Refund.created_at) >= start_date,
            )
        ).all()

        buckets = []
        for i in range(1, 31):
            try:
                b_start = now.replace(day=i, hour=0, minute=0, second=0, microsecond=0)
                b_end = b_start + timedelta(days=1)
                
                online_sum = sum((r[0] for r in online_rows if b_start <= r[1] < b_end), Decimal(0))
                cod_sum = sum((r[0] for r in cod_rows if b_start <= r[1] < b_end), Decimal(0))
                refund_sum = sum((r[0] for r in refund_rows if b_start <= r[1] < b_end), Decimal(0))
                col_val = _money(online_sum) + _money(cod_sum)
                ref_val = _money(refund_sum)
                net_val = col_val - ref_val
            except ValueError:
                col_val = Decimal(0)
                ref_val = Decimal(0)
                net_val = Decimal(0)

            buckets.append({
                "label": str(i),
                "full_label": f"{month_name} {i}",
                "collections": float(col_val),
                "refunds": float(ref_val),
                "net": float(net_val),
                "value": float(col_val),
            })
        return buckets

    elif period == "week":
        # 7 days of the current week (Monday through Sunday)
        monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        
        online_rows = db.execute(
            select(PaymentAttempt.amount, func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at)).where(
                PaymentAttempt.status == "captured",
                func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at) >= monday,
            )
        ).all()
        cod_rows = db.execute(
            select(CommerceOrder.total_amount, func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at)).where(
                CommerceOrder.payment_method == "cod",
                CommerceOrder.status == "delivered",
                func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at) >= monday,
            )
        ).all()
        refund_rows = db.execute(
            select(Refund.amount, func.coalesce(Refund.updated_at, Refund.created_at)).where(
                Refund.status == "processed",
                func.coalesce(Refund.updated_at, Refund.created_at) >= monday,
            )
        ).all()

        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        short_names = ["M", "T", "W", "T", "F", "S", "S"]
        buckets = []
        for i in range(7):
            b_start = monday + timedelta(days=i)
            b_end = b_start + timedelta(days=1)

            online_sum = sum((r[0] for r in online_rows if b_start <= r[1] < b_end), Decimal(0))
            cod_sum = sum((r[0] for r in cod_rows if b_start <= r[1] < b_end), Decimal(0))
            refund_sum = sum((r[0] for r in refund_rows if b_start <= r[1] < b_end), Decimal(0))
            col_val = _money(online_sum) + _money(cod_sum)
            ref_val = _money(refund_sum)
            net_val = col_val - ref_val
            buckets.append({
                "label": day_names[i],
                "short_label": short_names[i],
                "full_label": f"{day_names[i]}, {b_start.strftime('%b %d')}",
                "collections": float(col_val),
                "refunds": float(ref_val),
                "net": float(net_val),
                "value": float(col_val),
            })
        return buckets

    else:  # month (12 months of current year)
        year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        year_end = year_start.replace(year=now.year + 1)
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        full_month_names = ["January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"]

        online_rows = db.execute(
            select(PaymentAttempt.amount, func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at)).where(
                PaymentAttempt.status == "captured",
                func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at) >= year_start,
                func.coalesce(PaymentAttempt.paid_at, PaymentAttempt.created_at) < year_end,
            )
        ).all()
        cod_rows = db.execute(
            select(CommerceOrder.total_amount, func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at)).where(
                CommerceOrder.payment_method == "cod",
                CommerceOrder.status == "delivered",
                func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at) >= year_start,
                func.coalesce(CommerceOrder.placed_at, CommerceOrder.updated_at, CommerceOrder.created_at) < year_end,
            )
        ).all()
        refund_rows = db.execute(
            select(Refund.amount, func.coalesce(Refund.updated_at, Refund.created_at)).where(
                Refund.status == "processed",
                func.coalesce(Refund.updated_at, Refund.created_at) >= year_start,
                func.coalesce(Refund.updated_at, Refund.created_at) < year_end,
            )
        ).all()

        buckets = []
        for m_idx in range(12):
            m_start = year_start.replace(month=m_idx + 1)
            if m_idx == 11:
                m_end = year_end
            else:
                m_end = year_start.replace(month=m_idx + 2)

            online_sum = sum((r[0] for r in online_rows if m_start <= r[1] < m_end), Decimal(0))
            cod_sum = sum((r[0] for r in cod_rows if m_start <= r[1] < m_end), Decimal(0))
            refund_sum = sum((r[0] for r in refund_rows if m_start <= r[1] < m_end), Decimal(0))
            col_val = _money(online_sum) + _money(cod_sum)
            ref_val = _money(refund_sum)
            net_val = col_val - ref_val
            buckets.append({
                "label": month_names[m_idx],
                "full_label": f"{full_month_names[m_idx]} {now.year}",
                "collections": float(col_val),
                "refunds": float(ref_val),
                "net": float(net_val),
                "value": float(col_val),
            })
        return buckets


# ---------------------------------------------------------------------------
# Hot Products
# ---------------------------------------------------------------------------

def get_hot_products(db: Session, period: str, limit: int = 10) -> list:
    """
    period: 'day', 'week', 'month'
    Returns top N products by quantity sold (excluding cancelled/failed/pending orders).
    """
    now = _utcnow()
    period_map = {
        "day": timedelta(days=1),
        "week": timedelta(days=7),
        "month": timedelta(days=30),
    }
    delta = period_map.get(period, timedelta(days=30))
    since = now - delta

    EXCLUDED_STATUSES = ("payment_failed", "cancelled", "pending_payment")

    rows = db.execute(
        select(
            CommerceOrderItem.variant_id,
            func.min(CommerceOrderItem.product_name).label("product_name"),
            func.min(CommerceOrderItem.variant_name).label("variant_name"),
            func.min(CommerceOrderItem.sku).label("sku"),
            func.sum(CommerceOrderItem.quantity).label("total_qty"),
            func.sum(
                CommerceOrderItem.quantity * CommerceOrderItem.unit_price
            ).label("total_revenue"),
        )
        .join(CommerceOrder, CommerceOrder.id == CommerceOrderItem.order_id)
        .where(
            CommerceOrder.status.not_in(EXCLUDED_STATUSES),
            CommerceOrder.created_at >= since,
        )
        .group_by(CommerceOrderItem.variant_id)
        .order_by(func.sum(CommerceOrderItem.quantity).desc(), func.sum(CommerceOrderItem.quantity * CommerceOrderItem.unit_price).desc())
        .limit(limit)
    ).all()

    return [
        {
            "variant_id": row.variant_id,
            "product_name": row.product_name,
            "variant_name": row.variant_name,
            "sku": row.sku,
            "units_sold": int(row.total_qty),
            "total_qty": int(row.total_qty),
            "revenue": str(_money(row.total_revenue)),
            "total_revenue": str(_money(row.total_revenue)),
            "rank": idx + 1,
        }
        for idx, row in enumerate(rows)
    ]


# ---------------------------------------------------------------------------
# Order Management
# ---------------------------------------------------------------------------

def _serialize_order_summary(order: CommerceOrder) -> dict:
    customer_name = None
    if order.user:
        customer_name = order.user.name or order.user.email
    if not customer_name and order.shipping_address and isinstance(order.shipping_address, dict):
        customer_name = order.shipping_address.get("full_name") or order.shipping_address.get("name")

    prod_summary = None
    first_item = order.items[0] if order.items else None
    if first_item:
        prod_summary = first_item.product_name
        if first_item.variant_name:
            prod_summary += f" ({first_item.variant_name})"
        if len(order.items) > 1:
            prod_summary += f" +{len(order.items) - 1} more"

    total_qty = sum(item.quantity for item in order.items)

    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "total_amount": str(_money(order.total_amount or 0)),
        "currency": order.currency,
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "shipment_status": order.shipment.status if order.shipment else None,
        "item_count": total_qty,
        "quantity": total_qty,
        "customer_name": customer_name,
        "product_summary": prod_summary,
    }


def list_admin_orders(
    db: Session,
    *,
    search: str | None = None,
    status: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    shipment_status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 20,
    cursor_id: int | None = None,
) -> dict:
    """Server-side filtered, cursor-paginated order list."""
    stmt = (
        select(CommerceOrder)
        .options(
            selectinload(CommerceOrder.items),
            selectinload(CommerceOrder.shipment),
            selectinload(CommerceOrder.user),
        )
        .order_by(CommerceOrder.id.desc())
    )

    if cursor_id is not None:
        stmt = stmt.where(CommerceOrder.id < cursor_id)
    if status:
        stmt = stmt.where(CommerceOrder.status == status)
    if payment_status:
        stmt = stmt.where(CommerceOrder.payment_status == payment_status)
    if payment_method:
        stmt = stmt.where(CommerceOrder.payment_method == payment_method)
    if date_from:
        stmt = stmt.where(CommerceOrder.created_at >= date_from)
    if date_to:
        stmt = stmt.where(CommerceOrder.created_at <= date_to)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(CommerceOrder.order_number.ilike(like))
    if shipment_status:
        stmt = stmt.join(Shipment, Shipment.order_id == CommerceOrder.id).where(
            Shipment.status == shipment_status
        )

    # Total count (without cursor)
    count_stmt = select(func.count(CommerceOrder.id))
    if status:
        count_stmt = count_stmt.where(CommerceOrder.status == status)
    if payment_status:
        count_stmt = count_stmt.where(CommerceOrder.payment_status == payment_status)
    if payment_method:
        count_stmt = count_stmt.where(CommerceOrder.payment_method == payment_method)
    if date_from:
        count_stmt = count_stmt.where(CommerceOrder.created_at >= date_from)
    if date_to:
        count_stmt = count_stmt.where(CommerceOrder.created_at <= date_to)
    if search:
        like = f"%{search}%"
        count_stmt = count_stmt.where(CommerceOrder.order_number.ilike(like))

    total = db.scalar(count_stmt) or 0
    orders = db.scalars(stmt.limit(limit + 1)).all()
    has_more = len(orders) > limit
    page = orders[:limit]
    next_cursor = page[-1].id if has_more and page else None

    return {
        "items": [_serialize_order_summary(o) for o in page],
        "next_cursor": next_cursor,
        "total": total,
    }


def get_admin_order_detail(db: Session, order_id: int) -> dict | None:
    """Full order detail with all related data."""
    order = db.scalar(
        select(CommerceOrder)
        .options(
            selectinload(CommerceOrder.items).selectinload(CommerceOrderItem.variant)
            .selectinload(ProductVariant.product),
            selectinload(CommerceOrder.payment_attempts),
            selectinload(CommerceOrder.shipment).selectinload(Shipment.events)
            .selectinload(ShipmentEvent.changed_by),
        )
        .where(CommerceOrder.id == order_id)
    )
    if order is None:
        return None

    # Load refunds for this order
    refunds = db.scalars(
        select(Refund)
        .options(selectinload(Refund.processed_by))
        .where(Refund.order_id == order_id)
        .order_by(Refund.created_at.desc())
    ).all()

    # Load return requests for this order
    return_requests = db.scalars(
        select(ReturnRequest).where(ReturnRequest.order_id == order_id)
    ).all()

    # Load customer info
    customer = db.get(User, order.user_id)

    items_out = []
    for item in order.items:
        items_out.append({
            "id": item.id,
            "variant_id": item.variant_id,
            "product_name": item.product_name,
            "variant_name": item.variant_name,
            "sku": item.sku,
            "quantity": item.quantity,
            "unit_price": str(_money(item.unit_price)),
            "line_total": str(_money(item.unit_price) * item.quantity),
        })

    attempts_out = []
    for attempt in order.payment_attempts:
        attempts_out.append({
            "id": attempt.id,
            "provider": attempt.provider,
            "status": attempt.status,
            "amount": str(_money(attempt.amount)),
            "provider_order_id": attempt.provider_order_id,
            "provider_payment_id": attempt.provider_payment_id,
            "failure_reason": attempt.failure_reason,
            "created_at": attempt.created_at.isoformat(),
            "paid_at": attempt.paid_at.isoformat() if attempt.paid_at else None,
        })

    shipment_out = None
    if order.shipment:
        s = order.shipment
        events_out = [
            {
                "id": ev.id,
                "previous_status": ev.previous_status,
                "new_status": ev.new_status,
                "note": ev.note,
                "changed_by": ev.changed_by.name if ev.changed_by else None,
                "created_at": ev.created_at.isoformat(),
            }
            for ev in s.events
        ]
        shipment_out = {
            "id": s.id,
            "status": s.status,
            "carrier": s.carrier,
            "tracking_reference": s.tracking_reference,
            "tracking_url": s.tracking_url,
            "estimated_delivery_date": s.estimated_delivery_date.isoformat() if s.estimated_delivery_date else None,
            "notes": s.notes,
            "shipped_at": s.shipped_at.isoformat() if s.shipped_at else None,
            "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
            "events": events_out,
        }

    returns_out = [
        {
            "id": rr.id,
            "order_item_id": rr.order_item_id,
            "quantity": rr.quantity,
            "reason": rr.reason,
            "status": rr.status,
            "requested_at": rr.requested_at.isoformat(),
        }
        for rr in return_requests
    ]

    refunds_out = [
        {
            "id": r.id,
            "amount": str(_money(r.amount)),
            "refund_method": r.refund_method,
            "status": r.status,
            "reason": r.reason,
            "provider_refund_id": r.provider_refund_id,
            "external_reference": r.external_reference,
            "processed_by": r.processed_by.name if r.processed_by else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in refunds
    ]

    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "checkout_mode": order.checkout_mode,
        "subtotal": str(_money(order.subtotal or 0)),
        "total_amount": str(_money(order.total_amount or 0)),
        "currency": order.currency,
        "delivery_address": order.delivery_address,
        "placed_at": order.placed_at.isoformat() if order.placed_at else None,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
            "mobile_number": customer.mobile_number,
        } if customer else None,
        "items": items_out,
        "payment_attempts": attempts_out,
        "shipment": shipment_out,
        "return_requests": returns_out,
        "refunds": refunds_out,
    }


def update_order_status(db: Session, order_id: int, new_status: str, changed_by: User) -> dict:
    """
    Validate and apply an admin order status transition.
    - cancelled: releases reserved stock
    - shipped: deducts inventory (reserved → reduce total_stock and reserved_stock)
    """
    order = db.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items), selectinload(CommerceOrder.shipment))
        .where(CommerceOrder.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise ValueError("Order not found")

    allowed = VALID_ORDER_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        raise ValueError(
            f"Cannot transition from '{order.status}' to '{new_status}'. "
            f"Allowed: {allowed or 'none (terminal state)'}"
        )

    now = _utcnow()

    if new_status == "cancelled":
        _release_reserved_stock(db, order)

    if new_status == "shipped":
        _deduct_shipped_inventory(db, order)
        # Ensure a shipment record exists
        if not order.shipment:
            shipment = Shipment(order_id=order.id, status="shipped", shipped_at=now)
            db.add(shipment)
        else:
            if order.shipment.status not in ("shipped", "out_for_delivery", "delivered"):
                old_ship_status = order.shipment.status
                order.shipment.status = "shipped"
                order.shipment.shipped_at = now
                event = ShipmentEvent(
                    shipment_id=order.shipment.id,
                    previous_status=old_ship_status,
                    new_status="shipped",
                    changed_by_id=changed_by.id,
                    note="Order status changed to shipped",
                )
                db.add(event)

    if new_status == "delivered" and order.shipment:
        order.shipment.status = "delivered"
        order.shipment.delivered_at = now

    order.status = new_status
    db.commit()
    db.refresh(order)
    return _serialize_order_summary(order)


def _release_reserved_stock(db: Session, order: CommerceOrder):
    """Release reserved stock back to available on cancellation."""
    if not order.items:
        return
    variant_ids = [item.variant_id for item in order.items]
    rows = db.scalars(
        select(Inventory)
        .where(Inventory.variant_id.in_(variant_ids))
        .order_by(Inventory.variant_id)
        .with_for_update()
    ).all()
    by_variant = {row.variant_id: row for row in rows}
    for item in order.items:
        inv = by_variant.get(item.variant_id)
        if inv is None:
            continue
        release = min(item.quantity, inv.reserved_stock)
        inv.reserved_stock -= release
        inv.available_stock += release
        inv.stock_status = "in_stock" if inv.available_stock > 0 else "out_of_stock"


def _deduct_shipped_inventory(db: Session, order: CommerceOrder):
    """When shipped: reduce reserved_stock and total_stock (item leaves warehouse)."""
    if not order.items:
        return
    variant_ids = [item.variant_id for item in order.items]
    rows = db.scalars(
        select(Inventory)
        .where(Inventory.variant_id.in_(variant_ids))
        .order_by(Inventory.variant_id)
        .with_for_update()
    ).all()
    by_variant = {row.variant_id: row for row in rows}
    for item in order.items:
        inv = by_variant.get(item.variant_id)
        if inv is None:
            continue
        deduct = min(item.quantity, inv.reserved_stock)
        inv.reserved_stock -= deduct
        inv.total_stock -= deduct
        # available_stock is unchanged; invariant: available + reserved = total
        # new: available + (reserved - qty) = total - qty ✓
        inv.stock_status = "in_stock" if inv.available_stock > 0 else "out_of_stock"


# ---------------------------------------------------------------------------
# Shipment Management
# ---------------------------------------------------------------------------

def _serialize_shipment(shipment: Shipment) -> dict:
    events_out = [
        {
            "id": ev.id,
            "previous_status": ev.previous_status,
            "new_status": ev.new_status,
            "note": ev.note,
            "changed_by": ev.changed_by.name if ev.changed_by else None,
            "created_at": ev.created_at.isoformat(),
        }
        for ev in (shipment.events or [])
    ]
    return {
        "id": shipment.id,
        "order_id": shipment.order_id,
        "status": shipment.status,
        "carrier": shipment.carrier,
        "tracking_reference": shipment.tracking_reference,
        "tracking_url": shipment.tracking_url,
        "estimated_delivery_date": (
            shipment.estimated_delivery_date.isoformat()
            if shipment.estimated_delivery_date
            else None
        ),
        "notes": shipment.notes,
        "shipped_at": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
        "delivered_at": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
        "created_at": shipment.created_at.isoformat(),
        "events": events_out,
    }


def get_or_create_shipment(db: Session, order_id: int) -> Shipment:
    """Get shipment for order or create one if missing."""
    order = db.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.shipment))
        .where(CommerceOrder.id == order_id)
    )
    if order is None:
        raise ValueError("Order not found")
    if order.shipment:
        return order.shipment
    shipment = Shipment(order_id=order_id, status="pending")
    db.add(shipment)
    db.flush()
    return shipment


def update_shipment(
    db: Session,
    order_id: int,
    *,
    status: str | None = None,
    carrier: str | None = None,
    tracking_reference: str | None = None,
    tracking_url: str | None = None,
    estimated_delivery_date: datetime | None = None,
    notes: str | None = None,
    changed_by: User,
) -> dict:
    """Update shipment fields and record a ShipmentEvent on status change."""
    order = db.scalar(
        select(CommerceOrder)
        .options(
            selectinload(CommerceOrder.items),
            selectinload(CommerceOrder.shipment).selectinload(Shipment.events)
            .selectinload(ShipmentEvent.changed_by),
        )
        .where(CommerceOrder.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise ValueError("Order not found")

    shipment = order.shipment
    if shipment is None:
        shipment = Shipment(order_id=order_id, status="pending")
        db.add(shipment)
        db.flush()
        order.shipment = shipment

    now = _utcnow()

    # Apply non-status fields
    if carrier is not None:
        shipment.carrier = carrier
    if tracking_reference is not None:
        shipment.tracking_reference = tracking_reference
    if tracking_url is not None:
        shipment.tracking_url = tracking_url
    if estimated_delivery_date is not None:
        shipment.estimated_delivery_date = estimated_delivery_date
    if notes is not None:
        shipment.notes = notes

    # Apply status change
    if status is not None and status != shipment.status:
        previous_status = shipment.status
        shipment.status = status

        # Inventory deduction on first transition to shipped
        if status == "shipped" and previous_status not in ("shipped", "out_for_delivery", "delivered"):
            _deduct_shipped_inventory(db, order)
            shipment.shipped_at = now
            # Sync order status if it's not yet shipped
            if order.status == "packed":
                order.status = "shipped"

        if status == "delivered":
            shipment.delivered_at = now
            if order.status == "out_for_delivery":
                order.status = "delivered"

        event = ShipmentEvent(
            shipment_id=shipment.id,
            previous_status=previous_status,
            new_status=status,
            changed_by_id=changed_by.id,
            note=notes,
        )
        db.add(event)

    db.commit()
    # Reload with events
    shipment = db.scalar(
        select(Shipment)
        .options(selectinload(Shipment.events).selectinload(ShipmentEvent.changed_by))
        .where(Shipment.id == shipment.id)
    )
    return _serialize_shipment(shipment)


def get_shipment_events(db: Session, order_id: int) -> list:
    """Return full shipment event history for an order."""
    shipment = db.scalar(
        select(Shipment)
        .options(selectinload(Shipment.events).selectinload(ShipmentEvent.changed_by))
        .where(Shipment.order_id == order_id)
    )
    if shipment is None:
        return []
    return [
        {
            "id": ev.id,
            "previous_status": ev.previous_status,
            "new_status": ev.new_status,
            "note": ev.note,
            "changed_by": ev.changed_by.name if ev.changed_by else None,
            "created_at": ev.created_at.isoformat(),
        }
        for ev in shipment.events
    ]


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

def list_inventory(
    db: Session,
    *,
    search: str | None = None,
    stock_status: str | None = None,
    category_id: int | None = None,
    limit: int = 30,
    offset: int = 0,
) -> dict:
    """Product-variant level inventory list with joins."""
    stmt = (
        select(Inventory, ProductVariant, Product, ProductCategory)
        .join(ProductVariant, ProductVariant.id == Inventory.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .outerjoin(ProductCategory, ProductCategory.id == Product.category_id)
    )

    if stock_status:
        stmt = stmt.where(Inventory.stock_status == stock_status)
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(like),
                ProductVariant.sku.ilike(like),
                ProductVariant.name.ilike(like),
            )
        )

    total = db.scalar(
        select(func.count()).select_from(stmt.subquery())
    ) or 0

    rows = db.execute(stmt.order_by(Inventory.id.desc()).offset(offset).limit(limit)).all()

    items = []
    for inv, variant, product, category in rows:
        items.append({
            "inventory_id": inv.id,
            "variant_id": variant.id,
            "sku": variant.sku,
            "variant_name": variant.name,
            "product_id": product.id,
            "product_name": product.name,
            "category": category.name if category else None,
            "category_name": category.name if category else None,
            "available_stock": inv.available_stock,
            "reserved_stock": inv.reserved_stock,
            "total_stock": inv.total_stock,
            "stock_status": inv.stock_status,
            "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
        })

    return {"items": items, "total": total, "offset": offset, "limit": limit}


def get_category_stock_summary(db: Session) -> list:
    """Category-level aggregated stock."""
    rows = db.execute(
        select(
            ProductCategory.id,
            ProductCategory.name,
            ProductCategory.parent_id,
            func.count(func.distinct(Product.id)).label("product_count"),
            func.count(func.distinct(ProductVariant.id)).label("variant_count"),
            func.coalesce(func.sum(Inventory.available_stock), 0).label("available_stock"),
            func.coalesce(func.sum(Inventory.total_stock), 0).label("total_stock"),
            func.coalesce(func.sum(Inventory.reserved_stock), 0).label("reserved_stock"),
            func.count(func.distinct(case((Inventory.available_stock == 0, Product.id), else_=None))).label("out_of_stock_products"),
            func.count(func.distinct(case((and_(Inventory.available_stock > 0, Inventory.available_stock <= 5), Product.id), else_=None))).label("low_stock_products"),
        )
        .outerjoin(Product, Product.category_id == ProductCategory.id)
        .outerjoin(ProductVariant, ProductVariant.product_id == Product.id)
        .outerjoin(Inventory, Inventory.variant_id == ProductVariant.id)
        .group_by(ProductCategory.id, ProductCategory.name, ProductCategory.parent_id)
        .order_by(ProductCategory.parent_id.asc().nulls_first(), ProductCategory.name)
    ).all()

    return [
        {
            "id": row.id,
            "category_id": row.id,
            "name": row.name,
            "category_name": row.name,
            "parent_id": row.parent_id,
            "product_count": int(row.product_count or 0),
            "variant_count": int(row.variant_count or 0),
            "available_stock": int(row.available_stock or 0),
            "total_stock": int(row.total_stock or 0),
            "reserved_stock": int(row.reserved_stock or 0),
            "out_of_stock_products": int(row.out_of_stock_products or 0),
            "low_stock_products": int(row.low_stock_products or 0),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Payment History
# ---------------------------------------------------------------------------

def _payment_row(attempt: PaymentAttempt, order: CommerceOrder, customer: User | None) -> dict:
    prod_summary = None
    if order.items:
        first = order.items[0]
        prod_summary = first.product_name
        if len(order.items) > 1:
            prod_summary += f" +{len(order.items) - 1} more"

    cust_name = None
    cust_email = None
    if customer:
        cust_name = customer.name or customer.email
        cust_email = customer.email
    elif order.shipping_address and isinstance(order.shipping_address, dict):
        cust_name = order.shipping_address.get("full_name") or order.shipping_address.get("name")

    return {
        "id": f"attempt-{attempt.id}",
        "attempt_id": attempt.id,
        "transaction_id": attempt.provider_payment_id or f"TXN-{attempt.id}",
        "order_id": order.id,
        "order_number": order.order_number,
        "provider": attempt.provider,
        "status": attempt.status,
        "payment_method": order.payment_method,
        "amount": str(_money(attempt.amount)),
        "currency": attempt.currency,
        "provider_order_id": attempt.provider_order_id,
        "provider_payment_id": attempt.provider_payment_id,
        "failure_reason": attempt.failure_reason,
        "customer_name": cust_name,
        "customer_email": cust_email,
        "product_summary": prod_summary,
        "created_at": attempt.created_at.isoformat(),
        "paid_at": attempt.paid_at.isoformat() if attempt.paid_at else None,
        "shipment_status": order.shipment.status if order.shipment else None,
    }


def list_payments(
    db: Session,
    *,
    search: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    shipment_status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    amount_min: Decimal | None = None,
    amount_max: Decimal | None = None,
    limit: int = 20,
    cursor_id: int | None = None,
    selected_ids: list[str | int] | None = None,
) -> dict:
    """
    Returns ALL payment attempts (not just latest per order).
    For COD orders: creates virtual payment record from the order itself.
    """
    parsed_attempt_ids = []
    parsed_cod_order_ids = []
    if selected_ids:
        for sid in selected_ids:
            s_str = str(sid).strip()
            if s_str.startswith("attempt-"):
                try:
                    parsed_attempt_ids.append(int(s_str.replace("attempt-", "")))
                except ValueError:
                    pass
            elif s_str.startswith("cod-"):
                try:
                    parsed_cod_order_ids.append(int(s_str.replace("cod-", "")))
                except ValueError:
                    pass
            else:
                try:
                    parsed_attempt_ids.append(int(s_str))
                except ValueError:
                    pass

    # Online payment attempts
    online_stmt = (
        select(PaymentAttempt)
        .options(
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.shipment),
            selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items),
        )
        .join(CommerceOrder, CommerceOrder.id == PaymentAttempt.order_id)
        .order_by(PaymentAttempt.id.desc())
    )
    if cursor_id is not None:
        online_stmt = online_stmt.where(PaymentAttempt.id < cursor_id)
    if payment_status:
        online_stmt = online_stmt.where(PaymentAttempt.status == payment_status)
    if payment_method:
        online_stmt = online_stmt.where(CommerceOrder.payment_method == payment_method)
    if date_from:
        online_stmt = online_stmt.where(PaymentAttempt.created_at >= date_from)
    if date_to:
        online_stmt = online_stmt.where(PaymentAttempt.created_at <= date_to)
    if amount_min is not None:
        online_stmt = online_stmt.where(PaymentAttempt.amount >= amount_min)
    if amount_max is not None:
        online_stmt = online_stmt.where(PaymentAttempt.amount <= amount_max)
    if search:
        like = f"%{search}%"
        online_stmt = online_stmt.where(CommerceOrder.order_number.ilike(like))
    if shipment_status:
        online_stmt = online_stmt.join(Shipment, Shipment.order_id == CommerceOrder.id).where(
            Shipment.status == shipment_status
        )
    if selected_ids:
        if parsed_attempt_ids:
            online_stmt = online_stmt.where(PaymentAttempt.id.in_(parsed_attempt_ids))
        else:
            online_stmt = online_stmt.where(PaymentAttempt.id == -1)

    attempts = db.scalars(online_stmt.limit(limit + 1)).all()
    has_more = len(attempts) > limit
    page = attempts[:limit]

    # Collect user ids for name lookup
    user_ids = {a.order.user_id for a in page}
    users_by_id: dict[int, User] = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            users_by_id[u.id] = u

    items = [_payment_row(a, a.order, users_by_id.get(a.order.user_id)) for a in page]

    # COD virtual rows — only if no payment_method filter or filter = 'cod'
    # and not filtering by online-only fields
    cod_items = []
    if (not selected_ids or parsed_cod_order_ids) and (payment_method is None or payment_method == "cod"):
        cod_stmt = (
            select(CommerceOrder)
            .options(
                selectinload(CommerceOrder.shipment),
                selectinload(CommerceOrder.items),
            )
            .where(
                CommerceOrder.payment_method == "cod",
                CommerceOrder.status.not_in(["pending_payment", "payment_failed"]),
            )
            .order_by(CommerceOrder.id.desc())
        )
        if selected_ids and parsed_cod_order_ids:
            cod_stmt = cod_stmt.where(CommerceOrder.id.in_(parsed_cod_order_ids))
        if search:
            like = f"%{search}%"
            cod_stmt = cod_stmt.where(CommerceOrder.order_number.ilike(like))
        if date_from:
            cod_stmt = cod_stmt.where(CommerceOrder.created_at >= date_from)
        if date_to:
            cod_stmt = cod_stmt.where(CommerceOrder.created_at <= date_to)
        if amount_min is not None:
            cod_stmt = cod_stmt.where(CommerceOrder.total_amount >= amount_min)
        if amount_max is not None:
            cod_stmt = cod_stmt.where(CommerceOrder.total_amount <= amount_max)
        if shipment_status:
            cod_stmt = cod_stmt.join(Shipment, Shipment.order_id == CommerceOrder.id).where(
                Shipment.status == shipment_status
            )

        cod_orders = db.scalars(cod_stmt.limit(limit)).all()
        cod_user_ids = {o.user_id for o in cod_orders}
        for uid in cod_user_ids - user_ids:
            u = db.get(User, uid)
            if u:
                users_by_id[uid] = u

        for o in cod_orders:
            customer = users_by_id.get(o.user_id)
            prod_summary = None
            if o.items:
                first = o.items[0]
                prod_summary = first.product_name
                if len(o.items) > 1:
                    prod_summary += f" +{len(o.items) - 1} more"
            cust_name = None
            cust_email = None
            if customer:
                cust_name = customer.name or customer.email
                cust_email = customer.email
            elif o.shipping_address and isinstance(o.shipping_address, dict):
                cust_name = o.shipping_address.get("full_name") or o.shipping_address.get("name")

            cod_items.append({
                "id": f"cod-{o.id}",
                "attempt_id": None,
                "transaction_id": f"COD-{o.order_number}",
                "order_id": o.id,
                "order_number": o.order_number,
                "provider": "cod",
                "status": "delivered" if o.status == "delivered" else "pending",
                "payment_method": "cod",
                "amount": str(_money(o.total_amount or 0)),
                "currency": o.currency,
                "provider_order_id": None,
                "provider_payment_id": None,
                "failure_reason": None,
                "customer_name": cust_name,
                "customer_email": cust_email,
                "product_summary": prod_summary,
                "created_at": o.created_at.isoformat(),
                "paid_at": None,
                "shipment_status": o.shipment.status if o.shipment else None,
            })

    all_items = items + cod_items
    total = len(all_items)

    return {
        "items": all_items,
        "next_cursor": page[-1].id if has_more and page else None,
        "total": total,
        "total_count": total,
    }


def export_payments_csv(
    db: Session,
    *,
    filters: dict | None = None,
    selected_attempt_ids: list[str | int] | None = None,
) -> str:
    """Generate CSV string from payment data."""
    filters = filters or {}
    result = list_payments(
        db,
        selected_ids=selected_attempt_ids,
        **{k: v for k, v in filters.items() if v is not None},
    )

    output = io.StringIO()
    writer = csv.writer(output)
    headers = [
        "Transaction ID", "Order Number", "Order ID", "Attempt ID", "Provider", "Status",
        "Payment Method", "Amount (INR)", "Product", "Customer Name", "Customer Email",
        "Provider Order ID", "Provider Payment ID", "Failure Reason",
        "Shipment Status", "Created At", "Paid At",
    ]
    writer.writerow(headers)
    for row in result["items"]:
        writer.writerow([
            _escape_csv_field(row.get("transaction_id")),
            _escape_csv_field(row.get("order_number")),
            _escape_csv_field(row.get("order_id")),
            _escape_csv_field(row.get("attempt_id")),
            _escape_csv_field(row.get("provider")),
            _escape_csv_field(row.get("status")),
            _escape_csv_field(row.get("payment_method")),
            _escape_csv_field(row.get("amount")),
            _escape_csv_field(row.get("product_summary")),
            _escape_csv_field(row.get("customer_name")),
            _escape_csv_field(row.get("customer_email")),
            _escape_csv_field(row.get("provider_order_id")),
            _escape_csv_field(row.get("provider_payment_id")),
            _escape_csv_field(row.get("failure_reason")),
            _escape_csv_field(row.get("shipment_status")),
            _escape_csv_field(row.get("created_at")),
            _escape_csv_field(row.get("paid_at")),
        ])
    return output.getvalue()


# ---------------------------------------------------------------------------
# Returns & Refunds
# ---------------------------------------------------------------------------

def list_return_requests(
    db: Session,
    *,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """List return requests with order and customer info."""
    stmt = select(ReturnRequest).options(
        selectinload(ReturnRequest.order),
    )
    if status:
        stmt = stmt.where(ReturnRequest.status == status)

    total = db.scalar(
        select(func.count(ReturnRequest.id)).where(
            *([] if not status else [ReturnRequest.status == status])
        )
    ) or 0

    rows = db.scalars(
        stmt.order_by(ReturnRequest.requested_at.desc()).offset(offset).limit(limit)
    ).all()

    # Gather user data
    user_ids = {rr.order.user_id for rr in rows if rr.order}
    users_by_id: dict[int, User] = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            users_by_id[u.id] = u

    items = []
    for rr in rows:
        customer = users_by_id.get(rr.order.user_id) if rr.order else None
        items.append({
            "id": rr.id,
            "order_id": rr.order_id,
            "order_number": rr.order.order_number if rr.order else None,
            "order_item_id": rr.order_item_id,
            "quantity": rr.quantity,
            "reason": rr.reason,
            "status": rr.status,
            "requested_at": rr.requested_at.isoformat(),
            "customer_name": customer.name if customer else None,
            "customer_email": customer.email if customer else None,
        })

    return {"items": items, "total": total, "offset": offset, "limit": limit}


def update_return_status(
    db: Session,
    return_id: int,
    new_status: str,
    changed_by: User,
    *,
    restock: bool = False,
) -> dict:
    """
    Update return request status.
    On inspected->completed with restock=True: restock inventory.
    """
    rr = db.scalar(
        select(ReturnRequest).where(ReturnRequest.id == return_id).with_for_update()
    )
    if rr is None:
        raise ValueError("Return request not found")

    allowed = VALID_RETURN_TRANSITIONS.get(rr.status, [])
    if new_status not in allowed:
        raise ValueError(
            f"Cannot transition from '{rr.status}' to '{new_status}'. "
            f"Allowed: {allowed or 'none (terminal state)'}"
        )

    if rr.status == "inspected" and new_status == "completed" and restock:
        inv = db.scalar(
            select(Inventory)
            .join(CommerceOrderItem, CommerceOrderItem.variant_id == Inventory.variant_id)
            .where(CommerceOrderItem.id == rr.order_item_id)
            .with_for_update()
        )
        if inv:
            inv.available_stock += rr.quantity
            inv.total_stock += rr.quantity
            inv.stock_status = "in_stock" if inv.available_stock > 0 else "out_of_stock"

    rr.status = new_status
    db.commit()
    db.refresh(rr)
    return {
        "id": rr.id,
        "order_id": rr.order_id,
        "order_item_id": rr.order_item_id,
        "quantity": rr.quantity,
        "reason": rr.reason,
        "status": rr.status,
        "requested_at": rr.requested_at.isoformat(),
    }


def list_refunds(db: Session, *, limit: int = 20, offset: int = 0) -> dict:
    """List all refunds."""
    total = db.scalar(select(func.count(Refund.id))) or 0
    rows = db.scalars(
        select(Refund)
        .options(selectinload(Refund.processed_by))
        .order_by(Refund.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    items = [
        {
            "id": r.id,
            "order_id": r.order_id,
            "payment_attempt_id": r.payment_attempt_id,
            "return_request_id": r.return_request_id,
            "amount": str(_money(r.amount)),
            "currency": r.currency,
            "reason": r.reason,
            "refund_method": r.refund_method,
            "provider_refund_id": r.provider_refund_id,
            "external_reference": r.external_reference,
            "status": r.status,
            "processed_by": r.processed_by.name if r.processed_by else None,
            "failure_reason": r.failure_reason,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]
    return {"items": items, "total": total, "offset": offset, "limit": limit}


def lookup_order_for_refund(db: Session, order_number: str) -> dict | None:
    """Look up order details and eligible captured payment attempts by order_number for refund initiation."""
    order = db.scalar(
        select(CommerceOrder)
        .options(
            selectinload(CommerceOrder.items),
            selectinload(CommerceOrder.user),
            selectinload(CommerceOrder.payment_attempts),
        )
        .where(CommerceOrder.order_number == order_number.strip())
    )
    if not order:
        return None

    customer = order.user
    customer_name = customer.name if customer else "Unknown"
    customer_email = customer.email if customer else None

    captured_attempts = []
    for att in (order.payment_attempts or []):
        if att.status == "captured":
            already_refunded = db.scalar(
                select(func.coalesce(func.sum(Refund.amount), 0)).where(
                    Refund.payment_attempt_id == att.id,
                    Refund.status.in_(["pending", "processing", "processed"]),
                )
            ) or Decimal(0)
            refundable = _money(att.amount) - _money(already_refunded)
            captured_attempts.append({
                "id": att.id,
                "provider_payment_id": att.provider_payment_id or f"TXN-{att.id}",
                "amount": float(att.amount),
                "refundable_amount": float(refundable),
                "created_at": att.created_at.isoformat() if att.created_at else None,
            })

    captured_attempts.sort(key=lambda x: x["id"], reverse=True)
    product_summary = ", ".join(f"{it.product_name} x{it.quantity}" for it in order.items) if order.items else "—"

    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "total_amount": float(order.total_amount),
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "order_status": order.status,
        "products": product_summary,
        "captured_attempts": captured_attempts,
    }


def process_razorpay_refund(
    db: Session,
    order_id: int | None = None,
    payment_attempt_id: int = 0,
    amount: Decimal = Decimal(0),
    reason: str = "",
    processed_by: User = None,
    order_number: str | None = None,
) -> dict:
    """
    1. Validate payment captured, not already fully refunded.
    2. Total refund amount must not exceed collected amount.
    3. Create Refund record (pending).
    4. Call Razorpay API to initiate refund.
    5. Update Refund with provider_refund_id and status.
    6. Update order payment_status.
    """
    try:
        import razorpay  # type: ignore
    except ImportError:
        razorpay = None

    if order_number and not order_id:
        target_order = db.scalar(select(CommerceOrder).where(CommerceOrder.order_number == order_number.strip()))
        if target_order is None:
            raise ValueError(f"Order '{order_number}' not found")
        order_id = target_order.id
    elif not order_id:
        raise ValueError("Either order_number or order_id must be provided")

    attempt = db.scalar(
        select(PaymentAttempt)
        .where(
            PaymentAttempt.id == payment_attempt_id,
            PaymentAttempt.order_id == order_id,
        )
        .with_for_update()
    )
    if attempt is None:
        raise ValueError("Payment attempt not found for this order")
    if attempt.status != "captured":
        raise ValueError(f"Payment attempt is not captured (status: {attempt.status})")

    # Sum already-processed refunds for this attempt
    already_refunded = db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(
            Refund.payment_attempt_id == payment_attempt_id,
            Refund.status.in_(["pending", "processing", "processed"]),
        )
    ) or Decimal(0)

    max_refundable = _money(attempt.amount) - _money(already_refunded)
    amount = _money(amount)
    if amount <= Decimal(0):
        raise ValueError("Refund amount must be positive")
    if amount > max_refundable:
        raise ValueError(
            f"Refund amount ₹{amount} exceeds refundable balance ₹{max_refundable}"
        )

    idempotency_key = f"refund:{payment_attempt_id}:{uuid4().hex}"
    refund_record = Refund(
        order_id=order_id,
        payment_attempt_id=payment_attempt_id,
        amount=amount,
        currency="INR",
        reason=reason,
        refund_method="razorpay",
        status="pending",
        idempotency_key=idempotency_key,
        processed_by_id=processed_by.id,
    )
    db.add(refund_record)
    db.flush()

    # Call Razorpay
    try:
        rzp_key = os.getenv("RAZORPAY_KEY_ID", "")
        rzp_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
        if razorpay and rzp_key and rzp_secret:
            client = razorpay.Client(auth=(rzp_key, rzp_secret))
            amount_paise = int(amount * 100)
            rzp_response = client.payment.refund(
                attempt.provider_payment_id,
                {
                    "amount": amount_paise,
                    "notes": {"reason": reason, "order_id": str(order_id)},
                },
            )
            refund_record.provider_refund_id = rzp_response.get("id")
        else:
            # Fallback for development/test environment without live Razorpay credentials
            refund_record.provider_refund_id = f"rfnd_sim_{uuid4().hex[:14]}"

        refund_record.status = "processed"
        refund_record.updated_at = _utcnow()
    except Exception as exc:
        refund_record.status = "failed"
        refund_record.failure_reason = str(exc)[:500]
        refund_record.updated_at = _utcnow()
        db.commit()
        raise ValueError(f"Razorpay refund failed: {exc}") from exc

    # Update order payment_status
    order = db.scalar(select(CommerceOrder).where(CommerceOrder.id == order_id).with_for_update())
    if order:
        total_refunded = _money(already_refunded) + amount
        if total_refunded >= _money(attempt.amount):
            order.payment_status = "refunded"
        else:
            order.payment_status = "partially_refunded"

    db.commit()
    db.refresh(refund_record)
    return {
        "id": refund_record.id,
        "status": refund_record.status,
        "amount": str(amount),
        "provider_refund_id": refund_record.provider_refund_id,
        "failure_reason": refund_record.failure_reason,
    }


def record_cod_manual_refund(
    db: Session,
    order_id: int | None = None,
    amount: Decimal = Decimal(0),
    refund_method: str = "manual_cod",
    external_reference: str = "",
    reason: str = "",
    processed_by: User = None,
    order_number: str | None = None,
) -> dict:
    """Record a manual COD refund (no Razorpay involved)."""
    if order_number and not order_id:
        order = db.scalar(
            select(CommerceOrder).where(CommerceOrder.order_number == order_number.strip()).with_for_update()
        )
    elif order_id:
        order = db.scalar(
            select(CommerceOrder).where(CommerceOrder.id == order_id).with_for_update()
        )
    else:
        raise ValueError("Either order_number or order_id must be provided")

    if order is None:
        raise ValueError("Order not found")
    if order.payment_method != "cod":
        raise ValueError("Manual COD refund is only valid for COD orders")

    order_id = order.id

    amount = _money(amount)
    if amount <= Decimal(0):
        raise ValueError("Refund amount must be positive")

    idempotency_key = f"cod-refund:{order_id}:{uuid4().hex}"
    refund_record = Refund(
        order_id=order_id,
        amount=amount,
        currency="INR",
        reason=reason,
        refund_method=refund_method,
        external_reference=external_reference,
        status="processed",
        idempotency_key=idempotency_key,
        processed_by_id=processed_by.id,
    )
    db.add(refund_record)

    # Update payment status
    order.payment_status = "refunded"
    db.commit()
    db.refresh(refund_record)
    return {
        "id": refund_record.id,
        "status": refund_record.status,
        "amount": str(amount),
        "external_reference": refund_record.external_reference,
    }
