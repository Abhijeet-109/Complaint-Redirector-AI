"""Controlled commerce queries and cart operations for API and agent callers."""

from sqlalchemy import select
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
        cart = Cart(user_id=user_id, status="active")
        session.add(cart)
        session.flush()
    return cart


def add_cart_item(session: Session, user_id: int, variant_id: int, quantity: int = 1) -> CartItem:
    if quantity <= 0:
        raise ValueError("quantity must be positive")
    variant = session.scalar(
        select(ProductVariant)
        .options(selectinload(ProductVariant.inventory))
        .where(ProductVariant.id == variant_id, ProductVariant.is_available.is_(True))
    )
    if variant is None:
        raise LookupError("Available product variant not found")
    if variant.inventory is None or variant.inventory.available_stock < quantity:
        raise ValueError("Insufficient available stock")

    cart = get_or_create_active_cart(session, user_id)
    item = session.scalar(
        select(CartItem).where(CartItem.cart_id == cart.id, CartItem.variant_id == variant_id)
    )
    if item is None:
        item = CartItem(cart_id=cart.id, variant_id=variant_id, quantity=quantity)
        session.add(item)
    else:
        next_quantity = item.quantity + quantity
        if variant.inventory.available_stock < next_quantity:
            raise ValueError("Insufficient available stock")
        item.quantity = next_quantity
    session.flush()
    return item


def remove_cart_item(session: Session, user_id: int, variant_id: int) -> bool:
    item = session.scalar(
        select(CartItem)
        .join(Cart, CartItem.cart_id == Cart.id)
        .where(Cart.user_id == user_id, Cart.status == "active", CartItem.variant_id == variant_id)
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
