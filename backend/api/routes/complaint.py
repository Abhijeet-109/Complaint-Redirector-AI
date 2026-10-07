from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.predictor import predict_department
from backend.router import send_complaint_email

from sqlalchemy.orm import Session

from backend.Database.models import Complaint, Department, User
from backend.Database.schemas import (
    ComplaintCreate,
    ComplaintDetailResponse,
    ComplaintRedirectResponse,
    ComplaintResponse,
    HandlerComplaintResponse,
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


class ComplaintStatusUpdate(BaseModel):
    status: str


class ComplaintRedirectRequest(BaseModel):
    department_id: int


def _complaint_details(db: Session, complaints: list[Complaint]):
    department_ids = {
        department_id
        for complaint in complaints
        for department_id in (
            complaint.predicted_department_id,
            complaint.department_id
        )
    }
    departments = {
        department.id: department.name
        for department in db.query(Department).filter(
            Department.id.in_(department_ids)
        ).all()
    } if department_ids else {}

    return [
        {
            "id": complaint.id,
            "complaint_text": complaint.complaint_text,
            "predicted_department_id": complaint.predicted_department_id,
            "predicted_department": departments.get(
                complaint.predicted_department_id, ""
            ),
            "department_id": complaint.department_id,
            "current_department": departments.get(
                complaint.department_id, ""
            ),
            "status": complaint.status,
            "confidence": complaint.confidence,
            "create_at": complaint.create_at,
        }
        for complaint in complaints
    ]


def _handler_complaint_details(db: Session, complaints: list[Complaint]):
    details = _complaint_details(db, complaints)
    user_ids = {complaint.user_id for complaint in complaints}
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    return [
        {
            **detail,
            "user_id": complaint.user_id,
            "user_name": users[complaint.user_id].name if complaint.user_id in users else None,
            "user_email": users[complaint.user_id].email if complaint.user_id in users else None,
        }
        for complaint, detail in zip(complaints, details)
    ]


def _handler_complaint(
    db: Session,
    complaint_id: int,
    current_user: User
) -> Complaint:
    if current_user.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department handler is not assigned to a department"
        )

    complaint = db.query(Complaint).filter(
        Complaint.id == complaint_id,
        Complaint.department_id == current_user.department_id
    ).first()

    if complaint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )

    return complaint


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
    response_model=list[HandlerComplaintResponse]
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
        Complaint.create_at.desc(), Complaint.id.desc()
    ).all()

    return _handler_complaint_details(db, complaints)


@router.get(
    "/complaints/mine",
    response_model=list[ComplaintDetailResponse]
)
def get_my_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    complaints = db.query(Complaint).filter(
        Complaint.user_id == current_user.id
    ).order_by(
        Complaint.create_at.desc(), Complaint.id.desc()
    ).all()

    return _complaint_details(db, complaints)


@router.patch(
    "/handler/complaints/{complaint_id}/status",
    response_model=ComplaintDetailResponse
)
def update_handler_complaint_status(
    complaint_id: int,
    update: ComplaintStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("department_handler"))
):
    if update.status not in {"pending", "followed_up", "processed"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be pending, followed_up, or processed"
        )

    complaint = _handler_complaint(db, complaint_id, current_user)
    complaint.status = update.status
    complaint.handler_id = current_user.id
    db.commit()
    db.refresh(complaint)

    return _complaint_details(db, [complaint])[0]


@router.patch(
    "/handler/complaints/{complaint_id}/redirect",
    response_model=ComplaintRedirectResponse
)
def redirect_handler_complaint(
    complaint_id: int,
    redirect: ComplaintRedirectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("department_handler"))
):
    complaint = _handler_complaint(db, complaint_id, current_user)

    target_department = db.query(Department).filter(
        Department.id == redirect.department_id
    ).first()
    if target_department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target department not found"
        )

    complaint.department_id = target_department.id
    complaint.handler_id = None
    complaint.status = "pending"
    db.commit()
    db.refresh(complaint)

    return {
        **_complaint_details(db, [complaint])[0],
        "handler_id": complaint.handler_id,
    }


@router.get(
    "/admin/complaints",
    response_model=list[ComplaintDetailResponse]
)
def get_admin_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "super_admin"))
):
    complaints = db.query(Complaint).order_by(
        Complaint.create_at.desc(), Complaint.id.desc()
    ).all()
    return _complaint_details(db, complaints)


@router.get("/complaints/{complaint_id}/department-email")
def get_complaint_department_email(
    complaint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    complaint = db.query(Complaint).filter(
        Complaint.id == complaint_id,
        Complaint.user_id == current_user.id
    ).first()
    if complaint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )

    department = db.query(Department).filter(
        Department.id == complaint.department_id
    ).first()
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )

    return {
        "success": True,
        "department": department.name,
        "email": department.email
    }
