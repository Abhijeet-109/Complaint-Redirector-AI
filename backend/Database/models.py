from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func


from backend.Database.connection import Base

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key = True,
        index = True

    )

    name = Column(
        String,
        nullable = False
    )

    email = Column(
        String,
        unique = True,
        nullable = False,
        index = True
    )

    password = Column(
        String,
        nullable = False
    )

    role = Column(
        String,
        nullable = False,
        default = "user"
    )



    create_at = Column(
        DateTime,
        server_default = func.now()
    )
