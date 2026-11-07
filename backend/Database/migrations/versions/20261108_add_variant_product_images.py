"""Associate product gallery images with optional variants.

Revision ID: 3d9a4ec7b6f2
Revises: 2f8c6a91d430
"""

from alembic import op
import sqlalchemy as sa


revision = "3d9a4ec7b6f2"
down_revision = "2f8c6a91d430"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("product_images", sa.Column("variant_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_product_images_variant_id_product_variants",
        "product_images",
        "product_variants",
        ["variant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_product_images_variant_id", "product_images", ["variant_id"])


def downgrade():
    op.drop_index("ix_product_images_variant_id", table_name="product_images")
    op.drop_constraint(
        "fk_product_images_variant_id_product_variants",
        "product_images",
        type_="foreignkey",
    )
    op.drop_column("product_images", "variant_id")
