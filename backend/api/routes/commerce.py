"""Authenticated cart, checkout, and Razorpay Test Mode endpoints."""

import hashlib
import hmac
import json
import os
import re

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.Database.checkout_services import (
    active_cart_for_update,
    amount_in_paise,
    confirm_attempt,
    create_cod_order,
    create_online_order,
    expire_pending_attempts,
    fail_attempt,
    money,
    serialize_cart,
    serialize_order,
    checkout_source,
    utcnow_naive,
)
from backend.Database.models import CommerceOrder, PaymentAttempt, ShipmentOption, UserAddress
from backend.Database.services import (
    add_cart_item,
    get_order,
    get_cart,
    list_orders,
    remove_cart_item,
    update_cart_item_quantity,
)
from backend.auth.dependencies import get_current_user, get_db


router = APIRouter(tags=["Cart and Checkout"])


def _order_history_payload(order):
    result = serialize_order(order)
    result["created_at"] = order.created_at.isoformat() if order.created_at else None
    result["shipment"] = ({"status": order.shipment.status,
                           "tracking_reference": order.shipment.tracking_reference}
                          if order.shipment else None)
    for output, item in zip(result["items"], order.items):
        images = item.variant.product.images
        chosen = next((image for image in images if image.variant_id == item.variant_id), None)
        chosen = chosen or next((image for image in images if image.variant_id is None), None)
        output["image"] = chosen.storage_key if chosen else None
    return result


@router.get("/api/orders")
def get_customer_orders(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [_order_history_payload(order) for order in list_orders(db, user.id)]


@router.get("/api/orders/{order_id}")
def get_customer_order(order_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    order = get_order(db, user.id, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    return _order_history_payload(order)


class CartItemInput(BaseModel):
    product_id: int = Field(gt=0)
    variant_id: int = Field(gt=0)
    quantity: int = Field(default=1, gt=0, le=999)

    @field_validator("quantity", mode="before")
    @classmethod
    def quantity_is_integer(cls, value):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("quantity must be a positive integer")
        return value


class CartQuantityInput(BaseModel):
    quantity: int = Field(gt=0, le=999)

    @field_validator("quantity", mode="before")
    @classmethod
    def quantity_is_integer(cls, value):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("quantity must be a positive integer")
        return value


class DeliveryAddress(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    recipient_name: str = Field(min_length=1, max_length=120)
    mobile_number: str = Field(min_length=10, max_length=15)
    address_line1: str = Field(min_length=3, max_length=240)
    address_line2: str | None = Field(default=None, max_length=240)
    locality: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pin_code: str = Field(pattern=r"^\d{6}$")

    @field_validator("mobile_number")
    @classmethod
    def valid_mobile(cls, value):
        cleaned = re.sub(r"[\s+-]", "", value)
        if not cleaned.isdigit() or not 10 <= len(cleaned) <= 15:
            raise ValueError("Enter a valid mobile number")
        return cleaned


class CheckoutInput(BaseModel):
    address: DeliveryAddress | None = None
    address_id: int | None = Field(default=None, gt=0)
    online_method: str | None = Field(default=None, pattern=r"^(upi|netbanking)$")
    checkout_mode: str = Field(default="cart", pattern=r"^(cart|buy_now)$")
    variant_id: int | None = Field(default=None, gt=0)
    quantity: int | None = Field(default=None, gt=0, le=999)


class VerifyPaymentInput(BaseModel):
    razorpay_order_id: str = Field(min_length=5, max_length=80)
    razorpay_payment_id: str = Field(min_length=5, max_length=80)
    razorpay_signature: str = Field(min_length=32, max_length=128)


class PaymentAttemptInput(BaseModel):
    attempt_id: int = Field(gt=0)


def _test_credentials():
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if os.getenv("RAZORPAY_MODE", "test").strip().lower() != "test":
        raise HTTPException(503, "Razorpay must be configured in Test Mode")
    if not key_id.startswith("rzp_test_") or not key_secret:
        raise HTTPException(503, "Razorpay Test Mode credentials are not configured")
    return key_id, key_secret


def _razorpay_request(method: str, path: str, *, key_id: str, key_secret: str, payload=None):
    url = f"https://api.razorpay.com/v1/{path.lstrip('/')}"
    try:
        response = requests.request(
            method,
            url,
            auth=(key_id, key_secret),
            json=payload,
            timeout=(3.05, 15),
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise RuntimeError("Razorpay payment service is unavailable") from exc


def _http_for_value_error(exc):
    message = str(exc)
    if "empty" in message.lower():
        return HTTPException(409, message)
    return HTTPException(409, message)


def _get_attempt_for_user(db: Session, user_id: int, attempt_id: int):
    attempt = db.scalar(
        select(PaymentAttempt)
        .join(CommerceOrder, PaymentAttempt.order_id == CommerceOrder.id)
        .options(selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items))
        .where(PaymentAttempt.id == attempt_id, CommerceOrder.user_id == user_id)
        .with_for_update()
    )
    return attempt


def _expire_user_attempts(db: Session, user_id: int):
    now = utcnow_naive()
    pending = db.scalars(
        select(PaymentAttempt)
        .join(CommerceOrder, PaymentAttempt.order_id == CommerceOrder.id)
        .where(
            CommerceOrder.user_id == user_id,
            PaymentAttempt.status.in_(["created", "pending"]),
            PaymentAttempt.expires_at <= now,
        )
    ).all()
    releasable = set()
    try:
        key_id, key_secret = _test_credentials()
    except HTTPException:
        key_id = key_secret = None
    if key_id:
        for attempt in pending:
            if not attempt.provider_order_id:
                releasable.add(None)
                continue
            try:
                provider_order = _razorpay_request(
                    "GET", f"/orders/{attempt.provider_order_id}", key_id=key_id, key_secret=key_secret
                )
                payments = _razorpay_request(
                    "GET", f"/orders/{attempt.provider_order_id}/payments", key_id=key_id, key_secret=key_secret
                ).get("items", [])
            except RuntimeError:
                continue
            captured = next((payment for payment in payments if payment.get("status") == "captured"), None)
            if captured:
                if (
                    captured.get("amount") == amount_in_paise(attempt.amount)
                    and captured.get("currency") == "INR"
                    and captured.get("order_id") == attempt.provider_order_id
                ):
                    confirm_attempt(db, attempt, captured["id"])
                continue
            statuses = {payment.get("status") for payment in payments}
            if "authorized" in statuses or statuses & {"created", "pending"}:
                continue
            if statuses and statuses.issubset({"failed", "refunded"}):
                releasable.add(attempt.provider_order_id)
            elif not statuses and provider_order.get("status") == "created" and provider_order.get("attempts", 0) == 0:
                releasable.add(attempt.provider_order_id)
    expire_pending_attempts(db, now=now, safe_provider_order_ids=releasable)
    db.commit()


@router.get("/api/cart")
def get_customer_cart(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _expire_user_attempts(db, user.id)
    cart = get_cart(db, user.id)
    return serialize_cart(cart)


@router.post("/api/cart/items")
def add_customer_cart_item(payload: CartItemInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        from backend.Database.models import ProductVariant

        variant = db.scalar(
            select(ProductVariant).where(
                ProductVariant.id == payload.variant_id,
                ProductVariant.product_id == payload.product_id,
            )
        )
        if variant is None:
            raise HTTPException(404, "Product variant not found for this product")
        _expire_user_attempts(db, user.id)
        add_cart_item(db, user.id, payload.variant_id, payload.quantity)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except LookupError as exc:
        db.rollback()
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise _http_for_value_error(exc) from exc
    return serialize_cart(get_cart(db, user.id))


@router.put("/api/cart/items/{variant_id}")
def set_customer_cart_quantity(variant_id: int, payload: CartQuantityInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        _expire_user_attempts(db, user.id)
        update_cart_item_quantity(db, user.id, variant_id, payload.quantity)
        db.commit()
    except LookupError as exc:
        db.rollback()
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return serialize_cart(get_cart(db, user.id))


@router.delete("/api/cart/items/{variant_id}")
def delete_customer_cart_item(variant_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not remove_cart_item(db, user.id, variant_id):
        raise HTTPException(404, "Cart item not found")
    db.commit()
    return serialize_cart(get_cart(db, user.id))


@router.get("/api/checkout/summary")
def checkout_summary(variant_id: int | None = None, quantity: int | None = None,
                     db: Session = Depends(get_db), user=Depends(get_current_user)):
    _expire_user_attempts(db, user.id)
    if (variant_id is None) != (quantity is None):
        raise HTTPException(422, "Both variant_id and quantity are required for Buy Now")
    try:
        source = checkout_source(db, user.id, "buy_now" if variant_id is not None else "cart", variant_id, quantity)
        return serialize_cart(source)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


def _idempotency_key(value: str | None):
    value = (value or "").strip()
    if not 8 <= len(value) <= 100 or not re.fullmatch(r"[A-Za-z0-9._:-]+", value):
        raise HTTPException(400, "A valid Idempotency-Key header is required")
    return value


def _checkout_address(payload: CheckoutInput, db: Session, user_id: int):
    if payload.address_id is not None:
        saved = db.scalar(select(UserAddress).where(UserAddress.id == payload.address_id, UserAddress.user_id == user_id))
        if saved is None:
            raise HTTPException(404, "Saved delivery address not found")
        address = {key: getattr(saved, key) for key in (
            "recipient_name", "mobile_number", "address_line1", "address_line2", "locality", "city", "state", "pin_code"
        )}
    elif payload.address is not None:
        address = payload.address.model_dump()
    else:
        raise HTTPException(422, "Provide a saved address or delivery address details")
    serviceable = db.scalar(select(ShipmentOption.id).where(
        ShipmentOption.pin_code == address["pin_code"], ShipmentOption.is_active.is_(True)
    ).limit(1))
    if serviceable is None:
        raise HTTPException(409, "Delivery is unavailable at the selected PIN code")
    return address


@router.post("/api/checkout/cod")
def place_cod_order(
    payload: CheckoutInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    key = _idempotency_key(idempotency_key)
    try:
        _expire_user_attempts(db, user.id)
        address = _checkout_address(payload, db, user.id)
        order, duplicate = create_cod_order(
            db, user_id=user.id, idempotency_key=key, address=address,
            checkout_mode=payload.checkout_mode, variant_id=payload.variant_id, quantity=payload.quantity,
        )
        db.commit()
    except PermissionError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise _http_for_value_error(exc) from exc
    except IntegrityError:
        db.rollback()
        order = db.scalar(
            select(CommerceOrder).options(selectinload(CommerceOrder.items)).where(
                CommerceOrder.user_id == user.id,
                CommerceOrder.idempotency_key == key,
            )
        )
        if order is None:
            raise HTTPException(409, "Checkout is already being processed")
        duplicate = True
    return {"order": serialize_order(order), "duplicate": duplicate}


@router.post("/api/checkout/razorpay")
def create_razorpay_checkout(
    payload: CheckoutInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    key = _idempotency_key(idempotency_key)
    key_id, key_secret = _test_credentials()
    try:
        _expire_user_attempts(db, user.id)
        order, attempt, duplicate = create_online_order(
            db,
            user_id=user.id,
            idempotency_key=key,
            address=_checkout_address(payload, db, user.id),
            online_method=payload.online_method or "upi",
            checkout_mode=payload.checkout_mode,
            variant_id=payload.variant_id,
            quantity=payload.quantity,
        )
    except PermissionError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise _http_for_value_error(exc) from exc
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(CommerceOrder)
            .options(selectinload(CommerceOrder.items), selectinload(CommerceOrder.payment_attempts))
            .where(CommerceOrder.user_id == user.id, CommerceOrder.idempotency_key == key)
        )
        if existing is None:
            raise HTTPException(409, "Checkout is already being processed") from exc
        order = existing
        attempt = max(existing.payment_attempts, key=lambda item: item.id, default=None)
        duplicate = True
    if attempt is None:
        raise HTTPException(409, "Payment attempt is unavailable")
    if attempt.status == "captured":
        db.commit()
        return {"completed": True, "order": serialize_order(order), "duplicate": True}
    if attempt.provider_order_id:
        db.commit()
        return {
            "razorpay_order_id": attempt.provider_order_id,
            "amount": amount_in_paise(attempt.amount),
            "currency": attempt.currency,
            "key_id": key_id,
            "local_order_reference": order.order_number,
            "order_id": order.id,
            "attempt_id": attempt.id,
            "duplicate": True,
        }
    try:
        provider_order = _razorpay_request(
            "POST",
            "/orders",
            key_id=key_id,
            key_secret=key_secret,
            payload={
                "amount": amount_in_paise(attempt.amount),
                "currency": "INR",
                "receipt": f"{order.order_number[:30]}-{attempt.id}"[:40],
                "notes": {"flatkart_order_id": str(order.id), "attempt_id": str(attempt.id)},
            },
        )
    except RuntimeError as exc:
        fail_attempt(db, attempt, str(exc))
        db.commit()
        raise HTTPException(502, str(exc)) from exc
    if (
        provider_order.get("currency") != "INR"
        or provider_order.get("amount") != amount_in_paise(attempt.amount)
        or not provider_order.get("id")
    ):
        fail_attempt(db, attempt, "Razorpay returned an unexpected order amount or currency")
        db.commit()
        raise HTTPException(502, "Razorpay returned an invalid payment order")
    attempt.provider_order_id = provider_order["id"]
    attempt.status = "pending"
    db.commit()
    return {
        "razorpay_order_id": provider_order["id"],
        "amount": provider_order["amount"],
        "currency": provider_order["currency"],
        "key_id": key_id,
        "local_order_reference": order.order_number,
        "order_id": order.id,
        "attempt_id": attempt.id,
        "duplicate": duplicate,
    }


@router.post("/api/payments/verify")
def verify_razorpay_payment(payload: VerifyPaymentInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    key_id, key_secret = _test_credentials()
    attempt = _get_attempt_for_user(db, user.id, _attempt_id_from_order(db, user.id, payload.razorpay_order_id))
    if attempt is None or attempt.provider_order_id != payload.razorpay_order_id:
        raise HTTPException(404, "Payment order not found")
    expected = hmac.new(
        key_secret.encode("utf-8"),
        f"{attempt.provider_order_id}|{payload.razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, payload.razorpay_signature):
        raise HTTPException(400, "Payment verification failed")
    if attempt.status == "captured":
        return {"success": True, "order": serialize_order(attempt.order), "duplicate": True}
    try:
        provider_payment = _razorpay_request(
            "GET",
            f"/payments/{payload.razorpay_payment_id}",
            key_id=key_id,
            key_secret=key_secret,
        )
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    if (
        provider_payment.get("order_id") != attempt.provider_order_id
        or provider_payment.get("amount") != amount_in_paise(attempt.amount)
        or provider_payment.get("currency") != "INR"
        or provider_payment.get("status") != "captured"
    ):
        raise HTTPException(409, "Razorpay has not confirmed a captured payment for this order")
    if attempt.status in {"failed", "cancelled", "expired"}:
        raise HTTPException(409, "This payment attempt has expired; please start checkout again")
    try:
        order = confirm_attempt(db, attempt, payload.razorpay_payment_id)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"success": True, "order": serialize_order(order), "duplicate": False}


def _attempt_id_from_order(db: Session, user_id: int, provider_order_id: str):
    attempt = db.scalar(
        select(PaymentAttempt.id)
        .join(CommerceOrder, PaymentAttempt.order_id == CommerceOrder.id)
        .where(CommerceOrder.user_id == user_id, PaymentAttempt.provider_order_id == provider_order_id)
    )
    return attempt or -1


@router.post("/api/payments/cancel")
def cancel_razorpay_attempt(payload: PaymentAttemptInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    key_id, key_secret = _test_credentials()
    attempt = _get_attempt_for_user(db, user.id, payload.attempt_id)
    if attempt is None:
        raise HTTPException(404, "Payment attempt not found")
    if attempt.status in {"failed", "cancelled", "expired", "captured"}:
        return {"status": attempt.status}
    try:
        provider_order = _razorpay_request("GET", f"/orders/{attempt.provider_order_id}", key_id=key_id, key_secret=key_secret)
        payments = _razorpay_request("GET", f"/orders/{attempt.provider_order_id}/payments", key_id=key_id, key_secret=key_secret)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    if provider_order.get("amount") != amount_in_paise(attempt.amount) or provider_order.get("currency") != "INR":
        raise HTTPException(409, "Razorpay order does not match this checkout")
    states = {row.get("status") for row in payments.get("items", [])}
    if states & {"captured", "authorized"}:
        raise HTTPException(409, "Razorpay is still processing this payment")
    fail_attempt(db, attempt, "Checkout dismissed by customer", state="cancelled")
    db.commit()
    return {"status": "cancelled"}


@router.post("/api/payments/razorpay/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        _test_credentials()
    except HTTPException as exc:
        raise HTTPException(503, "Razorpay webhook is restricted to configured Test Mode") from exc
    webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
    if not webhook_secret:
        raise HTTPException(503, "Razorpay webhook is not configured")
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    expected = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid webhook signature")
    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(400, "Invalid webhook body") from exc
    event_type = event.get("event")
    if event_type not in {"payment.captured", "payment.failed", "order.paid"}:
        return Response(status_code=204)
    event_id = request.headers.get("x-razorpay-event-id") or hashlib.sha256(raw_body).hexdigest()
    from backend.Database.models import PaymentWebhookEvent

    if db.scalar(select(PaymentWebhookEvent.id).where(PaymentWebhookEvent.event_id == event_id)):
        return {"status": "duplicate"}
    db.add(PaymentWebhookEvent(event_id=event_id, event_type=event_type))
    payload = event.get("payload", {})
    payment_entity = (payload.get("payment") or {}).get("entity") or {}
    order_entity = (payload.get("order") or {}).get("entity") or {}
    provider_order_id = payment_entity.get("order_id") or order_entity.get("id")
    attempt = db.scalar(
        select(PaymentAttempt)
        .options(selectinload(PaymentAttempt.order).selectinload(CommerceOrder.items))
        .where(PaymentAttempt.provider_order_id == provider_order_id)
        .with_for_update()
    )
    if attempt is None:
        db.commit()
        return {"status": "ignored"}
    if event_type in {"payment.captured", "order.paid"}:
        if event_type == "order.paid" and not payment_entity:
            try:
                key_id, key_secret = _test_credentials()
                payment_list = _razorpay_request(
                    "GET",
                    f"/orders/{attempt.provider_order_id}/payments",
                    key_id=key_id,
                    key_secret=key_secret,
                )
            except (HTTPException, RuntimeError) as exc:
                db.rollback()
                raise HTTPException(503, "Could not confirm the Razorpay order payment") from exc
            payment_entity = next(
                (row for row in payment_list.get("items", []) if row.get("status") == "captured"),
                {},
            )
        amount = payment_entity.get("amount")
        currency = payment_entity.get("currency")
        if event_type == "order.paid" and amount is None:
            amount = order_entity.get("amount_paid") or order_entity.get("amount")
            currency = order_entity.get("currency")
        payment_id = payment_entity.get("id") or attempt.provider_payment_id
        if (
            amount != amount_in_paise(attempt.amount)
            or currency != "INR"
            or payment_entity.get("order_id") != attempt.provider_order_id
            or (payment_entity and payment_entity.get("status") != "captured")
            or not payment_id
        ):
            db.rollback()
            raise HTTPException(400, "Webhook payment does not match the pending order")
        try:
            confirm_attempt(db, attempt, payment_id)
        except ValueError as exc:
            db.rollback()
            raise HTTPException(409, str(exc)) from exc
    elif event_type == "payment.failed":
        if payment_entity.get("amount") != amount_in_paise(attempt.amount) or payment_entity.get("currency") != "INR":
            db.rollback()
            raise HTTPException(400, "Webhook payment does not match the pending order")
        fail_attempt(db, attempt, payment_entity.get("error_description") or "Razorpay payment failed")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicate"}
    return {"status": "ok"}
