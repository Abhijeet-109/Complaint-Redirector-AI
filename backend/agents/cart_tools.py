import logging
from decimal import Decimal

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import add_cart_item, get_cart, remove_cart_item


logger = logging.getLogger(__name__)


def _serialize_cart(cart):
    items = []
    total = Decimal("0.00")
    for item in cart.items if cart is not None else []:
        variant = item.variant
        product = variant.product if variant is not None else None
        unit_price = variant.price if variant is not None else Decimal("0.00")
        line_total = unit_price * item.quantity
        total += line_total
        items.append({
            "variant_id": variant.id if variant is not None else item.variant_id,
            "product_name": product.name if product is not None else None,
            "variant_name": variant.name if variant is not None else None,
            "quantity": item.quantity,
            "unit_price": str(unit_price),
            "line_total": str(line_total),
        })
    return {
        "cart_id": cart.id if cart is not None else None,
        "items": items,
        "item_count": len(items),
        "total": str(total),
    }


def _valid_positive_int(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def build_cart_tools(user_id: int):
    if not _valid_positive_int(user_id):
        raise ValueError("A valid authenticated user ID is required.")

    @tool
    def get_my_cart() -> dict:
        """Retrieve the authenticated customer's active cart and current item prices."""
        try:
            with SessionLocal() as session:
                cart = get_cart(session, user_id)
                return {"success": True, "cart": _serialize_cart(cart)}
        except Exception:
            logger.exception("Cart retrieval failed.")
            return {"success": False, "message": "Unable to retrieve your cart right now."}

    @tool
    def add_item_to_my_cart(variant_id: int, quantity: int = 1) -> dict:
        """Add a product variant by its database variant ID to the authenticated customer's cart."""
        if not _valid_positive_int(variant_id):
            return {"success": False, "message": "A valid product variant ID is required."}
        if not _valid_positive_int(quantity):
            return {"success": False, "message": "Quantity must be a positive whole number."}
        try:
            with SessionLocal() as session:
                add_cart_item(session, user_id, variant_id, quantity)
                session.commit()
                cart = get_cart(session, user_id)
                return {"success": True, "message": "Item added to cart.", "cart": _serialize_cart(cart)}
        except LookupError:
            return {"success": False, "message": "That product variant is unavailable."}
        except ValueError as exc:
            if "stock" in str(exc).casefold():
                return {"success": False, "message": "There is not enough stock for that quantity."}
            return {"success": False, "message": "The requested quantity is invalid."}
        except Exception:
            logger.exception("Adding a cart item failed.")
            return {"success": False, "message": "Unable to add that item to your cart right now."}

    @tool
    def remove_item_from_my_cart(variant_id: int) -> dict:
        """Remove a product variant by database variant ID from the authenticated customer's active cart."""
        if not _valid_positive_int(variant_id):
            return {"success": False, "message": "A valid product variant ID is required."}
        try:
            with SessionLocal() as session:
                removed = remove_cart_item(session, user_id, variant_id)
                if not removed:
                    return {"success": False, "message": "That variant is not in your active cart."}
                session.commit()
                cart = get_cart(session, user_id)
                return {"success": True, "message": "Item removed from cart.", "cart": _serialize_cart(cart)}
        except Exception:
            logger.exception("Removing a cart item failed.")
            return {"success": False, "message": "Unable to remove that item from your cart right now."}

    return [get_my_cart, add_item_to_my_cart, remove_item_from_my_cart]
