from fastapi import APIRouter, Depends

from Database.models import User
from auth.dependencies import (
    get_current_user,
    require_role
)


router = APIRouter(
    prefix="/api/v1/test",
    tags=["RBAC Test"]
)


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user)
):

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }


@router.get("/admin")
def admin_test(
    current_user: User = Depends(
        require_role("admin")
    )
):

    return {
        "message": "Admin access granted",
        "user": current_user.email,
        "role": current_user.role
    }