from typing import Literal

from pydantic import BaseModel, EmailStr


class userCreate(BaseModel):

    name : str
    email : EmailStr
    password : str



class UserResponse(BaseModel):
    id : int
    name : str
    email : EmailStr
    role : str

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["user", "admin", "department_handler"]


class AdminUserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    role: Literal["user", "admin", "department_handler"] | None = None


class LoginRequest (BaseModel):

    email : EmailStr
    password : str

