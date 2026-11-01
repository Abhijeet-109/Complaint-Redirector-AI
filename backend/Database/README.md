# Database setup and commerce data

Alembic is the schema manager. A fresh PostgreSQL database is prepared with:

```powershell
python -m backend.Database.create_tables
```

The command upgrades the database configured by `DATABASE_URL` to the current Alembic head. Review and positively identify that target before running it. It does not create a database, stamp an existing schema, or run automatically during application startup. Never use it on the existing project database without a verified backup and an approved migration window.

The commerce tables cover categories, products, image metadata, variants, inventory, carts, orders, shipments, and returns. Customer order, shipment, cart, and return reads in `services.py` are scoped by the authenticated user's database ID. The service layer accepts a SQLAlchemy `Session`; callers control the transaction and commit.

Seed the frontend catalogue after migrations:

```powershell
python -m backend.Database.seed_commerce
```

The catalogue seed is repeatable and does not create, update, or delete users, complaints, departments, or chatbot records. For isolated development/test data only, an existing user can be associated with a repeatable sample cart, order, shipment, and return request by passing `--user-id <id>`. Run that option only against an isolated database and a test user. The script never creates a user.

Product image rows store provider and storage key metadata only. The seed uses existing frontend asset keys; image bytes are not stored in PostgreSQL.

The audit-index revision adds missing indexes to databases already at the previous head. The baseline also represents them for fresh installs. The baseline and login-throttle downgrades intentionally refuse destructive removal of existing project/security data. Commerce downgrade removes only the newly added commerce tables and must only be considered on a disposable database with data that may be discarded.
