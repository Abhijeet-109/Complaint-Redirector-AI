"""Product agent tools."""

import logging
from decimal import Decimal

from langchain.tools import tool

from backend.Database.connection import SessionLocal
from backend.Database.services import (
    get_product,
    get_variant_inventory,
    list_categories,
    list_products,
)

logger = logging.getLogger(__name__)


def serialize_variant(variant, inventory=None):
    return {
        "variant_id": variant.id,
        "sku": variant.sku,
        "name": variant.name,
        "price": str(variant.price),
        "is_available": variant.is_available,
        "available_stock": inventory.available_stock if inventory else None,
        "stock_status": inventory.stock_status if inventory else None,
    }


def serialize_product(product, include_variants=True):
    result = {
        "product_id": product.id,
        "name": product.name,
        "slug": product.slug,
        "brand": product.brand,
        "description": product.description,
        "category_id": product.category_id,
        "is_active": product.is_active,
    }

    if include_variants:
        variants = []
        for variant in sorted(product.variants, key=lambda v: v.id):
            inventory = getattr(variant, "inventory", None)
            variants.append(serialize_variant(variant, inventory))
        result["variants"] = variants

    return result


def _find_category_id_by_name(session, name):
    term = name.strip()
    if not term:
        return None

    categories = list_categories(session, active_only=False)
    for category in categories:
        if category.name.casefold() == term.casefold() or category.slug.casefold() == term.casefold():
            return category.id

    for category in categories:
        if term.casefold() in category.name.casefold() or term.casefold() in category.slug.casefold():
            return category.id

    return None


def build_product_tools():

    @tool
    def search_products(query: str) -> dict:
        """Search products by keyword, name, or brand."""
        query = (query or "").strip()
        if not query:
            return {
                "success": False,
                "message": "A search term is required.",
            }

        try:
            with SessionLocal() as session:
                products = list_products(session, search=query, limit=50)
                return {
                    "success": True,
                    "query": query,
                    "products": [serialize_product(p) for p in products],
                    "count": len(products),
                }

        except Exception:
            logger.exception("Product search failed.")
            return {
                "success": False,
                "message": "Unable to search products right now.",
            }

    @tool
    def search_products_by_category(category: str) -> dict:
        """Find products by category name or slug."""
        category = (category or "").strip()
        if not category:
            return {
                "success": False,
                "message": "A category name is required.",
            }

        try:
            with SessionLocal() as session:
                category_id = _find_category_id_by_name(session, category)
                if category_id is None:
                    return {
                        "success": False,
                        "message": "Category not found.",
                    }

                products = list_products(session, category_id=category_id, limit=50)
                return {
                    "success": True,
                    "category": category,
                    "products": [serialize_product(p) for p in products],
                    "count": len(products),
                }

        except Exception:
            logger.exception("Product category search failed.")
            return {
                "success": False,
                "message": "Unable to search products by category right now.",
            }

    @tool
    def get_product_details(product_id: int) -> dict:
        """Retrieve complete product details including variants, prices, and stock."""
        if not isinstance(product_id, int) or product_id <= 0:
            return {
                "success": False,
                "message": "A valid product ID is required.",
            }

        try:
            with SessionLocal() as session:
                product = get_product(session, product_id)
                if product is None:
                    return {
                        "success": False,
                        "message": "Product not found.",
                    }

                return {
                    "success": True,
                    "product": serialize_product(product),
                }

        except Exception:
            logger.exception("Product detail retrieval failed.")
            return {
                "success": False,
                "message": "Unable to retrieve product details right now.",
            }

    @tool
    def compare_products(product_ids: str) -> dict:
        """Compare multiple products by their comma-separated product IDs."""
        product_ids = (product_ids or "").strip()
        if not product_ids:
            return {
                "success": False,
                "message": "At least one product ID is required.",
            }

        try:
            ids = []
            for part in product_ids.split(","):
                part = part.strip()
                if not part:
                    continue
                try:
                    ids.append(int(part))
                except ValueError:
                    return {
                        "success": False,
                        "message": f"Invalid product ID: {part}.",
                    }

            if not ids:
                return {
                    "success": False,
                    "message": "At least one valid product ID is required.",
                }

            if len(ids) > 10:
                return {
                    "success": False,
                    "message": "Up to 10 products can be compared at once.",
                }

            with SessionLocal() as session:
                results = []
                not_found = []
                for pid in ids:
                    product = get_product(session, pid)
                    if product is None:
                        not_found.append(pid)
                    else:
                        results.append(serialize_product(product))

                return {
                    "success": True,
                    "products": results,
                    "not_found": not_found,
                    "count": len(results),
                }

        except Exception:
            logger.exception("Product comparison failed.")
            return {
                "success": False,
                "message": "Unable to compare products right now.",
            }

    return [
        search_products,
        search_products_by_category,
        get_product_details,
        compare_products,
    ]