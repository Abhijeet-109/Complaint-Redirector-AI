from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.predictor import predict_department
from backend.router import send_complaint_email

from sqlalchemy.orm import Session

from backend.Database.models import Complaint, Department, User
from backend.Database.schemas import (
    ComplaintCreate,
    ComplaintResponse,
    ComplaintHandlerResponse
)
from backend.auth.dependencies import (
    get_db,
    get_current_user,
    require_role
)

router = APIRouter(
    prefix="/api/v1",
    tags=["Complaint"]
)


class ComplaintProcessRequest(BaseModel):
    name: str
    email: str
    complaint: str


@router.post("/process-complaint")
def process_complaint(
    request: ComplaintProcessRequest
):
     department, confidence = predict_department(
        request.complaint
    )

     receiver = send_complaint_email(
        complaint=request.complaint,
        department=department,
        confidence=confidence
    )

     return {
        "success": True,
        "department": department,
        "confidence": confidence,
        "receiver": receiver
    }

@router.post(
    "/complaints",
    response_model=ComplaintResponse,
    status_code=status.HTTP_201_CREATED
)
def create_complaint(
    complaint_data: ComplaintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    department_name, confidence = predict_department(
        complaint_data.complaint_text
    )

    department = db.query(Department).filter(
        Department.name == department_name
    ).first()

    if department is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Predicted department not found in database"
        )

    complaint = Complaint(
        user_id=current_user.id,
        predicted_department_id=department.id,
        department_id=department.id,
        handler_id=None,
        complaint_text=complaint_data.complaint_text,
        confidence=str(confidence),
        status="pending"
    )

    db.add(complaint)
    db.commit()
    db.refresh(complaint)

    return complaint

@router.get(
    "/handler/complaints",
    response_model=list[ComplaintHandlerResponse]
)
def get_handler_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("department_handler")
    )
):

    if current_user.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department handler is not assigned to a department"
        )

    complaints = db.query(Complaint).filter(
        Complaint.department_id == current_user.department_id
    ).order_by(
        Complaint.id
    ).all()

    return complaints