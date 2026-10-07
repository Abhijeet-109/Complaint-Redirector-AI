"""Authenticated client for Flatkart's existing administration endpoints."""

import os

import requests


API_BASE_URL = os.getenv("FLATKART_API_URL", "http://127.0.0.1:8000").rstrip("/")


class AdminAPIError(Exception):
    def __init__(self, message: str, *, unauthorized: bool = False):
        super().__init__(message)
        self.unauthorized = unauthorized


def _detail(response):
    try:
        body = response.json()
    except ValueError:
        return ""
    detail = body.get("detail", "") if isinstance(body, dict) else ""
    if isinstance(detail, list):
        return " ".join(str(item.get("msg", "")) for item in detail if isinstance(item, dict))
    return str(detail)


def _request(method, path, token, *, payload=None, action="load"):
    try:
        response = requests.request(
            method,
            f"{API_BASE_URL}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
    except requests.exceptions.RequestException as exc:
        raise AdminAPIError(_action_message(action)) from exc

    if response.status_code == 401:
        raise AdminAPIError("Your session has expired. Please login again.", unauthorized=True)
    if response.status_code == 403:
        raise AdminAPIError("This action is not available for your account.")
    if not response.ok:
        detail = _detail(response).lower()
        if response.status_code == 409 and "email" in detail:
            raise AdminAPIError("This email is already registered.")
        if response.status_code == 409 and "department" in detail:
            raise AdminAPIError("A department with this name already exists.")
        if response.status_code == 422 and action in {"create", "update"}:
            raise AdminAPIError("Please check the information and try again.")
        raise AdminAPIError(_action_message(action))

    if response.status_code == 204:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise AdminAPIError("We received an unexpected response. Please try again.") from exc


def _action_message(action):
    return {
        "load_users": "Unable to load users.",
        "load_departments": "Unable to load departments.",
        "load_complaints": "Unable to load complaints.",
        "create": "Unable to create the account.",
        "update": "Unable to update the account.",
        "delete": "Unable to delete the account.",
        "create_department": "Unable to create the department.",
    }.get(action, "Something went wrong. Please try again.")


def _list_request(path, token, action):
    result = _request("GET", path, token, action=action)
    if not isinstance(result, list) or any(not isinstance(row, dict) for row in result):
        raise AdminAPIError(_action_message(action))
    return result


def get_admin_users(token):
    return _list_request("/api/admin/users", token, "load_users")


def create_user(token, payload):
    return _request("POST", "/api/admin/users", token, payload=payload, action="create")


def update_user(token, user_id, payload):
    return _request("PUT", f"/api/admin/users/{user_id}", token, payload=payload, action="update")


def delete_user(token, user_id):
    return _request("DELETE", f"/api/admin/users/{user_id}", token, action="delete")


def get_admin_departments(token):
    return _list_request("/api/admin/departments", token, "load_departments")


def create_department(token, payload):
    return _request(
        "POST", "/api/admin/departments", token,
        payload=payload, action="create_department",
    )


def get_admin_complaints(token):
    return _list_request("/api/v1/admin/complaints", token, "load_complaints")
