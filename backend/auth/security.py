import os 
from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from backend.security_config import validate_jwt_secret

password_hash = PasswordHash.recommended()

SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY"
)

validate_jwt_secret(SECRET_KEY)


ALGORITHM = "HS256"
JWT_ISSUER = "flatkart-api"
ACCESS_TOKEN_TTL = timedelta(hours=12)


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

    issued_at = datetime.now(timezone.utc)

    payload = {
        "user_id" : user_id,
        "role" : role,
        "iss": JWT_ISSUER,
        "iat": issued_at,
        "exp": issued_at + ACCESS_TOKEN_TTL,
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
        algorithms=[ALGORITHM],
        issuer=JWT_ISSUER,
        options={"require": ["exp", "iat", "iss"]},
    )




