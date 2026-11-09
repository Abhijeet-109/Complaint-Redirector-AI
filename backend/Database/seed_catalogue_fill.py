"""Dry-run-first seeder for the approved Flatkart catalogue batch.

Run a read-only preview with ``python -m backend.Database.seed_catalogue_fill``.
Writes require ``--execute --confirm-approved-products`` and are restricted to
the configured development database named ``flatkart``.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from decimal import Decimal
from urllib.parse import urlsplit

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, inspect, select, text

from backend.Database.connection import DATABASE_URL, SessionLocal, engine
from backend.Database.models import (
    CartItem,
    CommerceOrder,
    Inventory,
    Product,
    ProductCategory,
    ProductImage,
    ProductVariant,
)


EXPECTED_REVISION = "3d9a4ec7b6f2"
MAX_PRODUCTS_PER_CATEGORY = 15
SEED_BATCH = "approved_catalogue_v1"
PAYMENT_METHODS = ["cod", "upi", "netbanking"]
CATEGORY_CODES = {
    "men": "MEN",
    "women": "WOM",
    "accessories": "ACC",
    "footwear": "FTW",
    "home-living": "HOME",
    "beauty": "BEA",
    "electronics": "ELE",
    "stationery": "STA",
}

# name, slug, category, image mode, product code, variants, specification label
# and values. Variant records are (display name, stable SKU option code, price).
APPROVED_PRODUCTS = (
    ("Slim Fit Stretch Chinos", "slim-fit-stretch-chinos", "men", "shared", "CHINO", (("Waist 30", "30", 1299), ("Waist 32", "32", 1299), ("Waist 34", "34", 1299), ("Waist 36", "36", 1299)), "Waist options", "30, 32, 34, 36"),
    ("Relaxed Fit Graphic T-Shirt", "relaxed-fit-graphic-t-shirt", "men", "per_variant", "GTEETEE", (("Black", "BLACK", 699), ("White", "WHITE", 749)), "Colour options", "Black, White"),
    ("Solid Oxford Casual Shirt", "solid-oxford-casual-shirt", "men", "per_variant", "OXFORD", (("Sky Blue", "SKYBLUE", 1199), ("White", "WHITE", 1249)), "Colour options", "Sky Blue, White"),
    ("Fleece-Lined Sweatshirt", "fleece-lined-sweatshirt", "men", "shared", "SWEAT", (("Regular", "REGULAR", 999), ("Fleece-Lined", "FLEECE", 1299)), "Style options", "Regular, Fleece-Lined"),
    ("Everyday Track Pants", "everyday-track-pants", "men", "shared", "TRACK", (("Regular", "REGULAR", 899), ("Premium Fabric", "PREMIUM", 1099)), "Style options", "Regular, Premium Fabric"),

    ("Floral Printed A-Line Kurti", "floral-printed-a-line-kurti", "women", "shared", "KURTI", (("S", "S", 899), ("M", "M", 899), ("L", "L", 899), ("XL", "XL", 899), ("XXL", "XXL", 899)), "Size options", "S, M, L, XL, XXL"),
    ("Straight Fit Women's Jeans", "straight-fit-womens-jeans", "women", "shared", "WJEANS", (("Waist 28", "28", 1399), ("Waist 30", "30", 1399), ("Waist 32", "32", 1399), ("Waist 34", "34", 1399)), "Waist options", "28, 30, 32, 34"),
    ("Ribbed Casual Top", "ribbed-casual-top", "women", "shared", "RIBTOP", (("Single", "SINGLE", 599), ("Pack of 2", "PACK2", 999)), "Pack options", "Single, Pack of 2"),
    ("Cotton Co-ord Set", "cotton-co-ord-set", "women", "shared", "COORD", (("S", "S", 1599), ("M", "M", 1599), ("L", "L", 1599), ("XL", "XL", 1599)), "Size options", "S, M, L, XL"),
    ("Printed Midi Dress", "printed-midi-dress", "women", "shared", "MIDIDRESS", (("S", "S", 1299), ("M", "M", 1299), ("L", "L", 1299), ("XL", "XL", 1299)), "Size options", "S, M, L, XL"),
    ("Everyday Cotton Leggings", "everyday-cotton-leggings", "women", "shared", "LEGGING", (("Single", "SINGLE", 399), ("Pack of 2", "PACK2", 699)), "Pack options", "Single, Pack of 2"),
    ("Printed Georgette Saree", "printed-georgette-saree", "women", "per_variant", "SAREE", (("Design A", "DESIGNA", 1499), ("Design B", "DESIGNB", 1699)), "Design options", "Design A, Design B"),

    ("Everyday Laptop Backpack", "everyday-laptop-backpack", "accessories", "shared", "BACKPACK", (("25L", "25L", 1499), ("32L", "32L", 1899)), "Capacity options", "25L, 32L"),
    ("Travel Duffel Bag", "travel-duffel-bag", "accessories", "shared", "DUFFEL", (("30L", "30L", 999), ("45L", "45L", 1299)), "Capacity options", "30L, 45L"),
    ("Polarized Sunglasses", "polarized-sunglasses", "accessories", "per_variant", "SUNGLASS", (("Classic", "CLASSIC", 899), ("Large Frame", "LARGE", 999)), "Frame options", "Classic, Large Frame"),
    ("Minimalist Card Holder", "minimalist-card-holder", "accessories", "shared", "CARDHOLDER", (("4-slot", "4SLOT", 399), ("8-slot", "8SLOT", 549)), "Slot options", "4-slot, 8-slot"),
    ("Stainless Steel Bracelet", "stainless-steel-bracelet", "accessories", "per_variant", "BRACELET", (("Silver", "SILVER", 499), ("Gold Tone", "GOLDTONE", 549)), "Finish options", "Silver, Gold Tone"),
    ("Jewellery Gift Set", "jewellery-gift-set", "accessories", "shared", "GIFTSET", (("Set of 2", "SET2", 699), ("Set of 4", "SET4", 999)), "Set options", "Set of 2, Set of 4"),

    ("Men's Lace-up Casual Sneakers", "mens-lace-up-casual-sneakers", "footwear", "shared", "LACESNK", (("Size 6", "06", 1499), ("Size 7", "07", 1499), ("Size 8", "08", 1499), ("Size 9", "09", 1499), ("Size 10", "10", 1499)), "Size options", "6, 7, 8, 9, 10"),
    ("Men's Derby Formal Shoes", "mens-derby-formal-shoes", "footwear", "shared", "DERBY", (("Size 6", "06", 1899), ("Size 7", "07", 1899), ("Size 8", "08", 1899), ("Size 9", "09", 1899), ("Size 10", "10", 1899)), "Size options", "6, 7, 8, 9, 10"),
    ("Women's Ballet Flats", "womens-ballet-flats", "footwear", "shared", "BALLET", (("Size 4", "04", 899), ("Size 5", "05", 899), ("Size 6", "06", 899), ("Size 7", "07", 899), ("Size 8", "08", 899)), "Size options", "4, 5, 6, 7, 8"),
    ("Women's Everyday Sneakers", "womens-everyday-sneakers", "footwear", "shared", "WOMENSNK", (("Size 4", "04", 1299), ("Size 5", "05", 1299), ("Size 6", "06", 1299), ("Size 7", "07", 1299), ("Size 8", "08", 1299)), "Size options", "4, 5, 6, 7, 8"),
    ("Women's Block Heel Sandals", "womens-block-heel-sandals", "footwear", "shared", "BLOCKHEEL", (("Size 4", "04", 1199), ("Size 5", "05", 1199), ("Size 6", "06", 1199), ("Size 7", "07", 1199), ("Size 8", "08", 1199)), "Size options", "4, 5, 6, 7, 8"),

    ("Cotton Bedsheet Set", "cotton-bedsheet-set", "home-living", "shared", "BEDSHEET", (("Single", "SINGLE", 799), ("Double", "DOUBLE", 1199)), "Size options", "Single, Double"),
    ("Stainless Steel Water Bottle", "stainless-steel-water-bottle", "home-living", "shared", "BOTTLE", (("750ml", "750ML", 499), ("1L", "1L", 599)), "Capacity options", "750ml, 1L"),
    ("Airtight Kitchen Container Set", "airtight-kitchen-container-set", "home-living", "shared", "CONTAINER", (("6-piece", "6PC", 699), ("12-piece", "12PC", 1199)), "Set options", "6-piece, 12-piece"),
    ("Electric Kettle", "electric-kettle", "home-living", "per_variant", "KETTLE", (("Standard", "STANDARD", 899), ("Temperature Control", "TEMPCONTROL", 1499)), "Model options", "Standard, Temperature Control"),
    ("Mixer Grinder", "mixer-grinder", "home-living", "per_variant", "MIXER", (("500W", "500W", 2199), ("750W", "750W", 2999)), "Power options", "500W, 750W"),
    ("Ceramic Dinner Set", "ceramic-dinner-set", "home-living", "shared", "DINNERSET", (("12-piece", "12PC", 1499), ("18-piece", "18PC", 2199)), "Set options", "12-piece, 18-piece"),

    ("SPF 50 Sunscreen", "spf-50-sunscreen", "beauty", "shared", "SUNSCREEN", (("50ml", "50ML", 399), ("100ml", "100ML", 699)), "Volume options", "50ml, 100ml"),
    ("Lightweight Face Moisturizer", "lightweight-face-moisturizer", "beauty", "shared", "MOISTURIZER", (("50g", "50G", 349), ("100g", "100G", 599)), "Volume options", "50g, 100g"),
    ("Gentle Face Cleanser", "gentle-face-cleanser", "beauty", "shared", "CLEANSER", (("100ml", "100ML", 299), ("200ml", "200ML", 499)), "Volume options", "100ml, 200ml"),
    ("Nourishing Shampoo", "nourishing-shampoo", "beauty", "shared", "SHAMPOO", (("180ml", "180ML", 249), ("340ml", "340ML", 399)), "Volume options", "180ml, 340ml"),
    ("Daily Conditioner", "daily-conditioner", "beauty", "shared", "CONDITIONER", (("180ml", "180ML", 249), ("340ml", "340ML", 399)), "Volume options", "180ml, 340ml"),
    ("Hydrating Body Lotion", "hydrating-body-lotion", "beauty", "shared", "BODYLOTION", (("200ml", "200ML", 299), ("400ml", "400ML", 499)), "Volume options", "200ml, 400ml"),
    ("Kajal and Eyeliner Combo", "kajal-and-eyeliner-combo", "beauty", "shared", "KAJALEYE", (("Single", "SINGLE", 249), ("Duo Pack", "DUO", 399)), "Pack options", "Single, Duo Pack"),

    ("Portable Power Bank", "portable-power-bank", "electronics", "per_variant", "POWERBANK", (("10,000mAh", "10K", 999), ("20,000mAh", "20K", 1599)), "Capacity options", "10,000mAh, 20,000mAh"),
    ("USB-C Fast Charger", "usb-c-fast-charger", "electronics", "per_variant", "CHARGER", (("30W", "30W", 799), ("65W", "65W", 1499)), "Power options", "30W, 65W"),
    ("Smartwatch", "smartwatch", "electronics", "per_variant", "SMARTWATCH", (("Basic", "BASIC", 1299), ("Bluetooth Calling", "BT-CALL", 1899)), "Model options", "Basic, Bluetooth Calling"),
    ("TWS Wireless Earbuds", "tws-wireless-earbuds", "electronics", "per_variant", "EARBUDS", (("Standard", "STANDARD", 999), ("ANC", "ANC", 1699)), "Model options", "Standard, ANC"),
    ("USB-C Multiport Hub", "usb-c-multiport-hub", "electronics", "per_variant", "MULTIHUB", (("4-in-1", "4IN1", 699), ("7-in-1", "7IN1", 1199)), "Port options", "4-in-1, 7-in-1"),
    ("Portable Bluetooth Speaker", "portable-bluetooth-speaker", "electronics", "per_variant", "SPEAKER", (("Compact", "COMPACT", 999), ("Large", "LARGE", 1599)), "Model options", "Compact, Large"),

    ("A4 Notebook Pack", "a4-notebook-pack", "stationery", "shared", "NOTEBOOK", (("Pack of 3", "PACK3", 199), ("Pack of 6", "PACK6", 349)), "Pack options", "Pack of 3, Pack of 6"),
    ("Gel Pen Set", "gel-pen-set", "stationery", "shared", "GELPEN", (("Pack of 5", "PACK5", 99), ("Pack of 10", "PACK10", 179)), "Pack options", "Pack of 5, Pack of 10"),
    ("Highlighter Set", "highlighter-set", "stationery", "shared", "HIGHLIGHTER", (("4 Colours", "4COL", 129), ("8 Colours", "8COL", 229)), "Set options", "4 Colours, 8 Colours"),
    ("Geometry Box", "geometry-box", "stationery", "shared", "GEOMETRY", (("Basic", "BASIC", 149), ("Complete Set", "COMPLETE", 249)), "Set options", "Basic, Complete Set"),
    ("Sticky Notes and Flags Set", "sticky-notes-and-flags-set", "stationery", "shared", "STICKY", (("Compact", "COMPACT", 99), ("Assorted", "ASSORTED", 169)), "Set options", "Compact, Assorted"),
    ("Hardcover Planner", "hardcover-planner", "stationery", "shared", "PLANNER", (("A5", "A5", 249), ("A4", "A4", 399)), "Format options", "A5, A4"),
    ("Drawing Sketchbook", "drawing-sketchbook", "stationery", "shared", "SKETCHBOOK", (("40 Sheets", "40SHEETS", 199), ("80 Sheets", "80SHEETS", 329)), "Sheet options", "40 Sheets, 80 Sheets"),
)

REQUIRED_SCHEMA = {
    "products": {"short_description", "highlights", "specifications", "is_returnable", "return_window_days", "is_refundable", "payment_methods"},
    "product_variants": {"mrp"},
    "product_images": {"provider_file_id", "variant_id"},
}
REQUIRED_CATEGORIES = tuple(CATEGORY_CODES)


def _database_name() -> str:
    return urlsplit(DATABASE_URL or "").path.lstrip("/").split("?")[0]


def _alembic_revision(session) -> str | None:
    if not inspect(engine).has_table("alembic_version"):
        return None
    return session.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()


def _migration_heads() -> tuple[str, ...]:
    config = Config("alembic.ini")
    return tuple(sorted(ScriptDirectory.from_config(config).get_heads()))


def _validate_environment() -> None:
    import os

    if os.getenv("APP_ENV", "").strip().lower() != "development":
        raise RuntimeError("APP_ENV must be explicitly set to development.")
    parsed = urlsplit(DATABASE_URL or "")
    if parsed.scheme not in {"postgres", "postgresql", "postgresql+psycopg2", "postgresql+psycopg"}:
        raise RuntimeError("Configured database must be PostgreSQL.")
    if _database_name().lower() != "flatkart":
        raise RuntimeError("Configured database name must be flatkart.")


def _schema_missing() -> dict[str, list[str]]:
    inspector = inspect(engine)
    missing = {}
    for table, required in REQUIRED_SCHEMA.items():
        if not inspector.has_table(table):
            missing[table] = sorted(required)
            continue
        actual = {column["name"] for column in inspector.get_columns(table)}
        absent = sorted(required - actual)
        if absent:
            missing[table] = absent
    return missing


def _sku(category: str, product_code: str, option_code: str) -> str:
    return f"FK-{CATEGORY_CODES[category]}-{product_code}-{option_code}".upper()


def _product_content(item: tuple) -> tuple[list[str], str, dict[str, str]]:
    name, _, category, _, _, variants, spec_label, spec_value = item
    options = ", ".join(option for option, _, _ in variants)
    short = f"{name}, with {options} options, is a draft catalogue choice for everyday use."
    description = (
        f"{name} is a {category.replace('-', ' ')} catalogue item intended for everyday use. "
        f"Choose from the listed options: {options}; an administrator must verify all product details before activation."
    )
    highlights = [
        f"{spec_label}: {spec_value}",
        "Inactive sample listing pending administrator review",
        "Product details require verification before activation",
    ]
    if category in {"men", "women", "footwear"}:
        specs = {"Product type": name, spec_label: spec_value}
        if "Fit" in name:
            specs["Fit"] = "As stated in product name"
    elif category == "beauty":
        specs = {"Product type": name, spec_label: spec_value, "Usage category": "Personal care or cosmetics"}
    elif category == "stationery":
        specs = {"Product type": name, spec_label: spec_value}
    elif category == "electronics":
        specs = {"Product type": name, spec_label: spec_value}
    elif category == "home-living":
        specs = {"Product type": name, spec_label: spec_value}
    else:
        specs = {"Product type": name, spec_label: spec_value}
    return highlights, description, specs


def _snapshot(session) -> tuple[dict[str, ProductCategory], dict[str, int], dict[str, int]]:
    categories = {
        category.slug: category
        for category in session.scalars(select(ProductCategory).where(ProductCategory.slug.in_(REQUIRED_CATEGORIES)))
    }
    all_counts = dict(session.execute(
        select(ProductCategory.slug, func.count(Product.id))
        .outerjoin(Product, Product.category_id == ProductCategory.id)
        .group_by(ProductCategory.slug)
    ).all())
    return categories, all_counts, {}


def _plan(session, categories: dict[str, ProductCategory], counts: dict[str, int]):
    existing_slugs = set(session.scalars(select(Product.slug)))
    existing_skus = {
        sku: (product_id, product_slug)
        for sku, product_id, product_slug in session.execute(
            select(ProductVariant.sku, ProductVariant.product_id, Product.slug)
            .join(Product, Product.id == ProductVariant.product_id)
        )
    }
    planned_skus: set[str] = set()
    seen_slugs: set[str] = set()
    insert, duplicates, capped = [], [], []
    simulated = Counter(counts)
    for item in APPROVED_PRODUCTS:
        name, slug, category, _, product_code, variants, _, _ = item
        if slug in seen_slugs:
            raise RuntimeError(f"Duplicate approved product slug: {slug}")
        seen_slugs.add(slug)
        if slug in existing_slugs:
            duplicates.append(item)
            continue
        if category not in categories:
            raise RuntimeError(f"Required category is missing: {category}")
        skus = [_sku(category, product_code, code) for _, code, _ in variants]
        if any(len(sku) > 80 for sku in skus):
            raise RuntimeError(f"Generated SKU exceeds 80 characters for {name}")
        if len(set(skus)) != len(skus) or any(sku in planned_skus for sku in skus):
            raise RuntimeError(f"Duplicate SKU in approved dataset for {name}")
        for sku in skus:
            if sku in existing_skus:
                owner_id, owner_slug = existing_skus[sku]
                raise RuntimeError(f"SKU conflict {sku}: already belongs to product {owner_id} ({owner_slug})")
        if simulated[category] >= MAX_PRODUCTS_PER_CATEGORY:
            capped.append(item)
            continue
        planned_skus.update(skus)
        insert.append(item)
        simulated[category] += 1
    return insert, duplicates, capped, simulated, existing_skus


def _print_report(categories, counts, insert, duplicates, capped, simulated, existing_skus, revision):
    print(f"Database: development/{_database_name()} (credentials omitted)")
    print(f"Alembic revision: {revision}")
    print(f"Alembic heads: {', '.join(_migration_heads())}")
    print("Target categories:")
    for slug in REQUIRED_CATEGORIES:
        category = categories.get(slug)
        print(f"  {slug}: {'missing' if category is None else f'{category.name} (active={category.is_active})'}; current={counts.get(slug, 0)}")
    print(f"Current products by category: {', '.join(f'{slug}={counts.get(slug, 0)}' for slug in REQUIRED_CATEGORIES)}")
    print(f"Approved product names ({len(APPROVED_PRODUCTS)}):")
    for item in APPROVED_PRODUCTS:
        print(f"  {item[2]}: {item[0]}")
    print(f"New products that would be inserted ({len(insert)}):")
    for item in insert:
        print(f"  {item[2]}: {item[0]}")
    print(f"Products skipped as existing slug duplicates ({len(duplicates)}):")
    for item in duplicates:
        print(f"  {item[2]}: {item[0]} ({item[1]})")
    print(f"Products skipped due to category cap ({len(capped)}):")
    for item in capped:
        print(f"  {item[2]}: {item[0]}")
    print(f"Planned ProductVariant rows: {sum(len(item[5]) for item in insert)}")
    print(f"Planned Inventory rows: {sum(len(item[5]) for item in insert)}")
    print("ProductImage rows to create: 0")
    print("Existing product/category/variant/inventory records to modify: 0")
    matching_slugs = [item[1] for item in duplicates]
    candidate_skus = {
        _sku(item[2], item[4], option_code)
        for item in APPROVED_PRODUCTS
        for _, option_code, _ in item[5]
    }
    matching_skus = sorted(candidate_skus.intersection(existing_skus))
    print(f"Existing matching product slugs: {', '.join(matching_slugs) if matching_slugs else 'none'}")
    print(f"Existing matching SKUs: {', '.join(matching_skus) if matching_skus else 'none'}")
    print("Final category counts if executed: " + ", ".join(f"{slug}={simulated[slug]}" for slug in REQUIRED_CATEGORIES))
    shortfalls = [f"{slug}={simulated[slug]}" for slug in REQUIRED_CATEGORIES if simulated[slug] < 10]
    if shortfalls:
        print("Below 10-product target after approved batch: " + ", ".join(shortfalls))


def run(execute: bool) -> int:
    _validate_environment()
    if _migration_heads() != (EXPECTED_REVISION,):
        raise RuntimeError(f"Expected exactly one Alembic head {EXPECTED_REVISION}; found {_migration_heads()}")
    missing = _schema_missing()
    if missing:
        raise RuntimeError(f"Required schema columns missing: {missing}")

    session = SessionLocal()
    try:
        revision = _alembic_revision(session)
        if revision != EXPECTED_REVISION:
            raise RuntimeError(f"Current Alembic revision must be {EXPECTED_REVISION}; found {revision}")
        categories, counts, _ = _snapshot(session)
        missing_categories = [slug for slug in REQUIRED_CATEGORIES if slug not in categories]
        if missing_categories:
            raise RuntimeError(f"Required categories are missing: {', '.join(missing_categories)}")
        inactive_categories = [slug for slug in REQUIRED_CATEGORIES if not categories[slug].is_active]
        if inactive_categories:
            raise RuntimeError(f"Required categories are inactive: {', '.join(inactive_categories)}")
        total = session.scalar(select(func.count(Product.id))) or 0
        active = session.scalar(select(func.count(Product.id)).where(Product.is_active.is_(True))) or 0
        inactive = total - active
        cart_items_before = session.scalar(select(func.count(CartItem.id))) or 0
        orders_before = session.scalar(select(func.count(CommerceOrder.id))) or 0
        insert, duplicates, capped, simulated, existing_skus = _plan(session, categories, counts)
        _print_report(categories, counts, insert, duplicates, capped, simulated, existing_skus, revision)
        print(f"Total products: {total}; active: {active}; inactive/archived: {inactive}")
        if not execute:
            print("DRY RUN ONLY: no database records were changed.")
            return 0

        # Finish the read-only preflight, then recheck and write atomically.
        session.rollback()
        inserted_products = inserted_variants = inserted_inventory = 0
        inserted_slugs = []
        with session.begin():
            revision = _alembic_revision(session)
            if revision != EXPECTED_REVISION:
                raise RuntimeError(f"Current Alembic revision changed; expected {EXPECTED_REVISION}, found {revision}")
            locked_categories = list(session.scalars(
                select(ProductCategory)
                .where(ProductCategory.slug.in_(REQUIRED_CATEGORIES))
                .order_by(ProductCategory.id)
                .with_for_update()
            ))
            categories = {category.slug: category for category in locked_categories}
            if any(slug not in categories or not categories[slug].is_active for slug in REQUIRED_CATEGORIES):
                raise RuntimeError("Required categories must exist and remain active at execution time")
            counts = dict(session.execute(
                select(ProductCategory.slug, func.count(Product.id))
                .outerjoin(Product, Product.category_id == ProductCategory.id)
                .where(ProductCategory.slug.in_(REQUIRED_CATEGORIES))
                .group_by(ProductCategory.slug)
            ).all())
            insert, duplicates, capped, simulated, existing_skus = _plan(session, categories, counts)
            for item in insert:
                name, slug, category_slug, image_mode, product_code, variants, spec_label, spec_value = item
                highlights, description, specifications = _product_content(item)
                beauty = category_slug == "beauty"
                product = Product(
                    name=name,
                    slug=slug,
                    brand="Flatkart Select",
                    category_id=categories[category_slug].id,
                    short_description=f"{name}, with {', '.join(option for option, _, _ in variants)} options, is a draft catalogue choice for everyday use.",
                    description=description,
                    highlights=highlights,
                    specifications=specifications,
                    is_returnable=not beauty,
                    return_window_days=None if beauty else 7,
                    is_refundable=True,
                    payment_methods=list(PAYMENT_METHODS),
                    is_active=False,
                    attributes={
                        "catalogue_seed_batch": SEED_BATCH,
                        "catalogue_seed_key": slug,
                        "variant_image_mode": image_mode,
                        "seed_inventory_placeholder": True,
                        "admin_review_required": True,
                        **({"return_policy_note": "Opened hygiene-sensitive items are not eligible for change-of-mind returns; defective, damaged, incorrect or misrepresented products remain subject to applicable remedies and law."} if beauty else {}),
                    },
                )
                session.add(product)
                session.flush()
                inserted_slugs.append(slug)
                inserted_products += 1
                for option, option_code, price in variants:
                    variant = ProductVariant(
                        product_id=product.id,
                        sku=_sku(category_slug, product_code, option_code),
                        name=option,
                        price=Decimal(price),
                        mrp=Decimal(price),
                        is_available=True,
                    )
                    session.add(variant)
                    session.flush()
                    session.add(Inventory(
                        variant_id=variant.id,
                        available_stock=10,
                        reserved_stock=0,
                        total_stock=10,
                        stock_status="in_stock",
                    ))
                    inserted_variants += 1
                    inserted_inventory += 1
        session.expire_all()
        seeded = list(session.scalars(select(Product).where(Product.slug.in_(inserted_slugs)))) if inserted_slugs else []
        seeded_ids = [product.id for product in seeded]
        variants_after = list(session.scalars(select(ProductVariant).where(ProductVariant.product_id.in_(seeded_ids)))) if seeded_ids else []
        variant_ids = [variant.id for variant in variants_after]
        inventory_after = list(session.scalars(select(Inventory).where(Inventory.variant_id.in_(variant_ids)))) if variant_ids else []
        images_after = session.scalar(select(func.count(ProductImage.id)).where(ProductImage.product_id.in_(seeded_ids))) if seeded_ids else 0
        bad_products = [
            product.slug for product in seeded
            if product.is_active
            or product.brand != "Flatkart Select"
            or product.attributes.get("catalogue_seed_batch") != SEED_BATCH
            or product.attributes.get("seed_inventory_placeholder") is not True
            or product.attributes.get("admin_review_required") is not True
        ]
        inventory_by_variant = {row.variant_id: row for row in inventory_after}
        bad_variants = [variant.sku for variant in variants_after if not variant.is_available or variant.mrp != variant.price or variant.id not in inventory_by_variant]
        bad_inventory = [
            row.variant_id for row in inventory_after
            if row.available_stock != 10 or row.reserved_stock != 0
            or row.total_stock != 10 or row.stock_status != "in_stock"
        ]
        if len(seeded) != inserted_products or len(variants_after) != inserted_variants or len(inventory_after) != inserted_inventory or images_after or bad_products or bad_variants or bad_inventory:
            raise RuntimeError("Post-insert verification failed; committed data needs investigation")
        print(f"Inserted products={inserted_products}, variants={inserted_variants}, inventory_rows={inserted_inventory}.")
        print("Post-insert verification: products inactive; variants available; inventory present for every variant; MRPs equal prices; ProductImage rows=0.")
        cart_items_after = session.scalar(select(func.count(CartItem.id))) or 0
        orders_after = session.scalar(select(func.count(CommerceOrder.id))) or 0
        print(f"CartItem rows before/after: {cart_items_before}/{cart_items_after}")
        print(f"CommerceOrder rows before/after: {orders_before}/{orders_after}")
        final_counts = dict(session.execute(
            select(ProductCategory.slug, func.count(Product.id))
            .outerjoin(Product, Product.category_id == ProductCategory.id)
            .where(ProductCategory.slug.in_(REQUIRED_CATEGORIES))
            .group_by(ProductCategory.slug)
        ).all())
        print("Final category counts: " + ", ".join(f"{slug}={final_counts.get(slug, 0)}" for slug in REQUIRED_CATEGORIES))
        print("Inserted products by category:")
        for slug in REQUIRED_CATEGORIES:
            names = [product.name for product in seeded if product.category_id == categories[slug].id]
            print(f"  {slug}: {', '.join(names) if names else '(none)'}")
        return 0
    finally:
        session.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="perform the approved catalogue insert")
    parser.add_argument("--confirm-approved-products", action="store_true", help="confirm the exact approved allowlist")
    args = parser.parse_args(argv)
    if args.confirm_approved_products and not args.execute:
        parser.error("--confirm-approved-products requires --execute")
    if args.execute and not args.confirm_approved_products:
        parser.error("--execute requires --confirm-approved-products")
    try:
        return run(args.execute)
    except Exception as exc:
        print(f"SEED REFUSED: {exc}", file=sys.stderr)
        return 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
