from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import ARRAY

from backend.Database.connection import Base

class Department(Base):
    __tablename__ = "departments"


    id = Column(
        Integer,
        primary_key = True,
        index = True
    )

    name = Column(
        String,
        unique = True,
        nullable = False

    )

    email = Column(
        String,
        nullable = False,

    )

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key = True,
        index = True

    )

    name = Column(
        String,
        nullable = False
    )

    email = Column(
        String,
        unique = True,
        nullable = False,
        index = True
    )

    password = Column(
        String,
        nullable = False
    )

    role = Column(
        String,
        nullable = False,
        default = "user"
    )

    department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=True
    )



    create_at = Column(
        DateTime,
        server_default = func.now()
    )


class LoginThrottle(Base):
    """Persistent, hashed-identity counters for failed login protection."""

    __tablename__ = "login_throttles"

    scope = Column(String(16), primary_key=True)
    identity_digest = Column(String(64), primary_key=True)
    failure_count = Column(Integer, nullable=False, default=0)
    window_started_at = Column(DateTime, nullable=False, server_default=func.now())
    locked_until = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    predicted_department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False
    )

    department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False
    )

    handler_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    complaint_text = Column(
        String,
        nullable=False
    )

    confidence = Column(
        String,
        nullable=True
    )

    status = Column(
        String,
        nullable=False,
        default="pending"
    )

    create_at = Column(
        DateTime,
        server_default=func.now()
    )


class ComplaintRedirection(Base):
    """One record for every department-to-department complaint transfer."""

    __tablename__ = "complaint_redirections"

    id = Column(Integer, primary_key=True, index=True)

    complaint_id = Column(
        Integer,
        ForeignKey("complaints.id"),
        nullable=False,
        index=True,
    )

    from_department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False,
    )

    to_department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=False,
    )

    redirected_by_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    reason = Column(String, nullable=False)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )


class ChatbotTelemetry(Base):
    __tablename__ = "chatbot_telemetry"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    question_preview = Column(String(240), nullable=False)
    outcome = Column(String(16), nullable=False, index=True)
    fallback = Column(Boolean, nullable=False, default=False)
    source_names = Column(JSON, nullable=False, default=list)
    source_count = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Float, nullable=False)


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (Index("ix_chat_conversations_user_updated", "user_id", "updated_at"),)

    thread_id = Column(String(255), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(120), nullable=False, default="New chat")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

class ChatbotAuditRequest(Base):
    __tablename__ = "chatbot_audit_requests"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(36), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
    session_id = Column(String(100), nullable=False)
    user_id = Column(String(64), nullable=True, index=True)
    query_text = Column(String, nullable=False)
    answer_text = Column(String, nullable=True)
    status = Column(String(24), nullable=False, index=True)
    failure_stage = Column(String(64), nullable=True, index=True)
    failure_category = Column(String(64), nullable=True, index=True)
    failure_reason = Column(String(240), nullable=True)
    http_status = Column(Integer, nullable=False)
    latency_ms = Column(Float, nullable=False)
    source_count = Column(Integer, nullable=False)
    source_names = Column(JSON, nullable=False)
    model_name = Column(String(120), nullable=True)
    fallback = Column(Boolean, nullable=False)
    fallback_reason = Column(String(240), nullable=True)
    exported_at = Column(DateTime(timezone=True), nullable=True, index=True)
    export_attempts = Column(Integer, nullable=False)
    export_failures = Column(Integer, nullable=False)
    export_error = Column(String(80), nullable=True)


class ChatbotAuditStage(Base):
    __tablename__ = "chatbot_audit_stages"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(
        String(36),
        ForeignKey("chatbot_audit_requests.request_id"),
        nullable=False,
        index=True,
    )
    stage_name = Column(String(64), nullable=False, index=True)
    status = Column(String(24), nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=False)
    duration_ms = Column(Float, nullable=False)
    decision = Column(String(120), nullable=True)
    failure_category = Column(String(64), nullable=True, index=True)
    failure_reason = Column(String(240), nullable=True)
    exception_type = Column(String(120), nullable=True)
    retry_count = Column(Integer, nullable=False)
    skip_reason = Column(String(240), nullable=True)


class ProductCategory(Base):
    __tablename__ = "product_categories"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_product_categories_slug"),
        CheckConstraint(
            "parent_id IS NULL OR parent_id <> id",
            name="ck_product_categories_not_self_parent",
        ),
    )

    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True, index=True)
    name = Column(String(120), nullable=False)
    slug = Column(String(140), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)
    parent = relationship("ProductCategory", remote_side=[id], backref="children")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    slug = Column(String(220), nullable=False, unique=True, index=True)
    description = Column(String, nullable=True)
    short_description = Column(String(250), nullable=True)
    highlights = Column(JSON, nullable=False, default=list)
    specifications = Column(JSON, nullable=False, default=dict)
    is_returnable = Column(Boolean, nullable=True)
    return_window_days = Column(Integer, nullable=True)
    is_refundable = Column(Boolean, nullable=True)
    payment_methods = Column(JSON, nullable=False, default=list)
    brand = Column(String(120), nullable=True, index=True)
    attributes = Column(JSON, nullable=False, default=dict)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    category = relationship("ProductCategory")
    images = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by=lambda: (ProductImage.display_order, ProductImage.id),
    )
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")


class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True, index=True)
    storage_key = Column(String(500), nullable=False)
    provider = Column(String(40), nullable=False)
    provider_file_id = Column(String(120), nullable=True)
    alt_text = Column(String(240), nullable=True)
    display_order = Column(Integer, nullable=False, default=0)
    product = relationship("Product", back_populates="images")
    variant = relationship("ProductVariant", back_populates="images")


class ProductVariant(Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_product_variants_price_nonnegative"),
        CheckConstraint("mrp >= price", name="ck_product_variants_mrp_gte_price"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    sku = Column(String(80), nullable=False, unique=True, index=True)
    name = Column(String(160), nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    mrp = Column(Numeric(12, 2), nullable=False)
    is_available = Column(Boolean, nullable=False, default=True)
    product = relationship("Product", back_populates="variants")
    images = relationship("ProductImage", back_populates="variant")
    inventory = relationship("Inventory", back_populates="variant", uselist=False, cascade="all, delete-orphan")


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        CheckConstraint("available_stock >= 0", name="ck_inventory_available_nonnegative"),
        CheckConstraint("reserved_stock >= 0", name="ck_inventory_reserved_nonnegative"),
        CheckConstraint("total_stock >= 0", name="ck_inventory_total_nonnegative"),
        CheckConstraint("reserved_stock <= total_stock", name="ck_inventory_reserved_lte_total"),
        CheckConstraint(
            "(available_stock > 0 AND stock_status = 'in_stock') OR "
            "(available_stock = 0 AND stock_status = 'out_of_stock')",
            name="ck_inventory_stock_status_matches_available",
        ),
        CheckConstraint(
            "available_stock + reserved_stock = total_stock",
            name="ck_inventory_stock_balance",
        ),
    )

    id = Column(Integer, primary_key=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, unique=True)
    # total_stock is on-hand stock; sellable available_stock plus reserved_stock
    # must always equal it, enforced by the database.
    available_stock = Column(Integer, nullable=False, default=0)
    total_stock = Column(Integer, nullable=False, default=0)
    reserved_stock = Column(Integer, nullable=False, default=0)
    stock_status = Column(String(24), nullable=False, default="out_of_stock", index=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    variant = relationship("ProductVariant", back_populates="inventory")


class Cart(Base):
    __tablename__ = "carts"
    __table_args__ = (
        Index(
            "uq_carts_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
            sqlite_where=text("status = 'active'"),
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="active", index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "variant_id", name="uq_cart_items_cart_variant"),
        CheckConstraint("quantity > 0", name="ck_cart_items_quantity_positive"),
    )

    id = Column(Integer, primary_key=True)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    cart = relationship("Cart", back_populates="items")
    variant = relationship("ProductVariant")


class CommerceOrder(Base):
    __tablename__ = "commerce_orders"
    __table_args__ = (
        CheckConstraint("subtotal IS NULL OR subtotal >= 0", name="ck_commerce_orders_subtotal_nonnegative"),
        CheckConstraint("total_amount IS NULL OR total_amount >= 0", name="ck_commerce_orders_total_nonnegative"),
        CheckConstraint("currency = 'INR'", name="ck_commerce_orders_currency_inr"),
        UniqueConstraint("user_id", "idempotency_key", name="uq_commerce_orders_user_idempotency_key"),
    )

    id = Column(Integer, primary_key=True)
    order_number = Column(String(40), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="placed", index=True)
    subtotal = Column(Numeric(12, 2), nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=True)
    currency = Column(String(3), nullable=False, default="INR", server_default="INR")
    payment_method = Column(String(24), nullable=True)
    payment_status = Column(String(24), nullable=False, default="pending", server_default="pending")
    delivery_address = Column(JSON, nullable=True)
    idempotency_key = Column(String(120), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    placed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    items = relationship("CommerceOrderItem", back_populates="order", cascade="all, delete-orphan")
    shipment = relationship("Shipment", back_populates="order", uselist=False, cascade="all, delete-orphan")
    payment_attempts = relationship("PaymentAttempt", back_populates="order", cascade="all, delete-orphan")


class CommerceOrderItem(Base):
    __tablename__ = "commerce_order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_commerce_order_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_commerce_order_items_price_nonnegative"),
        UniqueConstraint("id", "order_id", name="uq_commerce_order_items_id_order"),
    )

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    variant_name = Column(String(160), nullable=False)
    sku = Column(String(80), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    order = relationship("CommerceOrder", back_populates="items")
    variant = relationship("ProductVariant")


class PaymentAttempt(Base):
    __tablename__ = "payment_attempts"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_payment_attempts_amount_nonnegative"),
        CheckConstraint("currency = 'INR'", name="ck_payment_attempts_currency_inr"),
        CheckConstraint(
            "status IN ('created', 'pending', 'captured', 'failed', 'cancelled', 'expired')",
            name="ck_payment_attempts_status_valid",
        ),
        UniqueConstraint("provider_order_id", name="uq_payment_attempts_provider_order_id"),
        UniqueConstraint("provider_payment_id", name="uq_payment_attempts_provider_payment_id"),
        UniqueConstraint("idempotency_key", name="uq_payment_attempts_idempotency_key"),
    )

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(24), nullable=False, default="razorpay", server_default="razorpay")
    status = Column(String(24), nullable=False, default="created", server_default="created", index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="INR", server_default="INR")
    idempotency_key = Column(String(120), nullable=False)
    provider_order_id = Column(String(80), nullable=True)
    provider_payment_id = Column(String(80), nullable=True)
    failure_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    order = relationship("CommerceOrder", back_populates="payment_attempts")


class PaymentWebhookEvent(Base):
    __tablename__ = "payment_webhook_events"
    __table_args__ = (UniqueConstraint("event_id", name="uq_payment_webhook_events_event_id"),)

    id = Column(Integer, primary_key=True)
    event_id = Column(String(120), nullable=False)
    event_type = Column(String(80), nullable=False)
    received_at = Column(DateTime, nullable=False, server_default=func.now())


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, unique=True)
    tracking_reference = Column(String(120), nullable=True, index=True)
    status = Column(String(24), nullable=False, default="pending", index=True)
    shipped_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    order = relationship("CommerceOrder", back_populates="shipment")


class ReturnRequest(Base):
    __tablename__ = "return_requests"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_return_requests_quantity_positive"),
        ForeignKeyConstraint(
            ["order_item_id", "order_id"],
            ["commerce_order_items.id", "commerce_order_items.order_id"],
            name="fk_return_requests_item_belongs_to_order",
        ),
    )

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("commerce_orders.id"), nullable=False, index=True)
    order_item_id = Column(Integer, nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    reason = Column(String(500), nullable=False)
    status = Column(String(24), nullable=False, default="requested", index=True)
    requested_at = Column(DateTime, nullable=False, server_default=func.now())
    order = relationship("CommerceOrder")
    order_item = relationship("CommerceOrderItem", overlaps="order")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id = Column(String(64), primary_key=True)

    source = Column(
        String(500),
        nullable=False,
        index=True
    )

    content = Column(
        Text,
        nullable=False
    )

    chunk_metadata = Column(
        "metadata",
        JSON,
        nullable=False,
        default=dict
    )

    embedding = Column(
        ARRAY(Float),
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
