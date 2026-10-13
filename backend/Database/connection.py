import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.security_config import (
    app_environment,
    validate_database_url,
    validate_login_lockout_config,
)


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
validate_database_url(DATABASE_URL, app_environment())
validate_login_lockout_config(environment=app_environment())


engine = create_engine(
    DATABASE_URL

)

SessionLocal = sessionmaker(
    autocommit = False,
    autoflush = False,
    bind = engine
)


Base = declarative_base()
