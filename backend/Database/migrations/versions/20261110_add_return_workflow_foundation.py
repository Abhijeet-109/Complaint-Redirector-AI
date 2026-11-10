
"""Add structured return workflow, evidence, inspections and department handoffs.

Revision ID: c7d4e8a91f20
Revises: a8f3c2e1d547
"""

from alembic import op
import sqlalchemy as sa


revision = "c7d4e8a91f20"
down_revision = "a8f3c2e1d547"
branch_labels = None
depends_on = None


def upgrade():
    # Extend existing return_requests without changing legacy status values.
    op.add_column(
        "return_requests",
        sa.Column("resolution_type", sa.String(20), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("reason_code", sa.String(40), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("workflow_status", sa.String(40), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("decision_by_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("decision_note", sa.Text(), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column("decided_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "return_requests",
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_check_constraint(
        "ck_return_requests_resolution_type",
        "return_requests",
        "resolution_type IS NULL OR resolution_type IN ('refund', 'replacement')",
    )
    op.create_foreign_key(
        "fk_return_requests_assigned_to_users",
        "return_requests",
        "users",
        ["assigned_to_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_return_requests_decision_by_users",
        "return_requests",
        "users",
        ["decision_by_id"],
        ["id"],
    )
    op.create_index(
        "ix_return_requests_workflow_status",
        "return_requests",
        ["workflow_status"],
    )

    # Immutable workflow audit events.
    op.create_table(
        "return_request_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "return_request_id",
            sa.Integer(),
            sa.ForeignKey("return_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("previous_status", sa.String(40), nullable=True),
        sa.Column("new_status", sa.String(40), nullable=True),
        sa.Column(
            "actor_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "event_data",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_return_request_events_return_request_id",
        "return_request_events",
        ["return_request_id"],
    )
    op.create_index(
        "ix_return_request_events_request_created",
        "return_request_events",
        ["return_request_id", "created_at"],
    )

    # Private evidence references. Actual file bytes stay in object storage.
    op.create_table(
        "return_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "return_request_id",
            sa.Integer(),
            sa.ForeignKey("return_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_provider", sa.String(40), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("provider_file_id", sa.String(120), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column(
            "uploaded_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "size_bytes > 0",
            name="ck_return_evidence_size_positive",
        ),
        sa.UniqueConstraint(
            "storage_key",
            name="uq_return_evidence_storage_key",
        ),
    )
    op.create_index(
        "ix_return_evidence_return_request_id",
        "return_evidence",
        ["return_request_id"],
    )

    # Durable department handoffs.
    op.create_table(
        "return_handoffs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "return_request_id",
            sa.Integer(),
            sa.ForeignKey("return_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_department_id",
            sa.Integer(),
            sa.ForeignKey("departments.id"),
            nullable=False,
        ),
        sa.Column(
            "destination_department_id",
            sa.Integer(),
            sa.ForeignKey("departments.id"),
            nullable=False,
        ),
        sa.Column("handoff_type", sa.String(40), nullable=False),
        sa.Column(
            "status",
            sa.String(24),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "accepted_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
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
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "handoff_type IN "
            "('refund_pickup', 'refund_processing', 'replacement_fulfillment')",
            name="ck_return_handoffs_type_valid",
        ),
        sa.CheckConstraint(
            "status IN "
            "('pending', 'accepted', 'in_progress', 'completed', 'failed', 'cancelled')",
            name="ck_return_handoffs_status_valid",
        ),
        sa.UniqueConstraint(
            "idempotency_key",
            name="uq_return_handoffs_idempotency_key",
        ),
    )
    op.create_index(
        "ix_return_handoffs_return_request_id",
        "return_handoffs",
        ["return_request_id"],
    )
    op.create_index(
        "ix_return_handoffs_status",
        "return_handoffs",
        ["status"],
    )

    # Inspection outcomes are separate from claim and handoff status.
    op.create_table(
        "return_inspections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "return_request_id",
            sa.Integer(),
            sa.ForeignKey("return_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "handoff_id",
            sa.Integer(),
            sa.ForeignKey("return_handoffs.id"),
            nullable=True,
        ),
        sa.Column("inspection_type", sa.String(30), nullable=False),
        sa.Column("outcome", sa.String(24), nullable=False),
        sa.Column("condition_code", sa.String(40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "inspected_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "inspected_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "inspection_type IN ('evidence_review', 'physical_pickup')",
            name="ck_return_inspections_type_valid",
        ),
        sa.CheckConstraint(
            "outcome IN ('passed', 'failed', 'needs_more_info')",
            name="ck_return_inspections_outcome_valid",
        ),
    )
    op.create_index(
        "ix_return_inspections_return_request_id",
        "return_inspections",
        ["return_request_id"],
    )
    op.create_index(
        "ix_return_inspections_handoff_id",
        "return_inspections",
        ["handoff_id"],
    )


def downgrade():
    op.drop_index(
        "ix_return_inspections_handoff_id",
        table_name="return_inspections",
    )
    op.drop_index(
        "ix_return_inspections_return_request_id",
        table_name="return_inspections",
    )
    op.drop_table("return_inspections")

    op.drop_index(
        "ix_return_handoffs_status",
        table_name="return_handoffs",
    )
    op.drop_index(
        "ix_return_handoffs_return_request_id",
        table_name="return_handoffs",
    )
    op.drop_table("return_handoffs")

    op.drop_index(
        "ix_return_evidence_return_request_id",
        table_name="return_evidence",
    )
    op.drop_table("return_evidence")

    op.drop_index(
        "ix_return_request_events_request_created",
        table_name="return_request_events",
    )
    op.drop_index(
        "ix_return_request_events_return_request_id",
        table_name="return_request_events",
    )
    op.drop_table("return_request_events")

    op.drop_index(
        "ix_return_requests_workflow_status",
        table_name="return_requests",
    )
    op.drop_constraint(
        "fk_return_requests_decision_by_users",
        "return_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_return_requests_assigned_to_users",
        "return_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        "ck_return_requests_resolution_type",
        "return_requests",
        type_="check",
    )

    op.drop_column("return_requests", "updated_at")
    op.drop_column("return_requests", "decided_at")
    op.drop_column("return_requests", "decision_note")
    op.drop_column("return_requests", "decision_by_id")
    op.drop_column("return_requests", "assigned_to_id")
    op.drop_column("return_requests", "workflow_status")
    op.drop_column("return_requests", "description")
    op.drop_column("return_requests", "reason_code")
    op.drop_column("return_requests", "resolution_type")
