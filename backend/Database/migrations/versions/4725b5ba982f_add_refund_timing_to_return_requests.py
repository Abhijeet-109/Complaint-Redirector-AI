"""add_refund_timing_to_return_requests

Revision ID: 4725b5ba982f
Revises: c7d4e8a91f20
Create Date: 2026-11-12 18:20:44.893079

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4725b5ba982f'
down_revision: Union[str, Sequence[str], None] = 'c7d4e8a91f20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Extend existing return_requests without changing legacy status values.
    op.add_column(
        "return_requests",
        sa.Column("refund_timing", sa.String(24), nullable=True),
    )
    op.create_check_constraint(
        "ck_return_requests_refund_timing",
        "return_requests",
        "refund_timing IS NULL OR refund_timing IN ('immediate', 'after_collection')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_return_requests_refund_timing",
        "return_requests",
        type_="check",
    )
    op.drop_column("return_requests", "refund_timing")
