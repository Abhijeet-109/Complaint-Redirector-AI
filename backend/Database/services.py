"""Controlled commerce queries and cart operations for API and agent callers."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    Inventory,
    Product,
    ProductCategory,
    ProductVariant,
    ReturnRequest,
    Shipment,
)


def list_categories(session: Session, *, active_only: bool = True) -> list[ProductCategory]:
    query = select(ProductCategory).order_by(ProductCategory.display_order, ProductCategory.name)
    if active_only:
        query = query.where(ProductCategory.is_active.is_(True))
    return list(session.scalars(query))


def get_category_tree(session: Session, *, active_only: bool = True) -> list[dict]:
    categories = list_categories(session, active_only=active_only)
    nodes = {
        category.id: {
            "id": category.id,
            "name": category.name,
            "slug": category.slug,
            "is_active": category.is_active,
            "display_order": category.display_order,
            "children": [],
        }
        for category in categories
    }
    roots = []
    for category in categories:
        node = nodes[category.id]
        if category.parent_id is None or category.parent_id not in nodes:
            roots.append(node)
        else:
            nodes[category.parent_id]["children"].append(node)

    visited = set()

    stack = list(reversed(roots))
    while stack:
        node = stack.pop()
        if node["id"] in visited:
            raise RuntimeError("Category hierarchy contains a cycle")
        visited.add(node["id"])
        node["children"].sort(key=lambda child: (child["display_order"], child["name"]))
        stack.extend(reversed(node["children"]))
    if len(visited) != len(nodes):
        raise RuntimeError("Category hierarchy contains a cycle or an unreachable parent")
    roots.sort(key=lambda node: (node["display_order"], node["name"]))
    return roots


def set_category_parent(session: Session, category_id: int, parent_id: int | None) -> ProductCategory:
    category = session.get(ProductCategory, category_id)
    if category is None:
        raise LookupError("Category not found")
    if parent_id is None:
        category.parent_id = None
        session.flush()
        return category

    current_id = parent_id
    visited = set()
    while current_id is not None:
        if current_id == category_id:
            raise ValueError("A category cannot be moved beneath itself or one of its descendants")
        if current_id in visited:
            raise RuntimeError("Existing category hierarchy contains a cycle")
        visited.add(current_id)
        parent = session.get(ProductCategory, current_id)
        if parent is None:
            raise LookupError("Parent category not found")
        current_id = parent.parent_id

    category.parent_id = parent_id
    session.flush()
    return category


def list_products(
    session: Session,
    *,
    category_id: int | None = None,
    search: str | None = None,
    limit: int = 50,
) -> list[Product]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    query = select(Product).options(selectinload(Product.variants), selectinload(Product.images))
    query = query.where(Product.is_active.is_(True))
    if category_id is not None:
        query = query.where(Product.category_id == category_id)
    if search:
        term = search.strip()
        if term:
            query = query.where(Product.name.ilike(f"%{term}%") | Product.brand.ilike(f"%{term}%"))
    return list(session.scalars(query.order_by(Product.name).limit(limit)))


def get_product(session: Session, product_id: int) -> Product | None:
    return session.scalar(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id == product_id, Product.is_active.is_(True))
    )


def get_variant_inventory(session: Session, variant_id: int) -> tuple[ProductVariant, Inventory | None] | None:
    variant = session.scalar(
        select(ProductVariant)
        .options(selectinload(ProductVariant.inventory), selectinload(ProductVariant.product))
        .where(ProductVariant.id == variant_id)
    )
    return (variant, variant.inventory) if variant is not None else None


def get_or_create_active_cart(session: Session, user_id: int) -> Cart:
    cart = session.scalar(
        select(Cart).options(selectinload(Cart.items)).where(Cart.user_id == user_id, Cart.status == "active")
    )
    if cart is None:
        try:
            # The partial unique index is the concurrency authority. Isolate a
            # losing insert in a savepoint so the caller's transaction survives.
            with session.begin_nested():
                cart = Cart(user_id=user_id, status="active")
                session.add(cart)
                session.flush()
        except IntegrityError:
            cart = session.scalar(
                select(Cart)
                .options(selectinload(Cart.items))
                .where(Cart.user_id == user_id, Cart.status == "active")
            )
            if cart is None:
                raise
    return cart


def add_cart_item(session: Session, user_id: int, variant_id: int, quantity: int = 1) -> CartItem:
    if quantity <= 0:
        raise ValueError("quantity must be positive")
    variant = session.scalar(
        select(ProductVariant)
        .where(ProductVariant.id == variant_id, ProductVariant.is_available.is_(True))
    )
    if variant is None:
        raise LookupError("Available product variant not found")
    # Serialize stock checks and cart line changes for this variant. On
    # PostgreSQL the row lock is retained until the caller commits or rolls back.
    inventory = session.scalar(
        select(Inventory).where(Inventory.variant_id == variant_id).with_for_update()
    )
    if inventory is None or inventory.available_stock < quantity:
        raise ValueError("Insufficient available stock")

    cart = get_or_create_active_cart(session, user_id)
    item = session.scalar(
        select(CartItem)
        .where(CartItem.cart_id == cart.id, CartItem.variant_id == variant_id)
        .with_for_update()
    )
    if item is None:
        item = CartItem(cart_id=cart.id, variant_id=variant_id, quantity=quantity)
        session.add(item)
    else:
        next_quantity = item.quantity + quantity
        if inventory.available_stock < next_quantity:
            raise ValueError("Insufficient available stock")
        item.quantity = next_quantity
    session.flush()
    return item


def remove_cart_item(session: Session, user_id: int, variant_id: int) -> bool:
    # Keep the same inventory-then-cart-line lock order as add_cart_item.
    session.scalar(select(Inventory).where(Inventory.variant_id == variant_id).with_for_update())
    item = session.scalar(
        select(CartItem)
        .join(Cart, CartItem.cart_id == Cart.id)
        .where(Cart.user_id == user_id, Cart.status == "active", CartItem.variant_id == variant_id)
        .with_for_update()
    )
    if item is None:
        return False
    session.delete(item)
    session.flush()
    return True


def get_cart(session: Session, user_id: int) -> Cart | None:
    return session.scalar(
        select(Cart)
        .options(selectinload(Cart.items).selectinload(CartItem.variant).selectinload(ProductVariant.product))
        .where(Cart.user_id == user_id, Cart.status == "active")
    )


def list_orders(session: Session, user_id: int, *, limit: int = 50) -> list[CommerceOrder]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    query = (
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items), selectinload(CommerceOrder.shipment))
        .where(CommerceOrder.user_id == user_id)
        .order_by(CommerceOrder.created_at.desc())
        .limit(limit)
    )
    return list(session.scalars(query))


def get_order(session: Session, user_id: int, order_id: int) -> CommerceOrder | None:
    return session.scalar(
        select(CommerceOrder)
        .options(selectinload(CommerceOrder.items), selectinload(CommerceOrder.shipment))
        .where(CommerceOrder.id == order_id, CommerceOrder.user_id == user_id)
    )


def get_shipment(session: Session, user_id: int, order_id: int) -> Shipment | None:
    return session.scalar(
        select(Shipment)
        .join(CommerceOrder, Shipment.order_id == CommerceOrder.id)
        .where(CommerceOrder.id == order_id, CommerceOrder.user_id == user_id)
    )


def list_returns(session: Session, user_id: int, *, order_id: int | None = None) -> list[ReturnRequest]:
    query = (
        select(ReturnRequest)
        .join(CommerceOrder, ReturnRequest.order_id == CommerceOrder.id)
        .where(CommerceOrder.user_id == user_id)
        .order_by(ReturnRequest.requested_at.desc())
    )
    if order_id is not None:
        query = query.where(ReturnRequest.order_id == order_id)
    return list(session.scalars(query))
