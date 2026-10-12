from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.Database.models import Department, User, Complaint, ComplaintRedirection
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
