import os 
import jwt
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY"
)


ALGORITHM = "HS256"


def hash_password (password: str)-> str:
    return password_hash.hash(password)



def verify_password(
        plain_password: str,
        hashed_password: str
)-> bool:
    return password_hash.verify(
    plain_password,
    hashed_password
    
)


def create_access_token(user_id: int, role: str):

    payload = {
        "user_id" : user_id,
        "role" : role
    }

    token = jwt.encode(
        payload,\
        SECRET_KEY,
        algorithm = ALGORITHM
    )


    return token 


def decode_access_token( token: str):

    return jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM]
    )




