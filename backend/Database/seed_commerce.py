"""Idempotently seed the catalogue; optional demo activity requires an existing user."""

import argparse
import re

from sqlalchemy import select

from backend.Database.connection import SessionLocal
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
    ("Fashion", "fashion", 1),
    ("Accessories", "accessories", 2),
    ("Footwear", "footwear", 3),
    ("Home & Living", "home-living", 4),
    ("Beauty", "beauty", 5),
    ("Electronics", "electronics", 6),
    ("Stationery", "stationery", 7),
)

PRODUCTS = (
    (1, "Roadster", "Men Sold Casual Shirt", "Forest Green", 1299, "M to XXL", "fashion", "/assets/prod_roadster_hi.jpg"),
    (2, "Hidesign", "Aria Tote Bag", "Beige", 3499, "1 main compartment", "accessories", "/assets/prod_hidesign_hi.jpg"),
    (3, "Puma", "Unisex Smashic", "Sneakers", 2799, "Sizes 6 to 11", "footwear", "/assets/prod_puma_hi.jpg"),
    (4, "Timex", "Analog Watch", "Black Dial", 1895, "Water resistant", "accessories", "/assets/prod_timex_hi.jpg"),
    (101, "FabIndia", "Handcrafted Linen Kurta", "Natural Ecru", 2199, "Pure linen, regular fit", "fashion", "/assets/cat_men.png"),
    (102, "Woodland", "Camel Leather Loafers", "Ochre Brown", 3995, "Cushioned footbed", "footwear", "/assets/cat_sports_hi.jpg"),
    (103, "Nykaa Naturals", "Botanical Face Elixir", "50ml Glass Bottle", 899, "Cold-pressed organic", "beauty", "/assets/cat_beauty.png"),
    (104, "boAt", "Airdopes Active ANC", "Matte Forest", 1999, "Up to 40 hours battery", "electronics", "/assets/cat_electronics_hi.jpg"),
    (201, "H&M Home", "Stoneware Coffee Mug Set", "Earthy Clay", 1199, "Set of four, matte glaze", "home-living", "/assets/cat_home_living_hi.jpg"),
    (202, "W for Woman", "Embroidered Cotton Tunic", "Sage Green", 1799, "Breathable woven cotton", "fashion", "/assets/cat_women_hi.jpg"),
    (203, "Cross", "Classic Century Rollerball", "Brushed Brass", 2450, "Refillable ink cartridge", "stationery", "/assets/cat_books_hi.jpg"),
    (204, "Levi's", "Vintage Straight Fit Denim", "Washed Indigo", 2899, "100% cotton, non-stretch", "fashion", "/assets/cat_men_hi.jpg"),
)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def seed_catalog(session) -> dict[str, int]:
    categories = {}
    variant_ids = {}
    for name, slug, order in CATEGORIES:
        category = session.scalar(select(ProductCategory).where(ProductCategory.slug == slug))
        if category is None:
            category = ProductCategory(name=name, slug=slug, display_order=order, is_active=True)
            session.add(category)
            session.flush()
        else:
            category.name, category.display_order, category.is_active = name, order, True
        categories[slug] = category

    for product_id, brand, name, variant_name, rupees, description, category_slug, image_key in PRODUCTS:
        slug = slugify(name)
        product = session.scalar(select(Product).where(Product.slug == slug))
        if product is None:
            product = Product(
                name=name, slug=slug, brand=brand,
                description=description, category_id=categories[category_slug].id,
                is_active=True, attributes={"catalogue_id": product_id},
            )
            session.add(product)
            session.flush()
        else:
            product.name, product.brand, product.description = name, brand, description
            product.category_id, product.is_active = categories[category_slug].id, True
            product.attributes = {"catalogue_id": product_id}

        sku = f"FK-DEMO-{product_id}"
        variant = session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))
        if variant is None:
            variant = ProductVariant(
                product_id=product.id, sku=sku, name=variant_name,
                price=rupees, is_available=True,
            )
            session.add(variant)
            session.flush()
        else:
            variant.product_id, variant.name = product.id, variant_name
            variant.price, variant.is_available = rupees, True

        inventory = session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        if inventory is None:
            session.add(Inventory(
                variant_id=variant.id, available_stock=12, reserved_stock=0, stock_status="in_stock"
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


def seed_demo_activity(session, user_id: int) -> None:
    user = session.get(User, user_id)
    if user is None:
        raise LookupError(f"User {user_id} does not exist; demo activity was not seeded")

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
    parser.add_argument("--user-id", type=int, help="Add repeatable demo cart/order/return activity for this existing user")
    args = parser.parse_args()
    with SessionLocal.begin() as session:
        seed_catalog(session)
        if args.user_id is not None:
            seed_demo_activity(session, args.user_id)


if __name__ == "__main__":
    main()
