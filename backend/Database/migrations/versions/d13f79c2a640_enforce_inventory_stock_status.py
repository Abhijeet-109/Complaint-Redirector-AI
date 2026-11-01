"""Keep inventory stock status aligned with available stock.

Revision ID: d13f79c2a640
Revises: b84e290af671
"""

from alembic import op


revision = "d13f79c2a640"
down_revision = "b84e290af671"
branch_labels = None
depends_on = None


def upgrade():
    # Status is a two-state classification of sellable stock. Normalize legacy
    # values before enforcing the invariant; quantities remain untouched.
    op.execute(
        "UPDATE inventory SET stock_status = "
        "CASE WHEN available_stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END"
    )
    with op.batch_alter_table("inventory") as batch_op:
        batch_op.create_check_constraint(
            "ck_inventory_stock_status_matches_available",
            "(available_stock > 0 AND stock_status = 'in_stock') OR "
            "(available_stock = 0 AND stock_status = 'out_of_stock')",
        )


def downgrade():
    with op.batch_alter_table("inventory") as batch_op:
        batch_op.drop_constraint("ck_inventory_stock_status_matches_available", type_="check")
