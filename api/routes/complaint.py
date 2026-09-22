from fastapi import APIRouter
from pydantic import BaseModel

from backend.predictor import predict_department
from backend.router import send_complaint_email


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
