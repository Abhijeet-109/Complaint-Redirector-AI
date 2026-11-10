"""Authenticated customer profile, address, wishlist, order and preference APIs."""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.Database.checkout_services import serialize_order
from backend.Database.models import (
    Product, User, UserAddress, WishlistItem,
)
from backend.Database.services import get_order, list_orders
from backend.auth.dependencies import get_current_user, get_db
from backend.auth.security import hash_password, verify_password


router = APIRouter(prefix="/api/account", tags=["Customer Account"])


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    mobile_number: str | None = Field(default=None, max_length=15)

    @field_validator("mobile_number")
    @classmethod
    def normalize_mobile(cls, value):
        if value is None or value == "":
            return None
        cleaned = re.sub(r"[\s+-]", "", value)
        if not cleaned.isdigit() or not 10 <= len(cleaned) <= 15:
            raise ValueError("Enter a valid mobile number")
        return cleaned


class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class AddressInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    recipient_name: str = Field(min_length=1, max_length=120)
    mobile_number: str = Field(min_length=10, max_length=15)
    address_line1: str = Field(min_length=3, max_length=240)
    address_line2: str | None = Field(default=None, max_length=240)
    locality: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pin_code: str = Field(pattern=r"^\d{6}$")
    label: str = Field(default="Home", pattern=r"^(Home|Work|Other)$")
    is_default: bool = False

    @field_validator("mobile_number")
    @classmethod
    def normalize_mobile(cls, value):
        cleaned = re.sub(r"[\s+-]", "", value)
        if not cleaned.isdigit() or not 10 <= len(cleaned) <= 15:
            raise ValueError("Enter a valid mobile number")
        return cleaned


class PaymentPreference(BaseModel):
    preferred_payment_method: str | None = Field(default=None, pattern=r"^(cod|upi|netbanking)$")


def _address_json(row: UserAddress):
    return {key: getattr(row, key) for key in (
        "id", "recipient_name", "mobile_number", "address_line1", "address_line2",
        "locality", "city", "state", "pin_code", "label", "is_default",
    )}


def _save_address(db: Session, user_id: int, values: dict, address_id: int | None = None):
    db.scalar(select(User.id).where(User.id == user_id).with_for_update())
    db.query(UserAddress).filter(UserAddress.user_id == user_id).with_for_update().all()
    row = db.get(UserAddress, address_id) if address_id is not None else None
    if address_id is not None and (row is None or row.user_id != user_id):
        raise HTTPException(404, "Address not found")
    make_default = values.pop("is_default", False)
    if row is None:
        count = db.scalar(select(UserAddress.id).where(UserAddress.user_id == user_id).limit(1))
        make_default = make_default or count is None
        row = UserAddress(user_id=user_id)
        db.add(row)
    if make_default:
        db.query(UserAddress).filter(UserAddress.user_id == user_id, UserAddress.is_default.is_(True)).update(
            {UserAddress.is_default: False}, synchronize_session=False
        )
    for key, value in values.items():
        setattr(row, key, value)
    row.is_default = bool(make_default) if make_default else (row.is_default if address_id is not None else False)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Address could not be saved") from exc
    return row


@router.get("/profile")
def get_profile(user=Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email,
            "mobile_number": user.mobile_number, "role": user.role}


@router.put("/profile")
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    user.name = payload.name
    user.mobile_number = payload.mobile_number
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email,
            "mobile_number": user.mobile_number, "role": user.role}


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def update_password(payload: PasswordUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not verify_password(payload.current_password, user.password):
        raise HTTPException(400, "Current password is incorrect")
    user.password = hash_password(payload.new_password)
    db.commit()
    return None


@router.get("/addresses")
def list_addresses(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.scalars(select(UserAddress).where(UserAddress.user_id == user.id)
                       .order_by(UserAddress.is_default.desc(), UserAddress.created_at.desc())).all()
    return [_address_json(row) for row in rows]


@router.post("/addresses", status_code=201)
def create_address(payload: AddressInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _address_json(_save_address(db, user.id, payload.model_dump()))


@router.put("/addresses/{address_id}")
def update_address(address_id: int, payload: AddressInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return _address_json(_save_address(db, user.id, payload.model_dump(), address_id))


@router.put("/addresses/{address_id}/default")
def set_default_address(address_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    row = db.scalar(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    if row is None:
        raise HTTPException(404, "Address not found")
    db.query(UserAddress).filter(UserAddress.user_id == user.id).update(
        {UserAddress.is_default: False}, synchronize_session=False
    )
    row.is_default = True
    db.commit()
    db.refresh(row)
    return _address_json(row)


@router.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    row = db.scalar(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    if row is None:
        raise HTTPException(404, "Address not found")
    was_default = row.is_default
    db.delete(row)
    db.flush()
    if was_default:
        replacement = db.scalar(select(UserAddress).where(UserAddress.user_id == user.id)
                                .order_by(UserAddress.created_at.desc()).limit(1))
        if replacement:
            replacement.is_default = True
    db.commit()
    return None


@router.get("/payment-preference")
def get_payment_preference(user=Depends(get_current_user)):
    return {"preferred_payment_method": user.preferred_payment_method}


@router.put("/payment-preference")
def set_payment_preference(payload: PaymentPreference, db: Session = Depends(get_db), user=Depends(get_current_user)):
    user.preferred_payment_method = payload.preferred_payment_method
    db.commit()
    return {"preferred_payment_method": user.preferred_payment_method}


def _order_payload(order):
    result = serialize_order(order)
    result["created_at"] = order.created_at.isoformat() if order.created_at else None
    if order.shipment:
        result["shipment"] = {
            "status": order.shipment.status,
            "carrier": order.shipment.carrier,
            "tracking_reference": order.shipment.tracking_reference,
            "tracking_url": order.shipment.tracking_url,
            "estimated_delivery_date": order.shipment.estimated_delivery_date.isoformat() if order.shipment.estimated_delivery_date else None,
            "shipped_at": order.shipment.shipped_at.isoformat() if order.shipment.shipped_at else None,
            "delivered_at": order.shipment.delivered_at.isoformat() if order.shipment.delivered_at else None,
            "events": [
                {
                    "id": event.id,
                    "previous_status": event.previous_status,
                    "new_status": event.new_status,
                    "note": event.note,
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                }
                for event in (order.shipment.events or [])
            ],
        }
    else:
        result["shipment"] = None
    for output, item in zip(result["items"], order.items):
        images = item.variant.product.images
        chosen = next((image for image in images if image.variant_id == item.variant_id), None)
        chosen = chosen or next((image for image in images if image.variant_id is None), None)
        output["image"] = chosen.storage_key if chosen else None
    return result


@router.get("/orders")
def customer_orders(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [_order_payload(order) for order in list_orders(db, user.id)]


@router.get("/orders/{order_id}")
def customer_order(order_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    order = get_order(db, user.id, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    return _order_payload(order)


@router.get("/wishlist")
def customer_wishlist(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.scalars(select(WishlistItem).options(
        selectinload(WishlistItem.product).selectinload(Product.images),
        selectinload(WishlistItem.product).selectinload(Product.variants),
    ).where(WishlistItem.user_id == user.id).order_by(WishlistItem.created_at.desc())).all()
    return [{"id": row.product.id, "wishlist_id": row.id, "name": row.product.name,
             "slug": row.product.slug, "brand": row.product.brand,
             "images": [{"url": image.storage_key, "alt_text": image.alt_text}
                        for image in row.product.images if image.variant_id is None],
             "variants": [{"id": variant.id, "name": variant.name, "price": str(variant.price)}
                          for variant in row.product.variants if variant.is_available]}
            for row in rows if row.product and row.product.is_active]


@router.post("/wishlist/{product_id}", status_code=201)
def add_wishlist_item(product_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    product = db.scalar(select(Product).where(Product.id == product_id, Product.is_active.is_(True)))
    if product is None:
        raise HTTPException(404, "Product not found")
    row = db.scalar(select(WishlistItem).where(WishlistItem.user_id == user.id,
                                               WishlistItem.product_id == product_id))
    if row is None:
        db.add(WishlistItem(user_id=user.id, product_id=product_id))
        db.commit()
    return {"product_id": product_id, "saved": True}


@router.delete("/wishlist/{product_id}", status_code=204)
def remove_wishlist_item(product_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = db.scalar(select(WishlistItem).where(WishlistItem.user_id == user.id,
                                               WishlistItem.product_id == product_id))
    if row:
        db.delete(row)
        db.commit()
    return None
