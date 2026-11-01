"""Add the minimum relational commerce catalogue and support records.

Revision ID: 9a1d3f6c2e70
Revises: c421f790ab63
"""

from alembic import op
import sqlalchemy as sa


revision = "9a1d3f6c2e70"
down_revision = "c421f790ab63"
branch_labels = None
depends_on = None


def _index(table, column, unique=False):
    op.create_index(f"ix_{table}_{column}", table, [column], unique=unique)


def upgrade():
    op.create_table(
        "product_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(140), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["product_categories.id"]),
        sa.UniqueConstraint("slug", name="uq_product_categories_slug"),
    )
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(220), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("brand", sa.String(120), nullable=True),
        sa.Column("attributes", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["product_categories.id"]),
    )
    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("alt_text", sa.String(240), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.CheckConstraint("price >= 0", name="ck_product_variants_price_nonnegative"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "inventory",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("available_stock", sa.Integer(), nullable=False),
        sa.Column("reserved_stock", sa.Integer(), nullable=False),
        sa.Column("stock_status", sa.String(24), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("available_stock >= 0", name="ck_inventory_available_nonnegative"),
        sa.CheckConstraint("reserved_stock >= 0", name="ck_inventory_reserved_nonnegative"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("variant_id"),
    )
    op.create_table(
        "carts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_table(
        "cart_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_cart_items_quantity_positive"),
        sa.ForeignKeyConstraint(["cart_id"], ["carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"]),
        sa.UniqueConstraint("cart_id", "variant_id", name="uq_cart_items_cart_variant"),
    )
    op.create_table(
        "commerce_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_number", sa.String(40), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_table(
        "commerce_order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("variant_name", sa.String(160), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_commerce_order_items_quantity_positive"),
        sa.CheckConstraint("unit_price >= 0", name="ck_commerce_order_items_price_nonnegative"),
        sa.UniqueConstraint("id", "order_id", name="uq_commerce_order_items_id_order"),
        sa.ForeignKeyConstraint(["order_id"], ["commerce_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"]),
    )
    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("tracking_reference", sa.String(120), nullable=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("shipped_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["commerce_orders.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("order_id"),
    )
    op.create_table(
        "return_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("requested_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_return_requests_quantity_positive"),
        sa.ForeignKeyConstraint(["order_id"], ["commerce_orders.id"]),
        sa.ForeignKeyConstraint(
            ["order_item_id", "order_id"],
            ["commerce_order_items.id", "commerce_order_items.order_id"],
            name="fk_return_requests_item_belongs_to_order",
        ),
    )

    for table, column, unique in (
        ("product_categories", "parent_id", False), ("products", "category_id", False),
        ("products", "name", False), ("products", "slug", True), ("products", "brand", False),
        ("products", "is_active", False), ("product_images", "product_id", False),
        ("product_variants", "product_id", False), ("product_variants", "sku", True),
        ("inventory", "stock_status", False), ("carts", "user_id", False),
        ("carts", "status", False), ("cart_items", "cart_id", False),
        ("cart_items", "variant_id", False), ("commerce_orders", "order_number", True),
        ("commerce_orders", "user_id", False), ("commerce_orders", "status", False),
        ("commerce_orders", "created_at", False), ("commerce_order_items", "order_id", False),
        ("commerce_order_items", "variant_id", False), ("shipments", "tracking_reference", False),
        ("shipments", "status", False), ("return_requests", "order_id", False),
        ("return_requests", "order_item_id", False), ("return_requests", "status", False),
    ):
        _index(table, column, unique=unique)


def downgrade():
    for table in (
        "return_requests", "shipments", "commerce_order_items", "commerce_orders",
        "cart_items", "carts", "inventory", "product_variants", "product_images",
        "products", "product_categories",
    ):
        op.drop_table(table)
