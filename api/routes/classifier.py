from fastapi import APIRouter
from pydantic import BaseModel

from backend.predictor import predict_department

router = APIRouter(
    prefix="/classifier",
    tags=["Classifier"]
)

class ComplainRequest(BaseModel):
    complaint: str


@router.post("/predict")
def predict(request: ComplainRequest):

    department, confidence = predict_department(
        request.complaint
    )

    return{
        "department": department,
        "confidence": confidence
    }

