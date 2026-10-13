"""Persistent failed-login lockout and per-IP attempt throttling."""

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.Database.models import LoginThrottle


LOCKOUT_DURATION = timedelta(hours=24)
MAX_EMAIL_FAILURES = 5
MAX_IP_FAILURES = 30


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _digest(scope: str, identity: str, key: str) -> str:
    normalized_identity = identity.strip().lower()
    return hmac.new(
        key.encode("utf-8"),
        f"{scope}:{normalized_identity}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _locked_counter(
    db: Session,
    scope: str,
    identity_digest: str,
    now: datetime,
) -> LoginThrottle:
    values = {
        "scope": scope,
        "identity_digest": identity_digest,
        "failure_count": 0,
        "window_started_at": now,
        "updated_at": now,
    }
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise RuntimeError("Login lockout requires PostgreSQL or SQLite.")

    db.execute(
        insert(LoginThrottle)
        .values(**values)
        .on_conflict_do_nothing(
            index_elements=[LoginThrottle.scope, LoginThrottle.identity_digest]
        )
    )
    row = (
        db.query(LoginThrottle)
        .filter(
            LoginThrottle.scope == scope,
            LoginThrottle.identity_digest == identity_digest,
        )
        .with_for_update()
        .one()
    )

    if row.locked_until is not None and row.locked_until <= now:
        row.failure_count = 0
        row.window_started_at = now
        row.locked_until = None
    elif (
        row.locked_until is None
        and row.failure_count > 0
        and row.updated_at < now - LOCKOUT_DURATION
    ):
        row.failure_count = 0
        row.window_started_at = now

    return row


def prepare_login(
    db: Session,
    normalized_email: str,
    client_ip: str,
    *,
    now: datetime | None = None,
    hmac_key: str | None = None,
) -> int | None:
    """Return Retry-After seconds if email or client IP is locked."""
    current_time = _utc_naive(now or datetime.now(timezone.utc))
    signing_key = hmac_key if hmac_key is not None else os.getenv("LOGIN_LOCKOUT_HMAC_KEY", "")
    email_row = _locked_counter(
        db,
        "email",
        _digest("email", normalized_email, signing_key),
        current_time,
    )
    ip_row = _locked_counter(
        db,
        "ip",
        _digest("ip", client_ip, signing_key),
        current_time,
    )

    retry_after = [
        int((row.locked_until - current_time).total_seconds())
        for row in (email_row, ip_row)
        if row.locked_until is not None and row.locked_until > current_time
    ]
    if ip_row.failure_count >= MAX_IP_FAILURES:
        retry_after.append(
            max(1, int((ip_row.window_started_at + LOCKOUT_DURATION - current_time).total_seconds()))
        )
        ip_row.locked_until = ip_row.window_started_at + LOCKOUT_DURATION

    return max(retry_after) if retry_after else None


def record_failed_login(
    db: Session,
    normalized_email: str,
    client_ip: str,
    *,
    now: datetime | None = None,
    hmac_key: str | None = None,
) -> None:
    current_time = _utc_naive(now or datetime.now(timezone.utc))
    signing_key = hmac_key if hmac_key is not None else os.getenv("LOGIN_LOCKOUT_HMAC_KEY", "")
    email_row = _locked_counter(
        db,
        "email",
        _digest("email", normalized_email, signing_key),
        current_time,
    )
    ip_row = _locked_counter(
        db,
        "ip",
        _digest("ip", client_ip, signing_key),
        current_time,
    )

    email_row.failure_count += 1
    email_row.updated_at = current_time
    if email_row.failure_count >= MAX_EMAIL_FAILURES:
        email_row.locked_until = current_time + LOCKOUT_DURATION

    ip_row.failure_count += 1
    ip_row.updated_at = current_time
    if ip_row.failure_count >= MAX_IP_FAILURES:
        ip_row.locked_until = current_time + LOCKOUT_DURATION

    db.commit()


def record_successful_login(
    db: Session,
    normalized_email: str,
    *,
    now: datetime | None = None,
    hmac_key: str | None = None,
) -> None:
    current_time = _utc_naive(now or datetime.now(timezone.utc))
    signing_key = hmac_key if hmac_key is not None else os.getenv("LOGIN_LOCKOUT_HMAC_KEY", "")
    email_row = _locked_counter(
        db,
        "email",
        _digest("email", normalized_email, signing_key),
        current_time,
    )
    email_row.failure_count = 0
    email_row.locked_until = None
    email_row.window_started_at = current_time
    email_row.updated_at = current_time
    db.commit()


