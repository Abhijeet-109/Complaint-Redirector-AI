# Chatbot audit logging

Chatbot audit requests and stages are stored in PostgreSQL tables
`chatbot_audit_requests` and `chatbot_audit_stages`. The existing
`chatbot_telemetry` table and `/chatbot/performance` response remain in place.
Startup creates only missing audit tables with SQLAlchemy `checkfirst`; existing
rows and tables are not dropped or rewritten. Environments that manage schema
changes outside application startup should provision these two tables before
deploying the new code.

Request status values are `success`, `blocked`, `fallback`, `partial_failure`,
and `failed`. Stage status values are `success`, `blocked`, `fallback`, `failed`,
`skipped`, and `pending` (`pending` is used while an Excel export awaits the
worker). The first blocked or failed stage is also copied to the request row.

The lifecycle-managed exporter polls PostgreSQL in bounded batches and writes
`Request Logs`, `Stage Logs`, and a database-derived `Summary` worksheet. A
cross-process file lock protects concurrent writers on a shared local filesystem.
`CHATBOT_AUDIT_WORKBOOK`, `CHATBOT_AUDIT_EXPORT_BATCH_SIZE`, and
`CHATBOT_AUDIT_EXPORT_POLL_SECONDS` configure the path and polling. The default
path is `backend/logs/chatbot_audit.xlsx`; generated workbooks and lock files are
ignored by Git. Database records remain pending and are retried after export
errors or process restarts. Excel export errors never change a chat response.

Queries, answers, source names, session IDs, and diagnostic text are redacted for
common email addresses, phone numbers, and token-like secrets before storage or
export. Exception messages and external payloads are not stored. Excel cells
neutralize formula-leading user strings. The local workbook inherits directory
permissions (and is set to owner-only permissions where supported); PostgreSQL
access controls remain the durable access boundary. Keep the workbook directory
private and define retention/backups for both database audit data and exported
workbooks according to deployment policy; this feature does not delete history.

A local workbook is only safe when all workers share a persistent filesystem
that supports OS file locks. Ephemeral storage loses the export on replacement,
and separate hosts or lockless network volumes are not coordinated. For those
deployments, set `CHATBOT_AUDIT_WORKBOOK` to a deployment-approved shared mount
with working cross-host locking or add a shared export destination before
enabling multiple hosts. PostgreSQL remains authoritative in every case.

The current validators return only `ALLOW` or `REJECT`; therefore policy
rejections are recorded with the generic `policy_rejection` category. Invalid
validator output and validator service failures are recorded separately rather
than assigned a guessed policy reason. Raw validator prompts and hidden
reasoning are never recorded.
