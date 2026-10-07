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


class DepartmentResponse(BaseModel):

    id: int
    name: str
    email: EmailStr

    class Config:
        from_attributes = True




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