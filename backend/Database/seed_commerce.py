"""Idempotently seed the catalogue; optional demo activity requires an existing user."""

import argparse
import re
from urllib.parse import urlparse

from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError

from backend.Database.connection import DATABASE_URL, SessionLocal
from backend.security_config import app_environment
from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    CommerceOrderItem,
    Inventory,
    Product,
    ProductCategory,
    ProductImage,
    ProductVariant,
    ReturnRequest,
    Shipment,
    User,
)


CATEGORIES = (
    {"name": "Fashion", "slug": "fashion", "parent": None, "order": 1},
    {"name": "Men", "slug": "men", "parent": "fashion", "order": 1},
    {"name": "Women", "slug": "women", "parent": "fashion", "order": 2},
    {"name": "Accessories", "slug": "accessories", "parent": None, "order": 2},
    {"name": "Footwear", "slug": "footwear", "parent": "fashion", "order": 3},
    {"name": "Home & Living", "slug": "home-living", "parent": None, "order": 3},
    {"name": "Beauty", "slug": "beauty", "parent": None, "order": 4},
    {"name": "Electronics", "slug": "electronics", "parent": None, "order": 5},
    {"name": "Stationery", "slug": "stationery", "parent": None, "order": 6},
)

PRODUCTS = (
    (1, "Roadster", "Men Sold Casual Shirt", "Forest Green", 1299, "M to XXL", "men", "/assets/prod_roadster_hi.jpg"),
    (2, "Hidesign", "Aria Tote Bag", "Beige", 3499, "1 main compartment", "accessories", "/assets/prod_hidesign_hi.jpg"),
    (3, "Puma", "Unisex Smashic", "Sneakers", 2799, "Sizes 6 to 11", "footwear", "/assets/prod_puma_hi.jpg"),
    (4, "Timex", "Analog Watch", "Black Dial", 1895, "Water resistant", "accessories", "/assets/prod_timex_hi.jpg"),
    (101, "FabIndia", "Handcrafted Linen Kurta", "Natural Ecru", 2199, "Pure linen, regular fit", "men", "/assets/cat_men.png"),
    (102, "Woodland", "Camel Leather Loafers", "Ochre Brown", 3995, "Cushioned footbed", "footwear", "/assets/cat_sports_hi.jpg"),
    (103, "Nykaa Naturals", "Botanical Face Elixir", "50ml Glass Bottle", 899, "Cold-pressed organic", "beauty", "/assets/cat_beauty.png"),
    (104, "boAt", "Airdopes Active ANC", "Matte Forest", 1999, "Up to 40 hours battery", "electronics", "/assets/cat_electronics_hi.jpg"),
    (201, "H&M Home", "Stoneware Coffee Mug Set", "Earthy Clay", 1199, "Set of four, matte glaze", "home-living", "/assets/cat_home_living_hi.jpg"),
    (202, "W for Woman", "Embroidered Cotton Tunic", "Sage Green", 1799, "Breathable woven cotton", "women", "/assets/cat_women_hi.jpg"),
    (203, "Cross", "Classic Century Rollerball", "Brushed Brass", 2450, "Refillable ink cartridge", "stationery", "/assets/cat_books_hi.jpg"),
    (204, "Levi's", "Vintage Straight Fit Denim", "Washed Indigo", 2899, "100% cotton, non-stretch", "men", "/assets/cat_men_hi.jpg"),
)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def seed_catalog(session, *, update_catalog: bool = False) -> dict[str, int]:
    categories = {}
    variant_ids = {}
    pending = {row["slug"]: row for row in CATEGORIES}
    while pending:
        progressed = False
        for slug, row in list(pending.items()):
            parent_slug = row["parent"]
            parent = categories.get(parent_slug) if parent_slug else None
            if parent_slug and parent is None:
                parent = session.scalar(select(ProductCategory).where(ProductCategory.slug == parent_slug))
            if parent_slug and parent is None:
                continue

            category = session.scalar(select(ProductCategory).where(ProductCategory.slug == slug))
            if category is None:
                category = ProductCategory(
                    name=row["name"],
                    slug=slug,
                    parent_id=parent.id if parent else None,
                    display_order=row["order"],
                    is_active=True,
                )
                session.add(category)
                session.flush()
            elif update_catalog:
                category.name = row["name"]
                category.display_order = row["order"]
                category.parent_id = parent.id if parent else None
            categories[slug] = category
            pending.pop(slug)
            progressed = True

        if not progressed:
            raise ValueError("Seed categories contain a missing parent or a cycle")

    for product_id, brand, name, variant_name, rupees, description, category_slug, image_key in PRODUCTS:
        slug = slugify(name)
        product = session.scalar(
            select(Product).where(
                or_(
                    Product.slug == slug,
                    Product.attributes["catalogue_id"].as_integer() == product_id,
                )
            )
        )
        if product is None:
            product = Product(
                name=name, slug=slug, brand=brand,
                description=description, category_id=categories[category_slug].id,
                is_active=True, attributes={"catalogue_id": product_id},
            )
            session.add(product)
            session.flush()
        elif update_catalog:
            product.name, product.slug, product.brand, product.description = name, slug, brand, description
            product.category_id = categories[category_slug].id
            product.attributes = {**(product.attributes or {}), "catalogue_id": product_id}

        sku = f"FK-DEMO-{product_id}"
        variant = session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))
        if variant is None:
            variant = ProductVariant(
                product_id=product.id, sku=sku, name=variant_name,
                price=rupees, is_available=True,
            )
            session.add(variant)
            session.flush()
        elif update_catalog:
            variant.product_id, variant.name = product.id, variant_name
            variant.price = rupees

        inventory = session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        if inventory is None:
            session.add(Inventory(
                variant_id=variant.id,
                available_stock=12,
                total_stock=12,
                reserved_stock=0,
                stock_status="in_stock",
            ))

        image = session.scalar(
            select(ProductImage).where(ProductImage.product_id == product.id, ProductImage.storage_key == image_key)
        )
        if image is None:
            session.add(ProductImage(
                product_id=product.id, storage_key=image_key, provider="frontend_asset",
                alt_text=f"{brand} {name}", display_order=0,
            ))
        variant_ids[sku] = variant.id
    session.flush()
    return variant_ids


def seed_demo_activity(session, user_id: int, expected_email: str) -> None:
    if app_environment() == "production":
        raise ValueError("Demo activity is disabled in production")
    if not expected_email or expected_email.strip() != expected_email:
        raise ValueError("A non-empty expected customer email is required")
    user = session.get(User, user_id)
    if user is None or user.role != "user" or user.email.casefold() != expected_email.casefold():
        raise LookupError("The supplied ID and expected email do not identify the same customer account")

    cart = session.scalar(select(Cart).where(Cart.user_id == user_id, Cart.status == "active"))
    if cart is None:
        cart = Cart(user_id=user_id, status="active")
        session.add(cart)
        session.flush()
    for sku in ("FK-DEMO-1", "FK-DEMO-3"):
        variant = session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))
        if session.scalar(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.variant_id == variant.id)) is None:
            session.add(CartItem(cart_id=cart.id, variant_id=variant.id, quantity=1))

    order_number = f"FK-SEED-{user_id}-001"
    order = session.scalar(select(CommerceOrder).where(CommerceOrder.order_number == order_number))
    if order is None:
        order = CommerceOrder(order_number=order_number, user_id=user_id, status="shipped")
        session.add(order)
        session.flush()
        variants = [session.scalar(select(ProductVariant).where(ProductVariant.sku == sku)) for sku in ("FK-DEMO-1", "FK-DEMO-3")]
        for variant in variants:
            session.add(CommerceOrderItem(
                order_id=order.id, variant_id=variant.id, product_name=variant.product.name,
                variant_name=variant.name, sku=variant.sku, quantity=1, unit_price=variant.price,
            ))
        session.flush()
        session.add(Shipment(order_id=order.id, tracking_reference=f"TRACK-{user_id}-001", status="in_transit"))
        first_item = session.scalar(select(CommerceOrderItem).where(CommerceOrderItem.order_id == order.id).order_by(CommerceOrderItem.id))
        session.add(ReturnRequest(
            order_id=order.id, order_item_id=first_item.id, quantity=1,
            reason="Demo return request for isolated testing", status="requested",
        ))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update-catalog", action="store_true", help="Intentionally update seeded names, descriptions, categories, and prices")
    parser.add_argument("--user-id", type=int, help="Existing test customer ID for optional demo activity")
    parser.add_argument("--expected-user-email", help="Exact email to verify the selected test customer")
    parser.add_argument("--allow-demo-activity", action="store_true", help="Explicitly permit sample cart/order/return records in an isolated test database")
    args = parser.parse_args()
    demo_args = (args.user_id, args.expected_user_email, args.allow_demo_activity)
    if any(demo_args) and not all(demo_args):
        parser.error("demo activity requires --user-id, --expected-user-email, and --allow-demo-activity")
    if args.allow_demo_activity:
        database_name = urlparse(DATABASE_URL).path.strip("/").split("/")[-1]
        if not re.search(r"(^|[_-])(test|testing|scratch|disposable)([_-]|$)", database_name, re.IGNORECASE):
            parser.error("demo activity is limited to databases named as isolated test or scratch databases")
    try:
        with SessionLocal.begin() as session:
            seed_catalog(session, update_catalog=args.update_catalog)
            if args.allow_demo_activity:
                seed_demo_activity(session, args.user_id, args.expected_user_email)
    except (LookupError, RuntimeError, ValueError, SQLAlchemyError) as exc:
        parser.error(f"seed transaction rolled back: {exc}")


if __name__ == "__main__":
    main()
