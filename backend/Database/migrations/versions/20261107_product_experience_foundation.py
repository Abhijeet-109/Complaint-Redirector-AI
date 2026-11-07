"""Add product experience fields and variant MRP.

Revision ID: 2f8c6a91d430
Revises: f6a4c1d8b209
"""

from alembic import op
import sqlalchemy as sa


revision = "2f8c6a91d430"
down_revision = "f6a4c1d8b209"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("short_description", sa.String(length=250), nullable=True))
    op.add_column(
        "products",
        sa.Column("highlights", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
    )
    op.add_column(
        "products",
        sa.Column("specifications", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
    )
    op.add_column("products", sa.Column("is_returnable", sa.Boolean(), nullable=True))
    op.add_column("products", sa.Column("return_window_days", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("is_refundable", sa.Boolean(), nullable=True))
    op.add_column(
        "products",
        sa.Column("payment_methods", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
    )
    op.add_column("product_variants", sa.Column("mrp", sa.Numeric(12, 2), nullable=True))
    op.execute("UPDATE product_variants SET mrp = price")
    with op.batch_alter_table("product_variants") as batch_op:
        batch_op.alter_column("mrp", existing_type=sa.Numeric(12, 2), nullable=False)
        batch_op.create_check_constraint("ck_product_variants_mrp_gte_price", "mrp >= price")


def downgrade():
    with op.batch_alter_table("product_variants") as batch_op:
        batch_op.drop_constraint("ck_product_variants_mrp_gte_price", type_="check")
        batch_op.drop_column("mrp")
    op.drop_column("products", "payment_methods")
    op.drop_column("products", "is_refundable")
    op.drop_column("products", "return_window_days")
    op.drop_column("products", "is_returnable")
    op.drop_column("products", "specifications")
    op.drop_column("products", "highlights")
    op.drop_column("products", "short_description")
