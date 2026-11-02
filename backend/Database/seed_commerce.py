"""Idempotently seed the catalogue and optional activity for existing customers."""

import argparse
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from sqlalchemy import func, or_, select
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
    (205, "Allen Solly", "Oxford Button-Down Shirt", "Sky Blue", 1899, "Cotton, regular fit", "men", "/assets/cat_men_hi.jpg"),
    (206, "Manyavar", "Textured Nehru Jacket", "Midnight Navy", 4599, "Woven festive jacket", "men", "/assets/cat_men_hi.jpg"),
    (207, "Biba", "Printed Anarkali Kurta", "Marigold", 2499, "Rayon blend, three-quarter sleeves", "women", "/assets/cat_women_hi.jpg"),
    (208, "Aurelia", "Straight Fit Cotton Trousers", "Charcoal", 1599, "Mid-rise, stretch cotton", "women", "/assets/cat_women_hi.jpg"),
    (209, "Libas", "Embroidered Festive Dupatta", "Rose Pink", 1299, "Lightweight woven fabric", "women", "/assets/cat_women_hi.jpg"),
    (210, "Bata", "Everyday Leather Formal Shoes", "Black", 3299, "Padded insole, lace-up", "footwear", "/assets/cat_sports_hi.jpg"),
    (211, "Campus", "North Plus Running Shoes", "Grey Lime", 2199, "Lightweight mesh upper", "footwear", "/assets/cat_sports_hi.jpg"),
    (212, "Metro", "Block Heel Sandals", "Tan", 1799, "Adjustable ankle strap", "footwear", "/assets/cat_sports_hi.jpg"),
    (213, "Fossil", "Minimalist Leather Wallet", "Dark Brown", 2495, "Six card slots with coin pocket", "accessories", "/assets/cat_men_hi.jpg"),
    (214, "Accessorize", "Everyday Pendant Necklace", "Gold Tone", 1199, "Nickel-free alloy", "accessories", "/assets/cat_women_hi.jpg"),
    (215, "Safari", "Aero Cabin Trolley", "Deep Teal", 5499, "55 cm hard-shell cabin case", "accessories", "/assets/cat_sports_hi.jpg"),
    (216, "Prestige", "Stainless Steel Cookware Set", "Silver", 3299, "Three-piece induction-ready set", "home-living", "/assets/cat_home_living_hi.jpg"),
    (217, "Sleepyhead", "Contour Memory Foam Pillow", "White", 1499, "Breathable removable cover", "home-living", "/assets/cat_home_living_hi.jpg"),
    (218, "Home Centre", "Woven Cotton Cushion Covers", "Terracotta", 899, "Set of two, 40 cm square", "home-living", "/assets/cat_home_living_hi.jpg"),
    (219, "Philips", "Warm Glow LED Desk Lamp", "Matte White", 1899, "Adjustable neck, energy-saving LED", "home-living", "/assets/cat_electronics_hi.jpg"),
    (220, "Minimalist", "Niacinamide Face Serum", "30 ml", 599, "Fragrance-free daily serum", "beauty", "/assets/cat_beauty_hi.jpg"),
    (221, "Lakme", "Matte Lip Color", "Berry Rose", 749, "Long-wear creamy matte finish", "beauty", "/assets/cat_beauty_hi.jpg"),
    (222, "Mamaearth", "Aloe Vera Face Wash", "100 ml", 299, "Gentle daily cleanser", "beauty", "/assets/cat_beauty_hi.jpg"),
    (223, "Samsung", "Galaxy Buds FE", "Graphite", 7999, "Active noise cancellation", "electronics", "/assets/cat_electronics_hi.jpg"),
    (224, "Logitech", "Pebble Wireless Mouse", "Off White", 1795, "Bluetooth and USB receiver", "electronics", "/assets/cat_electronics_hi.jpg"),
    (225, "JBL", "Go 4 Portable Speaker", "Blue", 4499, "Water-resistant compact speaker", "electronics", "/assets/cat_electronics_hi.jpg"),
    (226, "Classmate", "Hardbound Ruled Notebook", "A5 Blue", 180, "Pack of three, 160 pages each", "stationery", "/assets/cat_books_hi.jpg"),
    (227, "Parker", "Jotter Ball Pen Set", "Blue Ink", 650, "Set of three refillable pens", "stationery", "/assets/cat_books_hi.jpg"),
    (228, "Faber-Castell", "Colour Pencil Set", "24 Shades", 420, "Break-resistant pencils", "stationery", "/assets/cat_books_hi.jpg"),
)

TARGET_CUSTOMERS = ("user1@gmail.com", "user3@gmail.com")


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
                is_active=True, attributes={"catalogue_id": product_id, "variant": variant_name},
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


def seed_demo_activity(session, user_id: int, expected_email: str, variant_ids: dict[str, int]) -> None:
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
    skus = tuple(variant_ids)
    cart_skus = [skus[(user_id + offset) % len(skus)] for offset in range(6)]
    for sku in cart_skus:
        variant_id = variant_ids[sku]
        if session.scalar(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.variant_id == variant_id)) is None:
            session.add(CartItem(cart_id=cart.id, variant_id=variant_id, quantity=1 + (user_id + len(sku)) % 2))
    session.flush()

    statuses = ("delivered", "delivered", "in_transit", "shipped", "processing", "confirmed", "placed", "cancelled")
    orders = list(session.scalars(select(CommerceOrder).where(CommerceOrder.user_id == user_id)))
    order_items = list(session.scalars(
        select(CommerceOrderItem).join(CommerceOrder).where(CommerceOrder.user_id == user_id)
    ))
    item_count = len(order_items)
    seeded_index = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    while (len(orders) < 8 or item_count < 15) and len(orders) < 10:
        seeded_index += 1
        order_number = f"FK-DEMO-{user_id}-{seeded_index:03d}"
        order = session.scalar(select(CommerceOrder).where(CommerceOrder.order_number == order_number))
        if order is not None:
            if order.user_id != user_id:
                raise ValueError(f"Seed order number is already owned by another account: {order_number}")
            orders.append(order)
            item_count += session.scalar(select(func.count()).select_from(CommerceOrderItem).where(CommerceOrderItem.order_id == order.id))
            continue
        slot = seeded_index - 1
        status = statuses[slot % len(statuses)]
        ordered_at = now - timedelta(days=89 - slot * 8, hours=(user_id + slot) % 12)
        order = CommerceOrder(
            order_number=order_number, user_id=user_id, status=status,
            created_at=ordered_at, updated_at=ordered_at,
        )
        session.add(order)
        session.flush()
        line_count = 3 if slot in (1, 5) else 2
        selected_skus = [skus[(user_id + slot * 3 + line) % len(skus)] for line in range(line_count)]
        made_items = []
        for line, sku in enumerate(selected_skus):
            variant = session.scalar(select(ProductVariant).where(ProductVariant.id == variant_ids[sku]))
            item = CommerceOrderItem(
                order_id=order.id, variant_id=variant.id,
                product_name=variant.product.name, variant_name=variant.name, sku=variant.sku,
                quantity=1 + ((slot + line) % 2), unit_price=variant.price,
            )
            session.add(item)
            made_items.append(item)
        session.flush()
        orders.append(order)
        item_count += len(made_items)

        if status in {"shipped", "in_transit", "delivered"}:
            tracking_status = status
            shipped_at = ordered_at + timedelta(days=1)
            delivered_at = ordered_at + timedelta(days=4) if status == "delivered" else None
            session.add(Shipment(
                order_id=order.id, tracking_reference=f"FK-TRK-{user_id}-{seeded_index:03d}",
                status=tracking_status, shipped_at=shipped_at, delivered_at=delivered_at,
                created_at=shipped_at,
            ))

    # Keep previously seeded rows inside the requested 30-to-90-day window
    # when a seed was first run at the upper boundary.
    for order in orders:
        if not order.order_number.startswith(f"FK-DEMO-{user_id}-") or order.created_at is None:
            continue
        age_days = (now - order.created_at).total_seconds() / 86400
        if age_days >= 90 or age_days < 30:
            slot = int(order.order_number.rsplit("-", 1)[-1]) - 1
            ordered_at = now - timedelta(days=max(31, 89 - slot * 8), hours=(user_id + slot) % 12)
            order.created_at = ordered_at
            order.updated_at = ordered_at

    session.flush()
    return_rows = list(session.scalars(
        select(ReturnRequest).join(CommerceOrder).where(CommerceOrder.user_id == user_id)
    ))
    return_statuses = ("requested", "approved", "completed")
    delivered_orders = list(session.scalars(
        select(CommerceOrder).where(CommerceOrder.user_id == user_id, CommerceOrder.status == "delivered")
        .order_by(CommerceOrder.created_at)
    ))
    for index in range(len(return_rows), min(3, len(delivered_orders))):
        order = delivered_orders[index]
        order_item = session.scalar(
            select(CommerceOrderItem).where(CommerceOrderItem.order_id == order.id).order_by(CommerceOrderItem.id)
        )
        if order_item is not None:
            session.add(ReturnRequest(
                order_id=order.id, order_item_id=order_item.id, quantity=1,
                reason=("Changed my mind", "Item arrived with a damaged box", "Size did not fit")[index],
                status=return_statuses[index], requested_at=order.created_at + timedelta(days=5),
            ))

    for request, delivered_at in session.execute(
        select(ReturnRequest, Shipment.delivered_at)
        .join(CommerceOrder, ReturnRequest.order_id == CommerceOrder.id)
        .join(Shipment, Shipment.order_id == CommerceOrder.id)
        .where(
            CommerceOrder.user_id == user_id,
            CommerceOrder.order_number.like(f"FK-DEMO-{user_id}-%"),
            Shipment.delivered_at.is_not(None),
        )
    ):
        if request.requested_at <= delivered_at:
            request.requested_at = delivered_at + timedelta(days=1)
    session.flush()


def seed_target_customers(session, variant_ids: dict[str, int]) -> None:
    for email in TARGET_CUSTOMERS:
        user = session.scalar(select(User).where(func.lower(User.email) == email))
        if user is None:
            raise LookupError(f"Required existing customer account not found: {email}")
        seed_demo_activity(session, user.id, email, variant_ids)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update-catalog", action="store_true", help="Intentionally update seeded names, descriptions, categories, and prices")
    parser.add_argument("--populate-known-customers", action="store_true", help="Add rerunnable sample activity for the two existing Flatkart customer accounts")
    parser.add_argument("--allow-development-database", action="store_true", help="Explicitly authorize sample activity in the configured development database")
    args = parser.parse_args()
    if args.populate_known_customers:
        if not args.allow_development_database:
            parser.error("customer activity requires --allow-development-database")
        if app_environment() != "development":
            parser.error("customer activity is allowed only when APP_ENV=development")
        database_name = urlparse(DATABASE_URL).path.strip("/").split("/")[-1]
        if database_name.casefold() != "flatkart":
            parser.error("--populate-known-customers is restricted to the configured flatkart database")
    try:
        with SessionLocal.begin() as session:
            variant_ids = seed_catalog(session, update_catalog=args.update_catalog)
            if args.populate_known_customers:
                seed_target_customers(session, variant_ids)
    except (LookupError, RuntimeError, ValueError, SQLAlchemyError) as exc:
        parser.error(f"seed transaction rolled back: {exc}")


if __name__ == "__main__":
    main()
