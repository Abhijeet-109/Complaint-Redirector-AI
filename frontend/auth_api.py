"""Small client for the existing FastAPI authentication endpoints."""

import base64
import json
import os
import re

import requests


API_BASE_URL = os.getenv("FLATKART_API_URL", "http://127.0.0.1:8000").rstrip("/")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class AuthAPIError(Exception):
    """A user-safe authentication request error."""


def validate_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.fullmatch(email.strip()))


def _detail(response: requests.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""

    detail = body.get("detail", "") if isinstance(body, dict) else ""
    if isinstance(detail, list):
        return " ".join(str(item.get("msg", "")) for item in detail if isinstance(item, dict))
    return str(detail)


def _post(path: str, payload: dict) -> dict:
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/{path}",
            json=payload,
            timeout=12,
        )
    except requests.exceptions.Timeout as exc:
        raise AuthAPIError("The request took too long. Please try again.") from exc
    except requests.exceptions.ConnectionError as exc:
        raise AuthAPIError(
            "We can’t reach the service right now. Please try again in a moment."
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise AuthAPIError("Something went wrong. Please try again.") from exc

    if not response.ok:
        detail = _detail(response).lower()
        if path == "register" and ("email already registered" in detail or "already exists" in detail):
            raise AuthAPIError("An account with this email already exists. Please login instead.")
        if path == "login" and response.status_code in (400, 401):
            raise AuthAPIError("Invalid email or password.")
        if path == "register" and response.status_code == 422:
            raise AuthAPIError("Please check your information and try again.")
        raise AuthAPIError(
            "Unable to create your account. Please check your information and try again."
            if path == "register"
            else "We couldn’t sign you in. Please try again."
        )

    try:
        return response.json()
    except ValueError as exc:
        raise AuthAPIError("We received an unexpected response. Please try again.") from exc


def register_user(name: str, email: str, password: str) -> dict:
    return _post("register", {"name": name.strip(), "email": email.strip(), "password": password})


def login_user(email: str, password: str) -> dict:
    return _post("login", {"email": email.strip(), "password": password})


def role_from_token(token: str) -> str | None:
    """Read the role claim for session display only; never use it for authorization."""
    try:
        payload_part = token.split(".")[1]
        payload_part += "=" * (-len(payload_part) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_part.encode("ascii")))
        role = payload.get("role")
        return role if isinstance(role, str) else None
    except (IndexError, ValueError, TypeError, UnicodeDecodeError):
        return None
