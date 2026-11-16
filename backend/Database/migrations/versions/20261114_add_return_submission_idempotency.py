"""Add durable idempotency keys for chatbot return submissions.

Revision ID: d7f1a5c92480
Revises: 4725b5ba982f, c421f790ab63
"""

from alembic import op
import sqlalchemy as sa


revision = "d7f1a5c92480"
down_revision = ("4725b5ba982f", "c421f790ab63")
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("return_requests", sa.Column("submission_key", sa.String(36), nullable=True))
    op.create_unique_constraint(
        "uq_return_requests_submission_key", "return_requests", ["submission_key"]
    )


def downgrade():
    op.drop_constraint("uq_return_requests_submission_key", "return_requests", type_="unique")
    op.drop_column("return_requests", "submission_key")
