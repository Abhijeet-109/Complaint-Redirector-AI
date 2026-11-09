"""Persist checkout totals, delivery snapshots, and payment attempts.

Revision ID: e17c4a2d9b60
Revises: 3d9a4ec7b6f2
"""

from alembic import op
import sqlalchemy as sa


revision = "e17c4a2d9b60"
down_revision = "3d9a4ec7b6f2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("commerce_orders", sa.Column("subtotal", sa.Numeric(12, 2), nullable=True))
    op.add_column("commerce_orders", sa.Column("total_amount", sa.Numeric(12, 2), nullable=True))
    op.add_column(
        "commerce_orders",
        sa.Column("currency", sa.String(3), server_default="INR", nullable=False),
    )
    op.add_column("commerce_orders", sa.Column("payment_method", sa.String(24), nullable=True))
    op.add_column(
        "commerce_orders",
        sa.Column("payment_status", sa.String(24), server_default="pending", nullable=False),
    )
    op.add_column("commerce_orders", sa.Column("delivery_address", sa.JSON(), nullable=True))
    op.add_column("commerce_orders", sa.Column("idempotency_key", sa.String(120), nullable=True))
    op.add_column("commerce_orders", sa.Column("paid_at", sa.DateTime(), nullable=True))
    op.add_column("commerce_orders", sa.Column("placed_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("commerce_orders") as batch_op:
        batch_op.create_check_constraint(
            "ck_commerce_orders_subtotal_nonnegative", "subtotal IS NULL OR subtotal >= 0"
        )
        batch_op.create_check_constraint(
            "ck_commerce_orders_total_nonnegative", "total_amount IS NULL OR total_amount >= 0"
        )
        batch_op.create_check_constraint("ck_commerce_orders_currency_inr", "currency = 'INR'")
        batch_op.create_unique_constraint(
            "uq_commerce_orders_user_idempotency_key", ["user_id", "idempotency_key"]
        )

    op.create_table(
        "payment_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(24), server_default="razorpay", nullable=False),
        sa.Column("status", sa.String(24), server_default="created", nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), server_default="INR", nullable=False),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("provider_order_id", sa.String(80), nullable=True),
        sa.Column("provider_payment_id", sa.String(80), nullable=True),
        sa.Column("failure_reason", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("amount >= 0", name="ck_payment_attempts_amount_nonnegative"),
        sa.CheckConstraint("currency = 'INR'", name="ck_payment_attempts_currency_inr"),
        sa.CheckConstraint(
            "status IN ('created', 'pending', 'captured', 'failed', 'cancelled', 'expired')",
            name="ck_payment_attempts_status_valid",
        ),
        sa.UniqueConstraint("provider_order_id", name="uq_payment_attempts_provider_order_id"),
        sa.UniqueConstraint("provider_payment_id", name="uq_payment_attempts_provider_payment_id"),
        sa.UniqueConstraint("idempotency_key", name="uq_payment_attempts_idempotency_key"),
    )
    op.create_index("ix_payment_attempts_order_id", "payment_attempts", ["order_id"])
    op.create_index("ix_payment_attempts_status", "payment_attempts", ["status"])

    op.create_table(
        "payment_webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.String(120), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("received_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("event_id", name="uq_payment_webhook_events_event_id"),
    )


def downgrade():
    op.drop_table("payment_webhook_events")
    op.drop_index("ix_payment_attempts_status", table_name="payment_attempts")
    op.drop_index("ix_payment_attempts_order_id", table_name="payment_attempts")
    op.drop_table("payment_attempts")
    with op.batch_alter_table("commerce_orders") as batch_op:
        batch_op.drop_constraint("uq_commerce_orders_user_idempotency_key", type_="unique")
        batch_op.drop_constraint("ck_commerce_orders_currency_inr", type_="check")
        batch_op.drop_constraint("ck_commerce_orders_total_nonnegative", type_="check")
        batch_op.drop_constraint("ck_commerce_orders_subtotal_nonnegative", type_="check")
    op.drop_column("commerce_orders", "placed_at")
    op.drop_column("commerce_orders", "paid_at")
    op.drop_column("commerce_orders", "idempotency_key")
    op.drop_column("commerce_orders", "delivery_address")
    op.drop_column("commerce_orders", "payment_status")
    op.drop_column("commerce_orders", "payment_method")
    op.drop_column("commerce_orders", "currency")
    op.drop_column("commerce_orders", "total_amount")
    op.drop_column("commerce_orders", "subtotal")
