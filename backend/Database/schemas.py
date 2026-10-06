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

    class config:
        from_attributes = True


class LoginRequest (BaseModel):

    email : EmailStr
    password : str

