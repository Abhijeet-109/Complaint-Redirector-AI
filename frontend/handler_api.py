"""Client for the existing department-handler complaint endpoints."""

import os

import requests


API_BASE_URL = os.getenv("FLATKART_API_URL", "http://127.0.0.1:8000").rstrip("/")


class HandlerAPIError(Exception):
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
        raise HandlerAPIError("Unable to reach Flatkart. Please try again.") from exc

    if response.status_code == 401:
        raise HandlerAPIError("Your session has expired. Please login again.", unauthorized=True)
    if response.status_code == 403:
        raise HandlerAPIError("This page is not available for your account.")
    if not response.ok:
        raise HandlerAPIError(
            "We couldn't update this complaint. Please try again."
            if method == "PATCH"
            else "Unable to load your assigned complaints. Please try again."
        )
    try:
        return response.json()
    except ValueError as exc:
        raise HandlerAPIError("We received an unexpected response. Please try again.") from exc


def get_handler_complaints(token: str) -> list[dict]:
    result = _request("GET", "/api/v1/handler/complaints", token)
    if not isinstance(result, list):
        raise HandlerAPIError("Unable to load your assigned complaints. Please try again.")
    return [item for item in result if isinstance(item, dict)]


def update_handler_complaint_status(token: str, complaint_id: int, status: str) -> dict:
    if status not in {"pending", "followed_up", "processed"}:
        raise HandlerAPIError("We couldn't update this complaint. Please try again.")
    result = _request(
        "PATCH",
        f"/api/v1/handler/complaints/{complaint_id}/status",
        token,
        payload={"status": status},
    )
    if not isinstance(result, dict):
        raise HandlerAPIError("We couldn't update this complaint. Please try again.")
    return result


def redirect_handler_complaint(token: str, complaint_id: int, department_id: int) -> dict:
    result = _request(
        "PATCH",
        f"/api/v1/handler/complaints/{complaint_id}/redirect",
        token,
        payload={"department_id": department_id},
    )
    if not isinstance(result, dict):
        raise HandlerAPIError("We couldn't redirect this complaint. Please try again.")
    return result
