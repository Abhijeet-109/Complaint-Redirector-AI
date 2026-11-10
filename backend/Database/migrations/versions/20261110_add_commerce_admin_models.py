"""Add ShipmentEvent, Refund models and extend Shipment table for admin commerce management.

Revision ID: a8f3c2e1d547
Revises: 4f2b8d1a6c90
"""

from alembic import op
import sqlalchemy as sa


revision = "a8f3c2e1d547"
down_revision = "4f2b8d1a6c90"
branch_labels = None
depends_on = None


def upgrade():
    # ── Extend shipments table ────────────────────────────────────────────────
    op.add_column("shipments", sa.Column("carrier", sa.String(120), nullable=True))
    op.add_column("shipments", sa.Column("tracking_url", sa.String(500), nullable=True))
    op.add_column("shipments", sa.Column("estimated_delivery_date", sa.DateTime(), nullable=True))
    op.add_column("shipments", sa.Column("notes", sa.String(500), nullable=True))

    # ── shipment_events table ─────────────────────────────────────────────────
    op.create_table(
        "shipment_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "shipment_id",
            sa.Integer(),
            sa.ForeignKey("shipments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_status", sa.String(32), nullable=True),
        sa.Column("new_status", sa.String(32), nullable=False),
        sa.Column(
            "changed_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_shipment_events_shipment_id", "shipment_events", ["shipment_id"])

    # ── refunds table ─────────────────────────────────────────────────────────
    op.create_table(
        "refunds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Integer(),
            sa.ForeignKey("commerce_orders.id"),
            nullable=False,
        ),
        sa.Column(
            "payment_attempt_id",
            sa.Integer(),
            sa.ForeignKey("payment_attempts.id"),
            nullable=True,
        ),
        sa.Column(
            "return_request_id",
            sa.Integer(),
            sa.ForeignKey("return_requests.id"),
            nullable=True,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "currency",
            sa.String(3),
            nullable=False,
            server_default="INR",
        ),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("refund_method", sa.String(40), nullable=False),
        sa.Column("provider_refund_id", sa.String(120), nullable=True),
        sa.Column("external_reference", sa.String(120), nullable=True),
        sa.Column(
            "status",
            sa.String(24),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column(
            "processed_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("failure_reason", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("amount > 0", name="ck_refunds_amount_positive"),
        sa.CheckConstraint("currency = 'INR'", name="ck_refunds_currency_inr"),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'processed', 'failed')",
            name="ck_refunds_status_valid",
        ),
        sa.UniqueConstraint("idempotency_key", name="uq_refunds_idempotency_key"),
    )
    op.create_index("ix_refunds_order_id", "refunds", ["order_id"])
    op.create_index("ix_refunds_payment_attempt_id", "refunds", ["payment_attempt_id"])
    op.create_index("ix_refunds_return_request_id", "refunds", ["return_request_id"])
    op.create_index("ix_refunds_status", "refunds", ["status"])


def downgrade():
    op.drop_index("ix_refunds_status", table_name="refunds")
    op.drop_index("ix_refunds_return_request_id", table_name="refunds")
    op.drop_index("ix_refunds_payment_attempt_id", table_name="refunds")
    op.drop_index("ix_refunds_order_id", table_name="refunds")
    op.drop_table("refunds")

    op.drop_index("ix_shipment_events_shipment_id", table_name="shipment_events")
    op.drop_table("shipment_events")

    op.drop_column("shipments", "notes")
    op.drop_column("shipments", "estimated_delivery_date")
    op.drop_column("shipments", "tracking_url")
    op.drop_column("shipments", "carrier")
