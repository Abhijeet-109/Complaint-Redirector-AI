from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.Database.models import Department
from backend.Database.schemas import (
    DepartmentCreate,
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
