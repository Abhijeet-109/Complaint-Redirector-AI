from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.Database.models import User
from backend.Database.schemas import userCreate,UserResponse, LoginRequest
from backend.auth.dependencies import get_db


from backend.auth.security import ( hash_password, verify_password, create_access_token)



router = APIRouter(
    prefix = "/api/auth",
    tags = ["Authentication"]
)


@router.post("/register", response_model=UserResponse)

def register( user: userCreate, db: Session = Depends(get_db)):

    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code = 400,
            detail = 'email already registered'
        )

    new_user = User(
        name = user.name,
        email = user.email,
        password = hash_password(user.password),
        role = "user"
    )


    db.add(new_user)

    db.commit()

    db.refresh(new_user)

    return new_user


@router.post("/login")
def login(
    user: LoginRequest,
    db :Session = Depends (get_db)

):

    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()


    if not existing_user:
        raise HTTPException (
            status_code = 401,
            detail = "Invalid email or password"
        )

    if not verify_password(
        user.password,
        existing_user.password
    ):

        raise HTTPException(
            status_code = 401,
            detail = "Invalid email or password"

        )

    token = create_access_token (
        existing_user.id,
        existing_user.role
    )

    return{
        "access_token" : token,
        "token_type" : "bearer"
    }

