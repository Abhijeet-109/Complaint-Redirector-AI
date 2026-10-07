from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.Database.models import User, Department
from backend.Database.schemas import (
    AdminUserCreate,
    AdminUserUpdate,
    UserResponse
)
from backend.auth.dependencies import get_db, require_role
from backend.auth.security import hash_password


router = APIRouter(
    prefix="/api/admin/users",
    tags=["Admin Account Management"],
)


MANAGED_ROLES = (
    "user",
    "department_handler"
)


def ensure_account_access(actor: User, target: User) -> None:

    if target.role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The super_admin account is protected"
        )

    if actor.role == "admin" and target.role not in MANAGED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins can manage only user and department_handler accounts"
        )


def ensure_creation_access(actor: User, role: str) -> None:

    if role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Creating a super_admin account is not allowed"
        )

    if actor.role == "admin" and role not in MANAGED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins can create only user and department_handler accounts"
        )


def validate_department(
    db: Session,
    role: str,
    department_id: int | None
) -> None:

    if role == "department_handler":

        if department_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="department_id is required for department_handler"
            )

        department = db.query(Department).filter(
            Department.id == department_id
        ).first()

        if department is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found"
            )

    else:

        if department_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only department_handler can have a department"
            )


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
def create_user(
    user_data: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("admin", "super_admin")
    )
):

    ensure_creation_access(
        current_user,
        user_data.role
    )

    validate_department(
        db,
        user_data.role,
        user_data.department_id
    )

    if db.query(User).filter(
        User.email == user_data.email
    ).first():

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password=hash_password(user_data.password),
        role=user_data.role,
        department_id=user_data.department_id
    )

    db.add(new_user)

    try:

        db.commit()

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    db.refresh(new_user)

    return new_user


@router.get(
    "",
    response_model=list[UserResponse]
)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("admin", "super_admin")
    )
):

    query = db.query(User)

    if current_user.role == "admin":

        query = query.filter(
            User.role.in_(MANAGED_ROLES)
        )

    return query.order_by(User.id).all()


@router.get(
    "/{user_id}",
    response_model=UserResponse
)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("admin", "super_admin")
    )
):

    target = db.query(User).filter(
        User.id == user_id
    ).first()

    if target is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    ensure_account_access(
        current_user,
        target
    )

    return target


@router.put(
    "/{user_id}",
    response_model=UserResponse
)
def update_user(
    user_id: int,
    user_data: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("admin", "super_admin")
    )
):

    target = db.query(User).filter(
        User.id == user_id
    ).first()

    if target is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    ensure_account_access(
        current_user,
        target
    )

    updates = user_data.model_dump(
        exclude_unset=True
    )

    if not updates:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account fields provided"
        )

    if any(value is None for value in updates.values()):

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Account fields cannot be null"
        )

    new_role = updates.get(
        "role",
        target.role
    )

    new_department_id = updates.get(
        "department_id",
        target.department_id
    )

    ensure_creation_access(
        current_user,
        new_role
    )

    validate_department(
        db,
        new_role,
        new_department_id
    )

    if new_role != "department_handler":

        updates["department_id"] = None

    if "email" in updates:

        existing_email = db.query(User).filter(
            User.email == updates["email"],
            User.id != target.id
        ).first()

        if existing_email:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )

    if "password" in updates:

        updates["password"] = hash_password(
            updates["password"]
        )

    for field, value in updates.items():

        setattr(
            target,
            field,
            value
        )

    try:

        db.commit()

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    db.refresh(target)

    return target


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("admin", "super_admin")
    )
):

    target = db.query(User).filter(
        User.id == user_id
    ).first()

    if target is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    ensure_account_access(
        current_user,
        target
    )

    db.delete(target)

    db.commit()