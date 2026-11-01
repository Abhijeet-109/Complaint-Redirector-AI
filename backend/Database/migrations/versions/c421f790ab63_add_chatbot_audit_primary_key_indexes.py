"""Add the audit table ID indexes missing from the current database.

Revision ID: c421f790ab63
Revises: fde8a87088c6
"""

from alembic import op


revision = "c421f790ab63"
down_revision = "fde8a87088c6"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE INDEX IF NOT EXISTS ix_chatbot_audit_requests_id ON chatbot_audit_requests (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chatbot_audit_stages_id ON chatbot_audit_stages (id)")


def downgrade():
    # Retain indexes in place so existing audit data and query behavior are preserved.
    pass
