from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Float, Boolean
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


class LoginThrottle(Base):
    """Persistent, hashed-identity counters for failed login protection."""

    __tablename__ = "login_throttles"

    scope = Column(String(16), primary_key=True)
    identity_digest = Column(String(64), primary_key=True)
    failure_count = Column(Integer, nullable=False, default=0)
    window_started_at = Column(DateTime, nullable=False, server_default=func.now())
    locked_until = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


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


class ComplaintRedirection(Base):
    """One record for every department-to-department complaint transfer."""

    __tablename__ = "complaint_redirections"

    id = Column(Integer, primary_key=True, index=True)

    complaint_id = Column(
        Integer,
        ForeignKey("complaints.id"),
        nullable=False,
        index=True,
    )

    from_department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False,
    )

    to_department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False,
    )

    redirected_by_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    reason = Column(String, nullable=False)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )


class ChatbotTelemetry(Base):
    __tablename__ = "chatbot_telemetry"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    question_preview = Column(String(240), nullable=False)
    outcome = Column(String(16), nullable=False, index=True)
    fallback = Column(Boolean, nullable=False, default=False)
    source_names = Column(JSON, nullable=False, default=list)
    source_count = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Float, nullable=False)
