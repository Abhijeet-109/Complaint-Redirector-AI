# Database setup and commerce data

## Schema overview

Alembic owns schema changes. The commerce schema includes hierarchical product categories; products, variants, and image metadata; inventory; carts and items; commerce orders and pricing snapshots; shipments; and return requests. `commerce_orders` is separate from the complaint tables. Product image rows store a provider label and storage key; PostgreSQL stores no image bytes.

`Inventory.total_stock` is physical on-hand stock, `reserved_stock` is committed to fulfillment, and `available_stock` is currently sellable. All three are stored, with database checks enforcing `available_stock + reserved_stock = total_stock`, non-negative values, and `reserved_stock <= total_stock`. Cart operations check `available_stock`; adding an item to a cart does not reserve stock or implement checkout. The inventory hardening migration backfills total stock as the sum of existing available and reserved values without deleting either.

Customer-facing commerce reads take the authenticated user's database ID and filter carts, orders, shipments, and returns by that owner. Services accept a SQLAlchemy `Session`, flush as needed, and never commit. The API or job that opens the transaction must commit on success and roll back on error.

## Fresh database setup

Point `DATABASE_URL` at a new, positively identified PostgreSQL database, then run:

```powershell
python -m backend.Database.create_tables
```

This upgrades the selected database to Alembic head. It does not create a database, stamp an existing schema, or run at application startup. Do not run it against an unversioned database containing project tables: Alembic would attempt the baseline DDL.

## Existing database procedure

Never run migrations against the configured project database as part of tests or development verification. Before a separately approved live migration:

1. Take a backup and restore it into a separate database. A successful restore and schema/data comparison are required before calling the backup verified.
2. Identify the target database and inspect its Alembic revision and schema read-only.
3. If it is already at `fde8a87088c6`, review the two additive revisions (`c421f790ab63`, then `9a1d3f6c2e70`) and apply them only after approval.
4. If it has the legacy schema but no Alembic version, compare every baseline table, constraint, sequence, and index first. Only after parity is established may an operator stamp `cc4138de2d48` and upgrade. Do not stamp automatically.
5. If the revision or schema differs from those cases, stop and prepare a database-specific migration plan.

The hardening migration checks for duplicate active carts and self-parent categories before changing schema, and stops with an error instead of deleting or merging records. The baseline and login-throttle downgrades refuse to remove legacy/security data. The audit-index downgrade intentionally leaves indexes in place. The commerce downgrade drops commerce tables and their data; use it only on a disposable database where that data may be discarded. Never downgrade the existing project database as a rollback strategy.

## Seed behavior

Run the default catalogue seed after migrations:

```powershell
python -m backend.Database.seed_commerce
```

The default mode inserts missing categories, products, variants, inventory rows, and image metadata. It does not update matching records or reset stock, so repeated runs preserve manual prices, descriptions, category edits, and inventory. No records are deleted, and user, complaint, department, telemetry, and audit tables are not changed.

Catalogue fields can be intentionally refreshed with `--update-catalog`. This updates seeded category/product descriptions, names, brands, category assignments, variant names, and prices. It does not update inventory, image metadata, or remove records. Review the catalogue changes before using this option.

Optional sample cart/order/shipment/return rows require all of `--allow-demo-activity`, `--user-id`, and `--expected-user-email`. The exact email and ID must identify an existing ordinary customer account, production mode is rejected, and the configured database name must clearly identify a test/scratch/disposable database. The script never creates a user. Do not use demo activity on the project database.

## Category hierarchy and cart concurrency

Category parent links support arbitrary depth. `get_category_tree()` returns a nested tree; `set_category_parent()` rejects self-parenting and moves beneath a descendant. A database check constraint also rejects direct self-parent links. Direct category writes should go through the service so cycle checks are applied.

PostgreSQL and SQLite enforce one active cart per customer with a partial unique index. `get_or_create_active_cart()` uses a savepoint and reloads the winning row after a uniqueness conflict, preserving the caller's outer transaction. Cart item add/remove operations lock the variant's inventory row on databases that support row locks, then read or update the cart line. Concurrent updates therefore serialize and cannot make a single cart line exceed currently available stock. Database constraints reject negative stock, reserved stock above total stock, and self-parent categories; the category service prevents multi-row cycles when changing parent links.

The caller must keep the transaction open through the operation and commit or roll back promptly; PostgreSQL row locks last until that boundary. SQLite ignores `FOR UPDATE`, so SQLite tests do not verify this concurrency behavior.

## Tests and migration checks

Run isolated SQLite service and migration checks:

```powershell
$env:DATABASE_URL = 'sqlite://'
python -m unittest backend.Database.test_commerce_services backend.Database.test_migrations
```

Run complaint route tests separately where their test setup stubs model-dependent imports. Do not run broad discovery if it imports the production predictor or downloads Hugging Face assets; keep those tests mocked at the test boundary without changing production behavior.

PostgreSQL integration checks are in `test_postgres_commerce.py`. They run only when `TEST_POSTGRES_URL` points to a separate database whose name includes `test`, `scratch`, or `disposable`, and they create a uniquely named test schema there. Never set it to `DATABASE_URL`. Without that isolated target, partial-index and row-lock concurrency behavior remains unverified. SQLite migration comparison is useful for model/schema drift but is not a substitute for fresh PostgreSQL migration and downgrade verification.
