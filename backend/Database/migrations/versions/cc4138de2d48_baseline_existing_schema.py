
"""Baseline existing PostgreSQL schema.

Revision ID: cc4138de2d48
Revises:
"""

from alembic import op
import sqlalchemy as sa


revision = "cc4138de2d48"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # 1. Departments
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="departments_name_key"),
    )
    op.create_index("ix_departments_id", "departments", ["id"])

    # 2. Users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("create_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="fk_users_department_id",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 3. Complaints
    op.create_table(
        "complaints",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("predicted_department_id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("handler_id", sa.Integer(), nullable=True),
        sa.Column("complaint_text", sa.String(), nullable=False),
        sa.Column("confidence", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("create_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name="complaints_department_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["handler_id"],
            ["users.id"],
            name="complaints_handler_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["predicted_department_id"],
            ["departments.id"],
            name="complaints_predicted_department_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="complaints_user_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_complaints_id", "complaints", ["id"])

    # 4. Complaint redirections
    op.create_table(
        "complaint_redirections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("complaint_id", sa.Integer(), nullable=False),
        sa.Column("from_department_id", sa.Integer(), nullable=False),
        sa.Column("to_department_id", sa.Integer(), nullable=False),
        sa.Column("redirected_by_user_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["complaint_id"],
            ["complaints.id"],
            name="complaint_redirections_complaint_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["from_department_id"],
            ["departments.id"],
            name="complaint_redirections_from_department_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["redirected_by_user_id"],
            ["users.id"],
            name="complaint_redirections_redirected_by_user_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["to_department_id"],
            ["departments.id"],
            name="complaint_redirections_to_department_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_complaint_redirections_id",
        "complaint_redirections",
        ["id"],
    )
    op.create_index(
        "ix_complaint_redirections_complaint_id",
        "complaint_redirections",
        ["complaint_id"],
    )

    # 5. Chatbot telemetry
    op.create_table(
        "chatbot_telemetry",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("question_preview", sa.String(length=240), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("source_names", sa.JSON(), nullable=False),
        sa.Column("source_count", sa.Integer(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chatbot_telemetry_id", "chatbot_telemetry", ["id"])
    op.create_index(
        "ix_chatbot_telemetry_created_at",
        "chatbot_telemetry",
        ["created_at"],
    )
    op.create_index(
        "ix_chatbot_telemetry_outcome",
        "chatbot_telemetry",
        ["outcome"],
    )

    # 6. Chatbot audit requests
    op.create_table(
        "chatbot_audit_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("session_id", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("query_text", sa.String(), nullable=False),
        sa.Column("answer_text", sa.String(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("failure_stage", sa.String(length=64), nullable=True),
        sa.Column("failure_category", sa.String(length=64), nullable=True),
        sa.Column("failure_reason", sa.String(length=240), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("source_count", sa.Integer(), nullable=False),
        sa.Column("source_names", sa.JSON(), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=True),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("fallback_reason", sa.String(length=240), nullable=True),
        sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("export_attempts", sa.Integer(), nullable=False),
        sa.Column("export_failures", sa.Integer(), nullable=False),
        sa.Column("export_error", sa.String(length=80), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chatbot_audit_requests_id", "chatbot_audit_requests", ["id"])
    op.create_index(
        "ix_chatbot_audit_requests_created_at",
        "chatbot_audit_requests",
        ["created_at"],
    )
    op.create_index(
        "ix_chatbot_audit_requests_exported_at",
        "chatbot_audit_requests",
        ["exported_at"],
    )
    op.create_index(
        "ix_chatbot_audit_requests_failure_category",
        "chatbot_audit_requests",
        ["failure_category"],
    )
    op.create_index(
        "ix_chatbot_audit_requests_failure_stage",
        "chatbot_audit_requests",
        ["failure_stage"],
    )
    op.create_index(
        "ix_chatbot_audit_requests_request_id",
        "chatbot_audit_requests",
        ["request_id"],
        unique=True,
    )
    op.create_index(
        "ix_chatbot_audit_requests_status",
        "chatbot_audit_requests",
        ["status"],
    )
    op.create_index(
        "ix_chatbot_audit_requests_user_id",
        "chatbot_audit_requests",
        ["user_id"],
    )

    # 7. Chatbot audit stages
    op.create_table(
        "chatbot_audit_stages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.String(length=36), nullable=False),
        sa.Column("stage_name", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column("decision", sa.String(length=120), nullable=True),
        sa.Column("failure_category", sa.String(length=64), nullable=True),
        sa.Column("failure_reason", sa.String(length=240), nullable=True),
        sa.Column("exception_type", sa.String(length=120), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("skip_reason", sa.String(length=240), nullable=True),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["chatbot_audit_requests.request_id"],
            name="chatbot_audit_stages_request_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chatbot_audit_stages_id", "chatbot_audit_stages", ["id"])
    op.create_index(
        "ix_chatbot_audit_stages_failure_category",
        "chatbot_audit_stages",
        ["failure_category"],
    )
    op.create_index(
        "ix_chatbot_audit_stages_request_id",
        "chatbot_audit_stages",
        ["request_id"],
    )
    op.create_index(
        "ix_chatbot_audit_stages_stage_name",
        "chatbot_audit_stages",
        ["stage_name"],
    )
    op.create_index(
        "ix_chatbot_audit_stages_status",
        "chatbot_audit_stages",
        ["status"],
    )


def downgrade():
    raise RuntimeError(
        "The baseline represents pre-existing project data and cannot be downgraded."
    )
