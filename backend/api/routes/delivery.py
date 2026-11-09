"""Database-backed delivery availability and admin shipment options."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.Database.models import ShipmentOption
from backend.auth.dependencies import get_db, require_role


router = APIRouter(tags=["Delivery Serviceability"])
admin_access = require_role("admin", "super_admin")


class ShipmentOptionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    pin_code: str = Field(pattern=r"^\d{6}$")
    area: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    is_active: bool = True


def _serialize(row):
    return {"id": row.id, "pin_code": row.pin_code, "area": row.area,
            "city": row.city, "state": row.state, "is_active": row.is_active}


@router.get("/api/delivery/check")
def check_delivery(pincode: str = Query(pattern=r"^\d{6}$"), db: Session = Depends(get_db)):
    row = db.scalar(select(ShipmentOption).where(
        ShipmentOption.pin_code == pincode, ShipmentOption.is_active.is_(True)
    ).order_by(ShipmentOption.area))
    if row is None:
        return {"deliverable": False, "pincode": pincode}
    return {"deliverable": True, "pincode": pincode, "area": row.area,
            "city": row.city, "state": row.state}


@router.get("/api/admin/shipment-options")
def list_shipment_options(search: str | None = None, db: Session = Depends(get_db),
                          _actor=Depends(admin_access)):
    query = select(ShipmentOption).order_by(ShipmentOption.pin_code, ShipmentOption.area)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(or_(ShipmentOption.pin_code.ilike(term), ShipmentOption.area.ilike(term),
                                ShipmentOption.city.ilike(term), ShipmentOption.state.ilike(term)))
    return [_serialize(row) for row in db.scalars(query).all()]


@router.post("/api/admin/shipment-options", status_code=status.HTTP_201_CREATED)
def create_shipment_option(payload: ShipmentOptionInput, db: Session = Depends(get_db),
                           _actor=Depends(admin_access)):
    row = ShipmentOption(**payload.model_dump())
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An entry for this PIN code and area already exists") from exc
    return _serialize(row)


@router.put("/api/admin/shipment-options/{option_id}")
def update_shipment_option(option_id: int, payload: ShipmentOptionInput,
                           db: Session = Depends(get_db), _actor=Depends(admin_access)):
    row = db.get(ShipmentOption, option_id)
    if row is None:
        raise HTTPException(404, "Shipment option not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An entry for this PIN code and area already exists") from exc
    return _serialize(row)


@router.delete("/api/admin/shipment-options/{option_id}")
def deactivate_shipment_option(option_id: int, db: Session = Depends(get_db),
                               _actor=Depends(admin_access)):
    row = db.get(ShipmentOption, option_id)
    if row is None:
        raise HTTPException(404, "Shipment option not found")
    row.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
