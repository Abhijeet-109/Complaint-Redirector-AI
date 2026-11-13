"""Read-only, customer-scoped account assistance tools."""

import logging

from langchain.tools import tool
from sqlalchemy import select

from backend.Database.connection import SessionLocal
from backend.Database.models import User, UserAddress


logger = logging.getLogger(__name__)


def _valid_user_id(user_id):
    return isinstance(user_id, int) and not isinstance(user_id, bool) and 1 <= user_id <= 2_147_483_647


def _mask_mobile(value):
    if not value:
        return None
    return "*" * max(0, len(value) - 4) + value[-4:]


def build_support_tools(user_id: int):
    if not _valid_user_id(user_id):
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def get_my_account_summary() -> dict:
        """Read-only basic account contact information for the authenticated customer."""
        try:
            with SessionLocal() as session:
                user = session.scalar(select(User).where(User.id == user_id))
                if user is None:
                    return {"success": False, "message": "Account not found."}
                return {
                    "success": True,
                    "account": {
                        "name": user.name,
                        "email": user.email,
                        "mobile_number": _mask_mobile(user.mobile_number),
                    },
                }
        except Exception:
            logger.exception("Customer account summary retrieval failed.")
            return {"success": False, "message": "Unable to retrieve account information right now."}

    @tool
    def list_my_saved_addresses() -> dict:
        """Read-only safe summaries of the authenticated customer's saved addresses."""
        try:
            with SessionLocal() as session:
                addresses = session.scalars(
                    select(UserAddress)
                    .where(UserAddress.user_id == user_id)
                    .order_by(UserAddress.is_default.desc(), UserAddress.id)
                ).all()
                results = [
                    {
                        "address_id": address.id,
                        "label": address.label,
                        "recipient_name": address.recipient_name,
                        "city": address.city,
                        "state": address.state,
                        "pin_code": address.pin_code,
                        "is_default": address.is_default,
                        "mobile_number": _mask_mobile(address.mobile_number),
                    }
                    for address in addresses
                ]
                return {"success": True, "addresses": results, "count": len(results)}
        except Exception:
            logger.exception("Customer saved-address listing failed.")
            return {"success": False, "message": "Unable to retrieve saved addresses right now."}

    return [get_my_account_summary, list_my_saved_addresses]
