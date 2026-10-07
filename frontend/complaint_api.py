"""Authenticated client for Flatkart's existing user complaint endpoints."""

import os

import requests


API_BASE_URL = os.getenv("FLATKART_API_URL", "http://127.0.0.1:8000").rstrip("/")


class ComplaintAPIError(Exception):
    def __init__(self, message: str, *, unauthorized: bool = False):
        super().__init__(message)
        self.unauthorized = unauthorized


def _request(method: str, path: str, token: str, *, payload: dict | None = None):
    try:
        response = requests.request(
            method,
            f"{API_BASE_URL}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
    except requests.exceptions.RequestException as exc:
        raise ComplaintAPIError(
            "Unable to connect to Flatkart right now. Please try again."
        ) from exc

    if response.status_code == 401:
        raise ComplaintAPIError(
            "Your session has expired. Please login again.", unauthorized=True
        )
    if response.status_code == 403:
        raise ComplaintAPIError("This page is not available for your account.")
    if not response.ok:
        raise ComplaintAPIError(
            "We couldn't submit your complaint. Please try again."
            if method == "POST"
            else "We couldn't load this information. Please try again."
        )

    try:
        return response.json()
    except ValueError as exc:
        raise ComplaintAPIError("We received an unexpected response. Please try again.") from exc


def get_current_user(token: str) -> dict:
    result = _request("GET", "/api/v1/test/me", token)
    if not isinstance(result, dict):
        raise ComplaintAPIError("We couldn't load your account details. Please try again.")
    return result


def get_my_complaints(token: str) -> list[dict]:
    result = _request("GET", "/api/v1/complaints/mine", token)
    if not isinstance(result, list):
        raise ComplaintAPIError("We couldn't load your complaints. Please try again.")
    return [item for item in result if isinstance(item, dict)]


def submit_complaint(token: str, complaint_text: str) -> dict:
    result = _request(
        "POST",
        "/api/v1/complaints",
        token,
        payload={"complaint_text": complaint_text.strip()},
    )
    if not isinstance(result, dict):
        raise ComplaintAPIError("We couldn't submit your complaint. Please try again.")
    return result


def get_department_contact(token: str, complaint_id: int) -> dict:
    result = _request(
        "GET", f"/api/v1/complaints/{complaint_id}/department-email", token
    )
    if not isinstance(result, dict):
        raise ComplaintAPIError("We couldn't load the department contact. Please try again.")
    return result
