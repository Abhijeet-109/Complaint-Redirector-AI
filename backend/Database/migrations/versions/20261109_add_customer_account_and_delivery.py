"""Add customer profile, address book, wishlist, and delivery coverage.

Revision ID: 4f2b8d1a6c90
Revises: e17c4a2d9b60
"""

from alembic import op
import sqlalchemy as sa


revision = "4f2b8d1a6c90"
down_revision = "e17c4a2d9b60"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("commerce_orders", sa.Column("checkout_mode", sa.String(length=16), nullable=False, server_default="cart"))
    op.create_check_constraint("ck_commerce_orders_checkout_mode", "commerce_orders", "checkout_mode IN ('cart', 'buy_now')")
    op.add_column("users", sa.Column("mobile_number", sa.String(length=15), nullable=True))
    op.add_column("users", sa.Column("preferred_payment_method", sa.String(length=24), nullable=True))

    op.create_table(
        "user_addresses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_name", sa.String(length=120), nullable=False),
        sa.Column("mobile_number", sa.String(length=15), nullable=False),
        sa.Column("address_line1", sa.String(length=240), nullable=False),
        sa.Column("address_line2", sa.String(length=240), nullable=True),
        sa.Column("locality", sa.String(length=120), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("state", sa.String(length=100), nullable=False),
        sa.Column("pin_code", sa.String(length=6), nullable=False),
        sa.Column("label", sa.String(length=16), nullable=False, server_default="Home"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("length(pin_code) = 6", name="ck_user_addresses_pin_six_digits"),
        sa.CheckConstraint("label IN ('Home', 'Work', 'Other')", name="ck_user_addresses_label_valid"),
    )
    op.create_index("ix_user_addresses_user_id", "user_addresses", ["user_id"])
    op.create_index(
        "uq_user_addresses_one_default_per_user", "user_addresses", ["user_id"],
        unique=True, postgresql_where=sa.text("is_default = true"),
    )

    op.create_table(
        "wishlist_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "product_id", name="uq_wishlist_items_user_product"),
    )
    op.create_index("ix_wishlist_items_user_id", "wishlist_items", ["user_id"])
    op.create_index("ix_wishlist_items_product_id", "wishlist_items", ["product_id"])

    op.create_table(
        "shipment_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pin_code", sa.String(length=6), nullable=False),
        sa.Column("area", sa.String(length=120), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("state", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("length(pin_code) = 6", name="ck_shipment_options_pin_six_digits"),
        sa.UniqueConstraint("pin_code", "area", name="uq_shipment_options_pin_area"),
    )
    op.create_index("ix_shipment_options_pin_code", "shipment_options", ["pin_code"])


def downgrade():
    op.drop_constraint("ck_commerce_orders_checkout_mode", "commerce_orders", type_="check")
    op.drop_column("commerce_orders", "checkout_mode")
    op.drop_index("ix_shipment_options_pin_code", table_name="shipment_options")
    op.drop_table("shipment_options")
    op.drop_index("ix_wishlist_items_product_id", table_name="wishlist_items")
    op.drop_index("ix_wishlist_items_user_id", table_name="wishlist_items")
    op.drop_table("wishlist_items")
    op.drop_index("uq_user_addresses_one_default_per_user", table_name="user_addresses")
    op.drop_index("ix_user_addresses_user_id", table_name="user_addresses")
    op.drop_table("user_addresses")
    op.drop_column("users", "preferred_payment_method")
    op.drop_column("users", "mobile_number")
