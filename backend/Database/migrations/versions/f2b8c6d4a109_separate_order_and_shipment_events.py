"""Allow the existing event log to record order and shipment transitions.

Revision ID: f2b8c6d4a109
Revises: e4c91a72b603
"""

from alembic import op
import sqlalchemy as sa


revision = "f2b8c6d4a109"
down_revision = "e4c91a72b603"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("shipment_events") as batch_op:
        batch_op.add_column(
            sa.Column("event_type", sa.String(length=24), nullable=False, server_default="shipment_status"),
        )
        batch_op.add_column(sa.Column("order_id", sa.Integer(), nullable=True))
        batch_op.alter_column("shipment_id", existing_type=sa.Integer(), nullable=True)
        batch_op.create_foreign_key(
            "fk_shipment_events_order_id_commerce_orders",
            "commerce_orders",
            ["order_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_check_constraint(
            "ck_shipment_events_owner_matches_type",
            "(event_type = 'order_status' AND order_id IS NOT NULL AND shipment_id IS NULL) OR "
            "(event_type = 'shipment_status' AND shipment_id IS NOT NULL AND order_id IS NULL)",
        )
    op.create_index("ix_shipment_events_order_id", "shipment_events", ["order_id"])


def downgrade():
    connection = op.get_bind()
    order_event_count = connection.execute(
        sa.text("SELECT COUNT(*) FROM shipment_events WHERE event_type = 'order_status'")
    ).scalar_one()
    if order_event_count:
        raise RuntimeError("Cannot downgrade while order status history exists.")

    op.drop_index("ix_shipment_events_order_id", table_name="shipment_events")
    with op.batch_alter_table("shipment_events") as batch_op:
        batch_op.drop_constraint("ck_shipment_events_owner_matches_type", type_="check")
        batch_op.alter_column("shipment_id", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_constraint("fk_shipment_events_order_id_commerce_orders", type_="foreignkey")
        batch_op.drop_column("order_id")
        batch_op.drop_column("event_type")
