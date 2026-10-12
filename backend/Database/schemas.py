from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr


class userCreate(BaseModel):

    name: str
    email: EmailStr
    password: str


class UserResponse(BaseModel):

    id: int
    name: str
    email: EmailStr
    role: str
    department_id: int | None = None

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):

    name: str
    email: EmailStr
    password: str

    role: Literal[
        "user",
        "admin",
        "department_handler"
    ]

    department_id: int | None = None


class AdminUserUpdate(BaseModel):

    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None

    role: Literal[
        "user",
        "admin",
        "department_handler"
    ] | None = None

    department_id: int | None = None


class LoginRequest(BaseModel):

    email: EmailStr
    password: str


class DepartmentCreate(BaseModel):

    name: str
    email: EmailStr


class DepartmentUpdate(BaseModel):

    name: str | None = None
    email: EmailStr | None = None


class DepartmentResponse(BaseModel):

    id: int
    name: str
    email: EmailStr

    class Config:
        from_attributes = True


class ComplaintDetailResponse(BaseModel):
    id: int
    complaint_text: str
    predicted_department_id: int
    predicted_department: str
    department_id: int
    current_department: str
    status: str
    confidence: str | None
    create_at: datetime | None


class HandlerComplaintResponse(ComplaintDetailResponse):
    user_id: int
    user_name: str | None
    user_email: EmailStr | None


class AdminComplaintDetailResponse(ComplaintDetailResponse):
    user_id: int | None = None
    user_name: str | None = None
    user_email: str | None = None


class ComplaintRedirectResponse(ComplaintDetailResponse):
    handler_id: int | None

    redirection_reason: Literal[
        "model_fault",
        "further_processing",
    ]

    email_sent: bool


class ComplaintRedirectionHistoryResponse(BaseModel):
    id: int
    complaint_id: int

    from_department_id: int
    from_department: str

    to_department_id: int
    to_department: str

    redirected_by_user_id: int
    redirected_by_name: str

    reason: Literal[
        "model_fault",
        "further_processing",
    ]

    created_at: datetime | None



class ComplaintCreate(BaseModel):

    complaint_text: str


class ComplaintResponse(BaseModel):

    id: int
    user_id: int
    predicted_department_id: int
    department_id: int
    handler_id: int | None = None
    complaint_text: str
    confidence: str | None = None
    status: str

    class Config:
        from_attributes = True


class ComplaintHandlerResponse(BaseModel):

    id: int
    user_id: int
    predicted_department_id: int
    department_id: int
    handler_id: int | None = None
    complaint_text: str
    confidence: str | None = None
    status: str

    class Config:
        from_attributes = True
