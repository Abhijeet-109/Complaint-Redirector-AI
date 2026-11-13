"""Product agent tools."""

import logging

from langchain.tools import tool
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.Database.connection import SessionLocal
from backend.Database.models import Inventory, Product
from backend.Database.services import (
    get_product,
    get_category_tree,
    list_categories,
    list_products,
)

logger = logging.getLogger(__name__)


def serialize_variant(variant, inventory=None):
    available_stock = inventory.available_stock if inventory else None
    return {
        "variant_id": variant.id,
        "sku": variant.sku,
        "name": variant.name,
        "price": str(variant.price),
        "mrp": str(variant.mrp) if variant.mrp is not None else None,
        "is_available": bool(variant.is_available and available_stock and available_stock > 0),
        "variant_enabled": variant.is_available,
        "available_stock": available_stock,
        "stock_status": inventory.stock_status if inventory else None,
    }


def _serialize_products(session, products):
    variants = [variant for product in products for variant in product.variants]
    variant_ids = [variant.id for variant in variants]
    inventory_by_variant = {}
    if variant_ids:
        inventory_by_variant = {
            row.variant_id: row
            for row in session.scalars(
                select(Inventory).where(Inventory.variant_id.in_(variant_ids))
            ).all()
        }
    categories = {category.id: category for category in list_categories(session, active_only=True)}
    return [
        serialize_product(product, inventory_by_variant, categories)
        for product in products
    ]


def serialize_product(product, inventory_by_variant=None, categories=None):
    inventory_by_variant = inventory_by_variant or {}
    categories = categories or {}
    category = categories.get(product.category_id)
    result = {
        "product_id": product.id,
        "name": product.name,
        "brand": product.brand,
        "description": product.description,
        "short_description": product.short_description,
        "highlights": product.highlights or [],
        "specifications": product.specifications or {},
        "category": category.name if category else None,
        "category_id": category.id if category else None,
        "variant_image_mode": (
            product.attributes.get("variant_image_mode")
            if isinstance(product.attributes, dict)
            and product.attributes.get("variant_image_mode") in {"shared", "per_variant"}
            else "per_variant"
        ),
        # The public catalogue API exposes storage_key under the customer-facing
        # `url` field. Keep that established representation; never expose its
        # internal column name or provider credentials.
        "images": [
            {
                "id": image.id,
                "url": image.storage_key,
                "alt_text": image.alt_text,
                "display_order": image.display_order,
                "variant_id": image.variant_id,
            }
            for image in product.images
        ],
    }

    result["variants"] = [
        serialize_variant(variant, inventory_by_variant.get(variant.id))
        for variant in sorted(product.variants, key=lambda variant: variant.id)
    ]

    return result


def _find_category_id_by_name(session, name):
    term = name.strip()
    if not term:
        return None

    categories = list_categories(session, active_only=True)
    for category in categories:
        if category.name.casefold() == term.casefold() or category.slug.casefold() == term.casefold():
            return category.id

    return None


def _public_category(node):
    return {
        "category_id": node["id"],
        "name": node["name"],
        "slug": node["slug"],
        "children": [_public_category(child) for child in node["children"]],
    }


def _category_count(nodes):
    return sum(1 + _category_count(node["children"]) for node in nodes)


def build_product_tools():

    @tool
    def search_products(query: str) -> dict:
        """Read-only search of the active product catalogue by name, keyword, or brand."""
        if not isinstance(query, str) or not query.strip():
            return {
                "success": False,
                "message": "A search term is required.",
            }
        query = query.strip()
        if len(query) > 120:
            return {"success": False, "message": "Search terms cannot exceed 120 characters."}

        try:
            with SessionLocal() as session:
                products = list_products(session, search=query, limit=50)
                serialized = _serialize_products(session, products)
                return {
                    "success": True,
                    "query": query,
                    "products": serialized,
                    "count": len(serialized),
                }

        except Exception:
            logger.exception("Product search failed.")
            return {
                "success": False,
                "message": "Unable to search products right now.",
            }

    @tool
    def search_products_by_category(category: str) -> dict:
        """Read-only search for active products in an active category name or slug."""
        if not isinstance(category, str) or not category.strip():
            return {
                "success": False,
                "message": "A category name is required.",
            }
        category = category.strip()
        if len(category) > 140:
            return {"success": False, "message": "Category names cannot exceed 140 characters."}

        try:
            with SessionLocal() as session:
                category_id = _find_category_id_by_name(session, category)
                if category_id is None:
                    return {
                        "success": False,
                        "message": "Category not found.",
                    }

                products = list_products(session, category_id=category_id, limit=50)
                serialized = _serialize_products(session, products)
                return {
                    "success": True,
                    "category": category,
                    "products": serialized,
                    "count": len(serialized),
                    **({"message": "No active products were found in this category."} if not serialized else {}),
                }

        except Exception:
            logger.exception("Product category search failed.")
            return {
                "success": False,
                "message": "Unable to search products by category right now.",
            }

    @tool
    def get_product_details(product_id: int | bool) -> dict:
        """Read-only active-product details, including variants, prices, and stock."""
        if (
            isinstance(product_id, bool)
            or not isinstance(product_id, int)
            or not 1 <= product_id <= 2_147_483_647
        ):
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

                serialized = _serialize_products(session, [product])[0]
                return {
                    "success": True,
                    "product": serialized,
                }

        except Exception:
            logger.exception("Product detail retrieval failed.")
            return {
                "success": False,
                "message": "Unable to retrieve product details right now.",
            }

    @tool
    def compare_products(product_ids: str) -> dict:
        """Read-only comparison of active products by comma-separated product IDs."""
        if not isinstance(product_ids, str) or not product_ids.strip():
            return {
                "success": False,
                "message": "At least one product ID is required.",
            }
        product_ids = product_ids.strip()

        try:
            ids = []
            if not isinstance(product_ids, str):
                return {"success": False, "message": "Product IDs must be a comma-separated string."}
            if len(product_ids) > 120:
                return {"success": False, "message": "Product ID input is too long."}
            for part in product_ids.split(","):
                part = part.strip()
                if not part:
                    return {"success": False, "message": "Product IDs must be comma-separated positive integers."}
                try:
                    product_id = int(part)
                except ValueError:
                    return {
                        "success": False,
                        "message": f"Invalid product ID: {part}.",
                    }
                if product_id <= 0 or product_id > 2_147_483_647:
                    return {"success": False, "message": "Product IDs must be positive 32-bit integers."}
                if product_id not in ids:
                    ids.append(product_id)

            if not ids:
                return {
                    "success": False,
                    "message": "At least one valid product ID is required.",
                }

            if len(ids) > 5:
                return {
                    "success": False,
                    "message": "Up to 5 products can be compared at once.",
                }

            with SessionLocal() as session:
                products = session.scalars(
                    select(Product)
                    .options(selectinload(Product.variants), selectinload(Product.images))
                    .where(Product.id.in_(ids), Product.is_active.is_(True))
                ).all()
                products_by_id = {product.id: product for product in products}
                ordered_products = [products_by_id[pid] for pid in ids if pid in products_by_id]
                results = _serialize_products(session, ordered_products)
                not_found = [pid for pid in ids if pid not in products_by_id]

                return {
                    "success": True,
                    "products": results,
                    "not_found": not_found,
                    "unavailable": not_found,
                    "count": len(results),
                }

        except Exception:
            logger.exception("Product comparison failed.")
            return {
                "success": False,
                "message": "Unable to compare products right now.",
            }

    @tool
    def list_product_categories() -> dict:
        """Read-only list of customer-visible active product categories and hierarchy."""
        try:
            with SessionLocal() as session:
                categories = get_category_tree(session, active_only=True)
                public_categories = [_public_category(node) for node in categories]
                return {
                    "success": True,
                    "categories": public_categories,
                    "count": _category_count(categories),
                }
        except Exception:
            logger.exception("Product category listing failed.")
            return {"success": False, "message": "Unable to retrieve product categories right now."}

    return [
        search_products,
        search_products_by_category,
        get_product_details,
        compare_products,
        list_product_categories,
    ]
