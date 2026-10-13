"""Database-backed security controls shared by API routes."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.Database.models import Complaint, User


def complaint_count_for_utc_day(
    db: Session,
    user_id: int,
    now: datetime | None = None,
) -> int:
    """Lock a user's row, then count today's complaints in UTC.

    PostgreSQL's row lock serializes concurrent complaint submissions for the
    same account. The complaint timestamp column is timezone-naive, so bounds
    are stored as naive UTC values, matching the application's UTC DB setting.
    """
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    current_time = current_time.astimezone(timezone.utc)

    day_start = current_time.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
        tzinfo=None,
    )
    day_end = day_start + timedelta(days=1)

    locked_user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .one_or_none()
    )
    if locked_user is None:
        return 0

    return int(
        db.query(func.count(Complaint.id))
        .filter(
            Complaint.user_id == user_id,
            Complaint.create_at >= day_start,
            Complaint.create_at < day_end,
        )
        .scalar()
        or 0
    )


