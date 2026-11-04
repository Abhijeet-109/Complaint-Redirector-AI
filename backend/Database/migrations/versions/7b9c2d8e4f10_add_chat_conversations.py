"""Add user-owned chatbot conversations."""

from alembic import op
import sqlalchemy as sa


revision = "7b9c2d8e4f10"
down_revision = "d13f79c2a640"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "chat_conversations",
        sa.Column("thread_id", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("thread_id"),
    )
    op.create_index("ix_chat_conversations_user_id", "chat_conversations", ["user_id"])
    op.create_index("ix_chat_conversations_updated_at", "chat_conversations", ["updated_at"])
    op.create_index(
        "ix_chat_conversations_user_updated",
        "chat_conversations",
        ["user_id", "updated_at"],
    )


def downgrade():
    op.drop_index("ix_chat_conversations_user_updated", table_name="chat_conversations")
    op.drop_index("ix_chat_conversations_updated_at", table_name="chat_conversations")
    op.drop_index("ix_chat_conversations_user_id", table_name="chat_conversations")
    op.drop_table("chat_conversations")
