"""One-time maintenance script to remove seeded demo cart and order records.

This script targets only the known demo customer accounts and only records
that match the documented FK-DEMO-* seed pattern. It never touches catalogue
products, inventory, users, or any genuine customer data.

USAGE
-----
Dry run (default, safe to run any time):
    python -m backend.Database.cleanup_demo_commerce

Explicit execution (requires all safety guards):
    python -m backend.Database.cleanup_demo_commerce --execute --confirm-demo-cleanup

SAFETY GUARDS
-------------
- Refuses to run unless APP_ENV=development.
- Refuses to run unless the configured database name is "flatkart".
- In execution mode, requires both --execute and --confirm-demo-cleanup.
- Default mode is always a dry run that modifies no data.
- All deletions execute inside a single transaction that rolls back on any error.
"""

import argparse
import sys
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from backend.Database.connection import DATABASE_URL, SessionLocal
from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    CommerceOrderItem,
    ProductVariant,
    ReturnRequest,
    Shipment,
    User,
)
from backend.security_config import app_environment

TARGET_CUSTOMERS = ("user1@gmail.com", "user3@gmail.com")
DEMO_ORDER_PREFIX = "FK-DEMO-"
DEMO_SKU_PREFIX = "FK-DEMO-"


# ---------------------------------------------------------------------------
# Safety guards
# ---------------------------------------------------------------------------

def _assert_development_environment() -> None:
    env = app_environment()
    if env != "development":
        print(f"ERROR: APP_ENV is '{env}'. This script only runs in development.", file=sys.stderr)
        sys.exit(1)


def _assert_development_database() -> None:
    db_name = urlparse(DATABASE_URL or "").path.strip("/").split("/")[-1]
    if db_name.casefold() != "flatkart":
        print(
            f"ERROR: Database name is '{db_name}'. "
            "This script only targets the 'flatkart' development database.",
            file=sys.stderr,
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# Identification queries (read-only)
# ---------------------------------------------------------------------------

def _identify_demo_records(session):
    """Return a dict describing all demo records found. Does not modify data."""
    result = {
        "target_emails": list(TARGET_CUSTOMERS),
        "users": [],
        "cart_items": [],
        "orders": [],
        "order_items": [],
        "shipments": [],
        "return_requests": [],
    }

    for email in TARGET_CUSTOMERS:
        user = session.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if user is None:
            print(f"  WARNING: Customer account not found: {email}")
            continue
        result["users"].append({"id": user.id, "email": user.email})

        # --- Demo cart items ---
        cart = session.scalar(
            select(Cart).where(Cart.user_id == user.id, Cart.status == "active")
        )
        if cart is not None:
            rows = list(session.execute(
                select(CartItem, ProductVariant)
                .join(ProductVariant, CartItem.variant_id == ProductVariant.id)
                .where(
                    CartItem.cart_id == cart.id,
                    ProductVariant.sku.like(f"{DEMO_SKU_PREFIX}%"),
                )
            ).all())
            for item, variant in rows:
                result["cart_items"].append({
                    "cart_item_id": item.id,
                    "cart_id": cart.id,
                    "variant_id": variant.id,
                    "sku": variant.sku,
                    "product_name": variant.product.name if variant.product else "(unknown)",
                    "quantity": item.quantity,
                })

        # --- Demo orders (FK-DEMO-{user_id}-*) ---
        demo_orders = list(session.scalars(
            select(CommerceOrder).where(
                CommerceOrder.user_id == user.id,
                CommerceOrder.order_number.like(f"{DEMO_ORDER_PREFIX}{user.id}-%"),
            )
        ).all())
        for order in demo_orders:
            order_items = list(session.scalars(
                select(CommerceOrderItem).where(CommerceOrderItem.order_id == order.id)
            ).all())
            shipment = session.scalar(
                select(Shipment).where(Shipment.order_id == order.id)
            )
            return_reqs = list(session.scalars(
                select(ReturnRequest).where(ReturnRequest.order_id == order.id)
            ).all())
            result["orders"].append({
                "order_id": order.id,
                "order_number": order.order_number,
                "status": order.status,
                "item_count": len(order_items),
                "has_shipment": shipment is not None,
                "return_request_count": len(return_reqs),
            })
            result["order_items"].extend(
                {"id": oi.id, "order_id": order.id, "sku": oi.sku, "product_name": oi.product_name}
                for oi in order_items
            )
            if shipment:
                result["shipments"].append({"id": shipment.id, "order_id": order.id, "status": shipment.status})
            result["return_requests"].extend(
                {"id": rr.id, "order_id": order.id, "status": rr.status}
                for rr in return_reqs
            )

    return result


# ---------------------------------------------------------------------------
# Report printer
# ---------------------------------------------------------------------------

def _print_report(records: dict, *, dry_run: bool) -> None:
    mode_label = "DRY RUN" if dry_run else "EXECUTION"
    print()
    print(f"=== Flatkart demo commerce cleanup — {mode_label} ===")
    print()
    print(f"Target demo customer accounts: {', '.join(records['target_emails'])}")
    print()

    print(f"Demo cart items found: {len(records['cart_items'])}")
    for item in records["cart_items"]:
        print(f"  CartItem #{item['cart_item_id']} — SKU: {item['sku']} — "
              f"{item['product_name']} (qty {item['quantity']})")

    print()
    print(f"Seeded demo orders found: {len(records['orders'])}")
    for order in records["orders"]:
        rr_note = f", {order['return_request_count']} return request(s)" if order["return_request_count"] else ""
        ship_note = ", shipment record present" if order["has_shipment"] else ""
        print(f"  Order {order['order_number']} — status: {order['status']} "
              f"— {order['item_count']} item(s){ship_note}{rr_note}")

    print()
    print(f"  Total order items:    {len(records['order_items'])}")
    print(f"  Total shipments:      {len(records['shipments'])}")
    print(f"  Total return requests:{len(records['return_requests'])}")
    print()

    if dry_run:
        print("No data was modified. Run with --execute --confirm-demo-cleanup to apply changes.")
    print()


# ---------------------------------------------------------------------------
# Deletion (runs inside a single transaction)
# ---------------------------------------------------------------------------

def _execute_cleanup(session, records: dict) -> dict:
    """Delete identified demo records. Must be called inside an active transaction."""
    counts = {
        "return_requests": 0,
        "order_items": 0,
        "shipments": 0,
        "orders": 0,
        "cart_items": 0,
    }

    # 1. Return requests first (reference order items and orders)
    rr_ids = [rr["id"] for rr in records["return_requests"]]
    if rr_ids:
        for rr_id in rr_ids:
            obj = session.get(ReturnRequest, rr_id)
            if obj is not None:
                session.delete(obj)
                counts["return_requests"] += 1
        session.flush()

    # 2. Order items
    oi_ids = [oi["id"] for oi in records["order_items"]]
    if oi_ids:
        for oi_id in oi_ids:
            obj = session.get(CommerceOrderItem, oi_id)
            if obj is not None:
                session.delete(obj)
                counts["order_items"] += 1
        session.flush()

    # 3. Shipments
    ship_ids = [s["id"] for s in records["shipments"]]
    if ship_ids:
        for ship_id in ship_ids:
            obj = session.get(Shipment, ship_id)
            if obj is not None:
                session.delete(obj)
                counts["shipments"] += 1
        session.flush()

    # 4. Orders
    order_ids = [o["order_id"] for o in records["orders"]]
    if order_ids:
        for order_id in order_ids:
            obj = session.get(CommerceOrder, order_id)
            if obj is not None:
                session.delete(obj)
                counts["orders"] += 1
        session.flush()

    # 5. Cart items (leave the Cart row itself; an empty Cart does not block product deletion)
    ci_ids = [ci["cart_item_id"] for ci in records["cart_items"]]
    if ci_ids:
        for ci_id in ci_ids:
            obj = session.get(CartItem, ci_id)
            if obj is not None:
                session.delete(obj)
                counts["cart_items"] += 1
        session.flush()

    return counts


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove seeded Flatkart demo cart and order records (development only)."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete demo records. Without this flag the script performs a dry run.",
    )
    parser.add_argument(
        "--confirm-demo-cleanup",
        action="store_true",
        dest="confirm",
        help="Required alongside --execute to acknowledge the destructive operation.",
    )
    args = parser.parse_args()

    # Always enforce safety guards
    _assert_development_environment()
    _assert_development_database()

    execute = args.execute and args.confirm

    if args.execute and not args.confirm:
        print(
            "ERROR: --execute requires --confirm-demo-cleanup to acknowledge the operation.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Dry-run identification (always runs, never modifies data)
    with SessionLocal() as session:
        records = _identify_demo_records(session)

    _print_report(records, dry_run=not execute)

    if not execute:
        return

    # Execution mode: re-identify and delete inside one transaction
    print("Executing cleanup inside a single transaction...")
    try:
        with SessionLocal.begin() as session:
            # Re-identify inside the transaction to get a consistent snapshot
            live_records = _identify_demo_records(session)
            counts = _execute_cleanup(session, live_records)
            # Transaction commits here if no exception was raised
        print("Cleanup committed successfully.")
        print()
        print("Deletion summary:")
        print(f"  Return requests deleted: {counts['return_requests']}")
        print(f"  Order items deleted:     {counts['order_items']}")
        print(f"  Shipments deleted:       {counts['shipments']}")
        print(f"  Orders deleted:          {counts['orders']}")
        print(f"  Cart items deleted:      {counts['cart_items']}")
        print()
        print("Products, variants, inventory, images, categories, and users were not modified.")
    except (SQLAlchemyError, Exception) as exc:
        print(f"ERROR: Cleanup transaction rolled back. No data was modified.\nReason: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
