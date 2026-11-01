"""Enforce inventory balance, category hierarchy, and active-cart uniqueness.

Revision ID: b84e290af671
Revises: 9a1d3f6c2e70
"""

from alembic import op
import sqlalchemy as sa


revision = "b84e290af671"
down_revision = "9a1d3f6c2e70"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    duplicate_cart_owner = connection.execute(
        sa.text(
            "SELECT user_id FROM carts WHERE status = 'active' "
            "GROUP BY user_id HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate_cart_owner:
        raise RuntimeError(
            "Cannot add active-cart uniqueness while a customer has multiple active carts; "
            "resolve the duplicates without deleting their cart data first."
        )
    self_parent_category = connection.execute(
        sa.text("SELECT id FROM product_categories WHERE parent_id = id LIMIT 1")
    ).first()
    if self_parent_category:
        raise RuntimeError(
            "Cannot add the category self-parent constraint while invalid category links exist."
        )

    # Existing available/reserved values are preserved; total is their sum.
    op.add_column("inventory", sa.Column("total_stock", sa.Integer(), nullable=True))
    op.execute("UPDATE inventory SET total_stock = available_stock + reserved_stock")
    with op.batch_alter_table("inventory") as batch_op:
        batch_op.alter_column("total_stock", existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("inventory") as batch_op:
        batch_op.create_check_constraint("ck_inventory_total_nonnegative", "total_stock >= 0")
        batch_op.create_check_constraint(
            "ck_inventory_reserved_lte_total", "reserved_stock <= total_stock"
        )
        batch_op.create_check_constraint(
            "ck_inventory_stock_balance",
            "available_stock + reserved_stock = total_stock",
        )
    with op.batch_alter_table("product_categories") as batch_op:
        batch_op.create_check_constraint(
            "ck_product_categories_not_self_parent",
            "parent_id IS NULL OR parent_id <> id",
        )
    op.create_index(
        "uq_carts_one_active_per_user",
        "carts",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )


def downgrade():
    op.drop_index("uq_carts_one_active_per_user", table_name="carts")
    with op.batch_alter_table("product_categories") as batch_op:
        batch_op.drop_constraint("ck_product_categories_not_self_parent", type_="check")
    with op.batch_alter_table("inventory") as batch_op:
        batch_op.drop_constraint("ck_inventory_stock_balance", type_="check")
        batch_op.drop_constraint("ck_inventory_reserved_lte_total", type_="check")
        batch_op.drop_constraint("ck_inventory_total_nonnegative", type_="check")
        batch_op.drop_column("total_stock")
