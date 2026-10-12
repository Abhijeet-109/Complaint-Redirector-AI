import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.predictor import predict_department
from backend.router import send_complaint_email, send_redirect_email

from sqlalchemy.orm import Session

from typing import Literal

from backend.Database.models import Complaint, Department, User, ComplaintRedirection
from backend.Database.schemas import (
    ComplaintCreate,
    ComplaintDetailResponse,
    AdminComplaintDetailResponse,
    ComplaintRedirectResponse,
    ComplaintResponse,
    ComplaintRedirectionHistoryResponse,
    HandlerComplaintResponse,
)


from backend.auth.dependencies import (
    get_db,
    get_current_user,
    require_role
)

logger = logging.getLogger("flatkart.complaint")

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

    reason: Literal[
        "model_fault",
        "further_processing",
    ]


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

    # --- Send email notification to the department ---
    email_sent = True
    try:
        send_complaint_email(
            complaint=complaint_data.complaint_text,
            department=department_name,
            confidence=confidence,
            receiver=department.email,
            user_name=current_user.name,
            user_email=current_user.email,
            complaint_id=complaint.id,
        )
    except Exception as exc:
        email_sent = False
        logger.warning(
            "Complaint #%s created but email notification failed: %s",
            complaint.id,
            exc,
        )

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


ALLOWED_HANDLER_STATUSES = {"pending", "followed_up", "resolved"}


@router.patch(
    "/handler/complaints/{complaint_id}/status",
    response_model=HandlerComplaintResponse,
)
def update_handler_complaint_status(
    complaint_id: int,
    update: ComplaintStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("department_handler")
    ),
):
    """Allow a department handler to update the status of a complaint
    currently assigned to their department."""

    if update.status not in ALLOWED_HANDLER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{update.status}'. "
                   f"Allowed: {', '.join(sorted(ALLOWED_HANDLER_STATUSES))}",
        )

    complaint = _handler_complaint(db, complaint_id, current_user)

    complaint.status = update.status

    try:
        db.commit()
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to update status of complaint #%s",
            complaint.id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save status update",
        )

    db.refresh(complaint)

    return _handler_complaint_details(db, [complaint])[0]


@router.patch(
    "/handler/complaints/{complaint_id}/redirect",
    response_model=ComplaintRedirectResponse,
)
def redirect_handler_complaint(
    complaint_id: int,
    redirect: ComplaintRedirectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("department_handler")
    ),
):
    # A handler can redirect only a complaint assigned to their department.
    complaint = _handler_complaint(
        db,
        complaint_id,
        current_user,
    )

    previous_department = db.query(Department).filter(
        Department.id == complaint.department_id
    ).first()

    predicted_department = db.query(Department).filter(
        Department.id == complaint.predicted_department_id
    ).first()

    target_department = db.query(Department).filter(
        Department.id == redirect.department_id
    ).first()

    if target_department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target department not found",
        )

    if target_department.id == complaint.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complaint is already assigned to the target department",
        )

    previous_department_name = (
        previous_department.name
        if previous_department
        else "Unknown"
    )

    predicted_department_name = (
        predicted_department.name
        if predicted_department
        else "Unknown"
    )

    # Create a permanent record of this transfer.
    redirection = ComplaintRedirection(
        complaint_id=complaint.id,
        from_department_id=complaint.department_id,
        to_department_id=target_department.id,
        redirected_by_user_id=current_user.id,
        reason=redirect.reason,
    )

    db.add(redirection)

    # Update the complaint's current assignment.
    complaint.department_id = target_department.id
    complaint.handler_id = None
    complaint.status = "pending"

    # Save the history row and current assignment together.
    try:
        db.commit()
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to redirect complaint #%s",
            complaint.id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save complaint redirection",
        )

    db.refresh(complaint)

    # Preserve the existing email notification workflow.
    email_sent = True

    try:
        send_redirect_email(
            complaint_text=complaint.complaint_text,
            complaint_id=complaint.id,
            previous_department=previous_department_name,
            new_department=target_department.name,
            predicted_department=predicted_department_name,
            confidence=complaint.confidence,
            receiver=target_department.email,
            status=complaint.status,
        )
    except Exception as exc:
        email_sent = False

        logger.warning(
            "Complaint #%s redirected but email notification failed: %s",
            complaint.id,
            exc,
        )

    return {
        **_complaint_details(db, [complaint])[0],
        "handler_id": complaint.handler_id,
        "redirection_reason": redirect.reason,
        "email_sent": email_sent,
    }

@router.get(
    "/handler/complaints/{complaint_id}/redirections",
    response_model=list[ComplaintRedirectionHistoryResponse],
)
def get_handler_complaint_redirections(
    complaint_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("department_handler", "admin", "super_admin")
    ),
):
    if current_user.role == "department_handler":
        # Only a handler in the complaint's current department can view its history.
        _handler_complaint(db, complaint_id, current_user)
    else:
        complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
        if complaint is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    history = db.query(ComplaintRedirection).filter(
        ComplaintRedirection.complaint_id == complaint_id
    ).order_by(
        ComplaintRedirection.created_at,
        ComplaintRedirection.id,
    ).all()

    department_ids = {
        department_id
        for item in history
        for department_id in (
            item.from_department_id,
            item.to_department_id,
        )
    }

    departments = {
        department.id: department.name
        for department in db.query(Department).filter(
            Department.id.in_(department_ids)
        ).all()
    } if department_ids else {}

    actor_ids = {
        item.redirected_by_user_id
        for item in history
    }

    actors = {
        user.id: user.name
        for user in db.query(User).filter(
            User.id.in_(actor_ids)
        ).all()
    } if actor_ids else {}

    return [
        {
            "id": item.id,
            "complaint_id": item.complaint_id,
            "from_department_id": item.from_department_id,
            "from_department": departments.get(
                item.from_department_id,
                "Unknown",
            ),
            "to_department_id": item.to_department_id,
            "to_department": departments.get(
                item.to_department_id,
                "Unknown",
            ),
            "redirected_by_user_id": item.redirected_by_user_id,
            "redirected_by_name": actors.get(
                item.redirected_by_user_id,
                "Unknown",
            ),
            "reason": item.reason,
            "created_at": item.created_at,
        }
        for item in history
    ]


@router.get(
    "/admin/complaints",
    response_model=list[AdminComplaintDetailResponse]
)
def get_admin_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "super_admin"))
):
    complaints = db.query(Complaint).order_by(
        Complaint.create_at.desc(), Complaint.id.desc()
    ).all()
    return _handler_complaint_details(db, complaints)


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
