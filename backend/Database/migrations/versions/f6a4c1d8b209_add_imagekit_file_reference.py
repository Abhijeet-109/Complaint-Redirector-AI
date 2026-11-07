"""Store ImageKit provider file identifiers for safe asset cleanup.

Revision ID: f6a4c1d8b209
Revises: a591ae6777e5
"""

from alembic import op
import sqlalchemy as sa


revision = "f6a4c1d8b209"
down_revision = "a591ae6777e5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("product_images", sa.Column("provider_file_id", sa.String(length=120), nullable=True))


def downgrade():
    op.drop_column("product_images", "provider_file_id")
