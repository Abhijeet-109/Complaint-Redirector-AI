"""Transactional cart checkout and inventory reservation helpers."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import os
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    CommerceOrderItem,
    Inventory,
    PaymentAttempt,
    Product,
    ProductVariant,
)


CENT = Decimal("0.01")


def utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def amount_in_paise(value) -> int:
    return int(money(value) * 100)


def active_cart_for_update(session: Session, user_id: int):
    return session.scalar(
        select(Cart)
        .options(
            selectinload(Cart.items)
            .selectinload(CartItem.variant)
            .selectinload(ProductVariant.product)
            .selectinload(Product.images),
            selectinload(Cart.items).selectinload(CartItem.variant).selectinload(ProductVariant.inventory),
        )
        .where(Cart.user_id == user_id, Cart.status == "active")
        .with_for_update()
    )


def cart_payment_methods(cart) -> dict[str, bool]:
    if not cart or not cart.items:
        return {"cod": False, "online": False, "online_methods": []}
    method_sets = []
    for item in cart.items:
        variant = item.variant
        if variant is None or variant.product is None:
            return {"cod": False, "online": False, "online_methods": []}
        methods = variant.product.payment_methods or []
        method_sets.append(set(methods))
    razorpay_ready = (
        os.getenv("RAZORPAY_MODE", "test").strip().lower() == "test"
        and os.getenv("RAZORPAY_KEY_ID", "").strip().startswith("rzp_test_")
        and bool(os.getenv("RAZORPAY_KEY_SECRET", "").strip())
    )
    cart_total = sum((money(item.variant.price) * item.quantity for item in cart.items), Decimal("0.00"))
    return {
        "cod": all("cod" in methods for methods in method_sets),
        "online": razorpay_ready and cart_total >= Decimal("1.00") and all(
            bool(methods & {"upi", "netbanking"}) for methods in method_sets
        ),
        "online_methods": sorted(set.intersection(*(methods & {"upi", "netbanking"} for methods in method_sets)))
        if method_sets else [],
    }


def serialize_cart(cart):
    if cart is None:
        return {"id": None, "items": [], "item_count": 0, "subtotal": "0.00", "payment_methods": {"cod": False, "online": False, "online_methods": []}}
    items = []
    subtotal = Decimal("0.00")
    for line in sorted(cart.items, key=lambda item: item.variant_id):
        variant = line.variant
        product = variant.product
        price = money(variant.price)
        line_total = price * line.quantity
        subtotal += line_total
        images = sorted(product.images, key=lambda image: (image.display_order, image.id))
        variant_image = next((image for image in images if image.variant_id == variant.id), None)
        image = variant_image or next((image for image in images if image.variant_id is None), None)
        inventory = variant.inventory
        items.append({
            "id": line.id,
            "product_id": product.id,
            "variant_id": variant.id,
            "product_name": product.name,
            "variant_name": variant.name,
            "sku": variant.sku,
            "image": image.storage_key if image else None,
            "quantity": line.quantity,
            "unit_price": str(price),
            "line_total": str(line_total),
            "available_stock": inventory.available_stock if inventory else 0,
        })
    subtotal = money(subtotal)
    return {
        "id": cart.id,
        "items": items,
        "item_count": sum(item["quantity"] for item in items),
        "subtotal": str(subtotal),
        "total_amount": str(subtotal),
        "currency": "INR",
        "payment_methods": cart_payment_methods(cart),
    }


def _cart_lines_and_total(cart):
    if cart is None or not cart.items:
        raise ValueError("Your cart is empty")
    methods = cart_payment_methods(cart)
    lines = []
    subtotal = Decimal("0.00")
    for line in sorted(cart.items, key=lambda item: item.variant_id):
        variant = line.variant
        product = variant.product
        inventory = variant.inventory
        if not product.is_active or not variant.is_available:
            raise ValueError("A product in your cart is no longer available")
        if inventory is None or inventory.available_stock < line.quantity:
            raise ValueError(f"Insufficient available stock for {product.name} ({variant.name})")
        price = money(variant.price)
        line_total = price * line.quantity
        subtotal += line_total
        lines.append((line, variant, product, price, line_total))
    return lines, money(subtotal), methods


def _reserve_lines(session: Session, lines):
    inventory_ids = [variant.id for _, variant, _, _, _ in lines]
    rows = session.scalars(
        select(Inventory).where(Inventory.variant_id.in_(inventory_ids)).order_by(Inventory.variant_id).with_for_update()
    ).all()
    by_variant = {row.variant_id: row for row in rows}
    for line, variant, product, _, _ in lines:
        inventory = by_variant.get(variant.id)
        if inventory is None or inventory.available_stock < line.quantity:
            raise ValueError(f"Insufficient available stock for {product.name} ({variant.name})")
    for line, variant, _, _, _ in lines:
        inventory = by_variant[variant.id]
        inventory.available_stock -= line.quantity
        inventory.reserved_stock += line.quantity
        inventory.stock_status = "in_stock" if inventory.available_stock > 0 else "out_of_stock"
    return by_variant


def _release_order_reservation(session: Session, order: CommerceOrder):
    if not order.items:
        return
    variant_ids = [item.variant_id for item in order.items]
    rows = session.scalars(
        select(Inventory).where(Inventory.variant_id.in_(variant_ids)).order_by(Inventory.variant_id).with_for_update()
    ).all()
    by_variant = {row.variant_id: row for row in rows}
    for item in order.items:
        inventory = by_variant.get(item.variant_id)
        if inventory is None or inventory.reserved_stock < item.quantity:
            continue
        inventory.reserved_stock -= item.quantity
        inventory.available_stock += item.quantity
        inventory.stock_status = "in_stock" if inventory.available_stock > 0 else "out_of_stock"


def expire_pending_attempts(session: Session, *, now=None, safe_provider_order_ids=None):
    now = now or utcnow_naive()
    safe_provider_order_ids = safe_provider_order_ids or set()
    attempts = session.scalars(
        select(PaymentAttempt)
        .options(selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items))
        .where(PaymentAttempt.status.in_(["created", "pending"]), PaymentAttempt.expires_at <= now)
        .with_for_update()
    ).all()
    for attempt in attempts:
        if attempt.provider_order_id and attempt.provider_order_id not in safe_provider_order_ids:
            continue
        if not attempt.provider_order_id and None not in safe_provider_order_ids:
            continue
        fail_attempt(session, attempt, "Payment attempt expired", state="expired")
    return len(attempts)


def _order_items_match_cart(order, cart):
    expected = {(item.variant_id, item.quantity) for item in cart.items}
    stored = {(item.variant_id, item.quantity) for item in order.items}
    return expected == stored


def create_online_order(session: Session, *, user_id: int, idempotency_key: str, address: dict):
    existing = session.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items), selectinload(CommerceOrder.payment_attempts))
        .where(CommerceOrder.user_id == user_id, CommerceOrder.idempotency_key == idempotency_key)
    )
    if existing:
        attempt = max(existing.payment_attempts, key=lambda row: row.id, default=None)
        if attempt and attempt.status in {"created", "pending"}:
            return existing, attempt, True
        if attempt and attempt.status == "captured":
            return existing, attempt, True
        cart = active_cart_for_update(session, user_id)
        lines, subtotal, methods = _cart_lines_and_total(cart)
        if not methods["online"] or not _order_items_match_cart(existing, cart):
            raise ValueError("Your cart has changed. Review it before retrying payment")
        _reserve_lines(session, lines)
        existing.status = "pending_payment"
        existing.payment_status = "pending"
        existing.subtotal = subtotal
        existing.total_amount = subtotal
        existing.delivery_address = address
        existing.idempotency_key = idempotency_key
        by_variant = {item.variant_id: item for item in existing.items}
        for _, variant, product, price, _ in lines:
            snapshot = by_variant[variant.id]
            snapshot.product_name = product.name
            snapshot.variant_name = variant.name
            snapshot.sku = variant.sku
            snapshot.unit_price = price
        retry_attempt = PaymentAttempt(
            order=existing,
            provider="razorpay",
            status="created",
            amount=subtotal,
            currency="INR",
            idempotency_key=f"{user_id}:{uuid4().hex}",
            expires_at=utcnow_naive() + timedelta(minutes=15),
        )
        session.add(retry_attempt)
        session.flush()
        return existing, retry_attempt, False

    cart = active_cart_for_update(session, user_id)
    lines, subtotal, methods = _cart_lines_and_total(cart)
    if not methods["online"]:
        raise PermissionError("Online payment is not available for every item in your cart")

    retry_order = session.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items), selectinload(CommerceOrder.payment_attempts))
        .where(
            CommerceOrder.user_id == user_id,
            CommerceOrder.payment_method == "razorpay",
            CommerceOrder.status == "payment_failed",
        )
        .order_by(CommerceOrder.created_at.desc())
        .with_for_update()
    )
    if retry_order and _order_items_match_cart(retry_order, cart):
        order = retry_order
        order.status = "pending_payment"
        order.payment_status = "pending"
        order.delivery_address = address
        order.idempotency_key = idempotency_key
    else:
        order = CommerceOrder(
            order_number=f"FK-{utcnow_naive():%Y%m%d}-{uuid4().hex[:8].upper()}",
            user_id=user_id,
            status="pending_payment",
            subtotal=subtotal,
            total_amount=subtotal,
            currency="INR",
            payment_method="razorpay",
            payment_status="pending",
            delivery_address=address,
            idempotency_key=idempotency_key,
        )
        session.add(order)
        session.flush()
        for line, variant, product, price, _ in lines:
            order.items.append(CommerceOrderItem(
                variant_id=variant.id,
                product_name=product.name,
                variant_name=variant.name,
                sku=variant.sku,
                quantity=line.quantity,
                unit_price=price,
            ))
    _reserve_lines(session, lines)
    attempt_key = f"{user_id}:{idempotency_key}"
    attempt = PaymentAttempt(
        order=order,
        provider="razorpay",
        status="created",
        amount=subtotal,
        currency="INR",
        idempotency_key=attempt_key,
        expires_at=utcnow_naive() + timedelta(minutes=15),
    )
    session.add(attempt)
    session.flush()
    return order, attempt, False


def create_cod_order(session: Session, *, user_id: int, idempotency_key: str, address: dict):
    existing = session.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items))
        .where(CommerceOrder.user_id == user_id, CommerceOrder.idempotency_key == idempotency_key)
    )
    if existing:
        return existing, True
    cart = active_cart_for_update(session, user_id)
    lines, subtotal, methods = _cart_lines_and_total(cart)
    if not methods["cod"]:
        raise PermissionError("Cash on Delivery is not available for every item in your cart")
    _reserve_lines(session, lines)
    order = CommerceOrder(
        order_number=f"FK-{utcnow_naive():%Y%m%d}-{uuid4().hex[:8].upper()}",
        user_id=user_id,
        status="placed",
        subtotal=subtotal,
        total_amount=subtotal,
        currency="INR",
        payment_method="cod",
        payment_status="pending",
        delivery_address=address,
        idempotency_key=idempotency_key,
        placed_at=utcnow_naive(),
    )
    session.add(order)
    session.flush()
    for line, variant, product, price, _ in lines:
        order.items.append(CommerceOrderItem(
            variant_id=variant.id,
            product_name=product.name,
            variant_name=variant.name,
            sku=variant.sku,
            quantity=line.quantity,
            unit_price=price,
        ))
    cart.items.clear()
    session.flush()
    return order, False


def serialize_order(order):
    items = []
    for item in order.items:
        price = money(item.unit_price)
        items.append({
            "product_name": item.product_name,
            "variant_name": item.variant_name,
            "sku": item.sku,
            "quantity": item.quantity,
            "unit_price": str(price),
            "line_total": str(price * item.quantity),
        })
    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "subtotal": str(money(order.subtotal or 0)),
        "total_amount": str(money(order.total_amount or 0)),
        "currency": order.currency,
        "delivery_address": order.delivery_address,
        "items": items,
    }


def capture_order_inventory(session: Session, order: CommerceOrder):
    """Confirm that the checkout reservation remains allocated to this order.

    Fulfilment changes on-hand total stock in a later order lifecycle phase.
    """
    variant_ids = [item.variant_id for item in order.items]
    rows = session.scalars(
        select(Inventory).where(Inventory.variant_id.in_(variant_ids)).order_by(Inventory.variant_id).with_for_update()
    ).all()
    by_variant = {row.variant_id: row for row in rows}
    for item in order.items:
        inventory = by_variant.get(item.variant_id)
        if inventory is None or inventory.reserved_stock < item.quantity:
            raise ValueError("Order inventory reservation is no longer available")


def fail_attempt(session: Session, attempt: PaymentAttempt, reason: str, *, state="failed"):
    if attempt.status in {"failed", "cancelled", "expired"}:
        return False
    if attempt.status == "captured":
        return False
    order = session.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items))
        .where(CommerceOrder.id == attempt.order_id)
        .with_for_update()
    )
    attempt.status = state
    attempt.failure_reason = reason[:500]
    attempt.order.status = "payment_failed"
    attempt.order.payment_status = "failed"
    _release_order_reservation(session, order)
    return True


def confirm_attempt(session: Session, attempt: PaymentAttempt, payment_id: str):
    if attempt.status == "captured":
        return attempt.order
    order = session.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items))
        .where(CommerceOrder.id == attempt.order_id)
        .with_for_update()
    )
    capture_order_inventory(session, order)
    now = utcnow_naive()
    attempt.status = "captured"
    attempt.provider_payment_id = payment_id
    attempt.paid_at = now
    order.payment_status = "captured"
    order.status = "placed"
    order.paid_at = now
    order.placed_at = now
    cart = session.scalar(
        select(Cart).where(Cart.user_id == order.user_id, Cart.status == "active").with_for_update()
    )
    if cart:
        ordered = {(item.variant_id, item.quantity) for item in order.items}
        for line in list(cart.items):
            if (line.variant_id, line.quantity) in ordered:
                session.delete(line)
    return order
