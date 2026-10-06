from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from Database.connection import SessionLocal
from Database.models import User
from auth.security import decode_access_token


security = HTTPBearer()


def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):

    token = credentials.credentials

    try:

        payload = decode_access_token(token)

        user_id = payload.get("user_id")

        if user_id is None:

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

    except Exception:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


    user = db.query(User).filter(
        User.id == user_id
    ).first()


    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )


    return user


def require_role(*allowed_roles):

    def role_checker(
        current_user: User = Depends(get_current_user)
    ):

        if current_user.role not in allowed_roles:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource"
            )

        return current_user

    return role_checker