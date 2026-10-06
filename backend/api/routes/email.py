from fastapi import APIRouter
from pydantic import BaseModel

from backend.router import get_department_email


router = APIRouter(
    prefix="/api/v1",
    tags=["Email"]
)

class DepartmentRequest(BaseModel):
    department: str



@router.post("/department-email")
def department_email(request: DepartmentRequest):

    email = get_department_email(
        request.department
    )

    if email is None:
        return {
            "success": False,
            "department": request.department,
            "email": None
        }

    return {
        "success": True,
        "department": request.department,
        "email": email
    }