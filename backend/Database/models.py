from sqlalchemy import Column, Integer, String, DateTime,ForeignKey
from sqlalchemy.sql import func


from backend.Database.connection import Base

class Department(Base):
    __tablename__ = "departments"


    id = Column(
        Integer,
        primary_key = True,
        index = True
    )

    name = Column(
        String,
        unique = True,
        nullable = False

    )

    email = Column(
        String,
        nullable = False,

    )

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

    department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=True
    )



    create_at = Column(
        DateTime,
        server_default = func.now()
    )




class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    predicted_department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False
    )

    department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False
    )

    handler_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    complaint_text = Column(
        String,
        nullable=False
    )

    confidence = Column(
        String,
        nullable=True
    )

    status = Column(
        String,
        nullable=False,
        default="pending"
    )

    create_at = Column(
        DateTime,
        server_default=func.now()
    )



