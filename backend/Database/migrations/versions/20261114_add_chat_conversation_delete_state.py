"""Persist recoverable conversation deletion state.

Revision ID: e4c91a72b603
Revises: d7f1a5c92480
"""

from alembic import op
import sqlalchemy as sa


revision = "e4c91a72b603"
down_revision = "d7f1a5c92480"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "chat_conversations",
        sa.Column("delete_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("chat_conversations", "delete_pending")
