import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.Database.models import User
from backend.Database.schemas import userCreate, UserResponse, LoginRequest
from backend.auth.dependencies import get_db, get_current_user
from backend.auth.security import hash_password, verify_password, create_access_token
from backend.login_lockout import (
    prepare_login,
    record_failed_login,
    record_successful_login,
)
from backend.security_config import login_lockout_enabled


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)

DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


@router.post("/register", response_model=UserResponse)
def register(user: userCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="email already registered"
        )

    new_user = User(
        name=user.name,
        email=user.email,
        password=hash_password(user.password),
        role="user"
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login")
def login(
    user: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    normalized_email = str(user.email).strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    use_persistent_lockout = login_lockout_enabled()

    if use_persistent_lockout:
        retry_after = prepare_login(db, normalized_email, client_ip)
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"Retry-After": str(retry_after)},
            )

    existing_user = db.query(User).filter(
        func.lower(User.email) == normalized_email
    ).first()

    password_valid = verify_password(
        user.password,
        existing_user.password if existing_user else DUMMY_PASSWORD_HASH,
    )

    if not existing_user or not password_valid:
        if use_persistent_lockout:
            record_failed_login(db, normalized_email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if use_persistent_lockout:
        record_successful_login(db, normalized_email)

    token = create_access_token(
        existing_user.id,
        existing_user.role
    )

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.get("/me")
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }
