"""Authenticated customer profile, address, wishlist, order and preference APIs."""

import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.Database.checkout_services import serialize_order
from backend.Database.models import (
    CommerceOrder, CommerceOrderItem, Product, User, UserAddress, WishlistItem,
    ReturnRequest,
)
from backend.Database.services import get_order, list_orders
from backend.Database.return_services import (
    claim_details, create_return_claim, evaluate_return_eligibility,
    get_return_claim, record_customer_response,
)
from backend.Database.models import ReturnEvidence, ReturnRequestEvent
from backend.Database.return_evidence_storage import (
    MAX_EVIDENCE_BYTES, delete_evidence, save_evidence,
)
from backend.auth.dependencies import get_current_user, get_db
from backend.auth.security import hash_password, verify_password
from typing import Literal


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

class ReturnClaimCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    order_id: int = Field(gt=0)
    order_item_id: int = Field(gt=0)
    quantity: int = Field(gt=0)

    resolution_type: Literal["refund", "replacement"]
    refund_timing: Literal["immediate", "after_collection"] | None = None
    reason_code: str = Field(min_length=1, max_length=40)
    description: str | None = Field(default=None, max_length=2000)


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


def _order_payload(order, return_claims=None):
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
    claims_by_item = {}
    for claim in (return_claims or []):
        claims_by_item.setdefault(claim.order_item_id, []).append({
            "id": claim.id,
            "order_item_id": claim.order_item_id,
            "quantity": claim.quantity,
            "resolution_type": claim.resolution_type,
            "reason_code": claim.reason_code,
            "status": claim.status,
            "workflow_status": claim.workflow_status,
            "requested_at": claim.requested_at.isoformat() if claim.requested_at else None,
        })
    for output, item in zip(result["items"], order.items):
        images = item.variant.product.images
        chosen = next((image for image in images if image.variant_id == item.variant_id), None)
        chosen = chosen or next((image for image in images if image.variant_id is None), None)
        output["image"] = chosen.storage_key if chosen else None
        output["return_claims"] = claims_by_item.get(item.id, [])
    return result


@router.get("/orders")
def customer_orders(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [_order_payload(order) for order in list_orders(db, user.id)]


@router.get("/orders/{order_id}")
def customer_order(order_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    order = get_order(db, user.id, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    claims = db.scalars(
        select(ReturnRequest).where(ReturnRequest.order_id == order.id).order_by(ReturnRequest.requested_at.desc(), ReturnRequest.id.desc())
    ).all()
    return _order_payload(order, claims)


@router.get("/orders/{order_id}/items/{order_item_id}/return-eligibility")
def customer_return_eligibility(
    order_id: int,
    order_item_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    order = db.scalar(select(CommerceOrder).where(
        CommerceOrder.id == order_id,
        CommerceOrder.user_id == user.id,
    ))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    item_exists = db.scalar(select(CommerceOrderItem.id).where(
        CommerceOrderItem.id == order_item_id,
        CommerceOrderItem.order_id == order.id,
    ))
    if item_exists is None:
        raise HTTPException(status_code=404, detail="Order item not found.")
    try:
        eligibility = evaluate_return_eligibility(
            db,
            order=order,
            order_item_id=order_item_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        key: eligibility[key]
        for key in (
            "order_id", "order_item_id", "eligible", "reason_code", "message",
            "delivered_at", "return_deadline", "return_window_days",
            "quantity_purchased", "quantity_already_claimed", "quantity_available",
            "active_claim", "available_resolutions",
        )
    }

@router.post("/returns", status_code=status.HTTP_201_CREATED)
def submit_return_claim(
    payload: ReturnClaimCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        claim = create_return_claim(
            db,
            user_id=user.id,
            order_id=payload.order_id,
            order_item_id=payload.order_item_id,
            quantity=payload.quantity,
            resolution_type=payload.resolution_type,
            refund_timing=payload.refund_timing,
            reason_code=payload.reason_code,
            description=payload.description,
        )

        db.commit()
        db.refresh(claim)

    except LookupError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The return request conflicts with existing data.",
        ) from exc

    return {
        "message": "Return request submitted successfully.",
        "return_request": {
            "id": claim.id,
            "order_id": claim.order_id,
            "order_item_id": claim.order_item_id,
            "quantity": claim.quantity,
            "resolution_type": claim.resolution_type,
            "refund_timing": claim.refund_timing,
            "reason_code": claim.reason_code,
            "description": claim.description,
            "status": claim.status,
            "workflow_status": claim.workflow_status,
            "requested_at": (
                claim.requested_at.isoformat()
                if claim.requested_at
                else None
            ),
        },
    }


def _owned_return_claim(db: Session, claim_id: int, user_id: int):
    claim = get_return_claim(db, claim_id)
    if claim is None or claim.order is None or claim.order.user_id != user_id:
        raise HTTPException(status_code=404, detail="Return claim not found.")
    return claim


@router.get("/returns/{claim_id}")
def customer_return_claim(claim_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    claim = _owned_return_claim(db, claim_id, user.id)
    return claim_details(db, claim)


def _save_claim_evidence(db: Session, claim_id: int, actor_id: int, files: list[UploadFile]):
    if not files or len(files) > 5:
        raise HTTPException(status_code=400, detail="Upload between 1 and 5 evidence images.")
    created = []
    try:
        for upload in files:
            data = upload.file.read(MAX_EVIDENCE_BYTES + 1)
            key, mime_type, digest = save_evidence(data, upload.filename or "", upload.content_type or "")
            row = ReturnEvidence(
                return_request_id=claim_id,
                storage_provider="local_private",
                storage_key=key,
                original_filename=(upload.filename or "evidence")[:255],
                mime_type=mime_type,
                size_bytes=len(data),
                sha256=digest,
                uploaded_by_id=actor_id,
                is_active=True,
            )
            db.add(row)
            created.append((row, key))
            db.flush()
            db.add(ReturnRequestEvent(
                return_request_id=claim_id,
                event_type="evidence_uploaded",
                actor_user_id=actor_id,
                event_data={"evidence_id": row.id, "content_type": mime_type, "size_bytes": len(data), "sha256": digest},
            ))
        return [row for row, _key in created]
    except Exception:
        for _row, key in created:
            delete_evidence(key)
        raise


@router.post("/returns/{claim_id}/evidence", status_code=status.HTTP_201_CREATED)
def upload_return_evidence(
    claim_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    claim = _owned_return_claim(db, claim_id, user.id)
    if claim.workflow_status in {"rejected", "completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Evidence cannot be added to a closed claim.")
    try:
        rows = _save_claim_evidence(db, claim.id, user.id, files)
        db.commit()
        return {"items": [{"id": row.id, "filename": row.original_filename,
                           "content_type": row.mime_type, "size_bytes": row.size_bytes,
                           "uploaded_at": row.uploaded_at.isoformat() if row.uploaded_at else None}
                          for row in rows]}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        for row in locals().get("rows", []):
            delete_evidence(row.storage_key)
        raise HTTPException(status_code=500, detail="Evidence could not be saved.") from exc


@router.get("/returns/{claim_id}/evidence/{evidence_id}")
def get_return_evidence(claim_id: int, evidence_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    claim = _owned_return_claim(db, claim_id, user.id)
    evidence = db.scalar(select(ReturnEvidence).where(
        ReturnEvidence.id == evidence_id,
        ReturnEvidence.return_request_id == claim.id,
        ReturnEvidence.is_active.is_(True),
    ))
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found.")
    from backend.Database.return_evidence_storage import read_evidence
    from fastapi.responses import FileResponse
    path = read_evidence(evidence.storage_key)
    if path is None:
        raise HTTPException(status_code=404, detail="Evidence file is unavailable.")
    return FileResponse(path, media_type=evidence.mime_type,
                        filename=evidence.original_filename,
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.post("/returns/{claim_id}/respond")
def respond_to_return_information(
    claim_id: int,
    message: str | None = Form(default=None, max_length=2000),
    files: list[UploadFile] | None = File(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    claim = _owned_return_claim(db, claim_id, user.id)
    if claim.workflow_status != "information_requested":
        raise HTTPException(status_code=409, detail="This claim is not waiting for customer information.")
    try:
        saved = _save_claim_evidence(db, claim.id, user.id, files or []) if files else []
        record_customer_response(db, claim.id, actor_id=user.id, message=message, has_evidence=bool(saved))
        db.commit()
        return {"workflow_status": claim.workflow_status,
                "evidence_ids": [row.id for row in saved]}
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        for row in locals().get("saved", []):
            delete_evidence(row.storage_key)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        for row in locals().get("saved", []):
            delete_evidence(row.storage_key)
        raise HTTPException(status_code=500, detail="Customer response could not be saved.") from exc

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
