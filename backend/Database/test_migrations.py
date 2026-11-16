"""Isolated SQLite migration checks; PostgreSQL-specific behavior is covered separately."""

import unittest
import importlib.util
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, event, inspect
from alembic.migration import MigrationContext
from alembic.operations import Operations

from backend.Database.connection import Base
from backend.Database import models  # noqa: F401 - registers all mapped tables


COMMERCE_TABLES = {
    "product_categories", "products", "product_images", "product_variants", "inventory",
    "carts", "cart_items", "commerce_orders", "commerce_order_items", "shipments", "return_requests",
}


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _record):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

    def tearDown(self):
        self.engine.dispose()

    def test_fresh_chain_matches_commerce_metadata_and_commerce_downgrade_preserves_legacy(self):
        config = Config("alembic.ini")
        with self.engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

            migration_context = MigrationContext.configure(
                connection,
                opts={
                    "compare_type": True,
                    # SQLite reflects PostgreSQL now() defaults as CURRENT_TIMESTAMP.
                    "compare_server_default": False,
                },
            )
            differences = compare_metadata(migration_context, Base.metadata)
            self.assertEqual(differences, [])

            inspector = inspect(connection)
            self.assertIn("users", inspector.get_table_names())
            self.assertEqual(
                set(inspector.get_table_names()) & COMMERCE_TABLES,
                COMMERCE_TABLES,
            )
            command.downgrade(config, "c421f790ab63")
            names_after_downgrade = set(inspect(connection).get_table_names())
            self.assertIn("users", names_after_downgrade)
            self.assertIn("complaints", names_after_downgrade)
            self.assertFalse(names_after_downgrade & COMMERCE_TABLES)

    def test_imagekit_file_reference_migration_adds_and_drops_column(self):
        migration_path = Path(__file__).parent / "migrations" / "versions" / "f6a4c1d8b209_add_imagekit_file_reference.py"
        spec = importlib.util.spec_from_file_location("imagekit_reference_migration", migration_path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with self.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE product_images (id INTEGER PRIMARY KEY)")
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            self.assertIn("provider_file_id", {column["name"] for column in inspect(connection).get_columns("product_images")})
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            self.assertNotIn("provider_file_id", {column["name"] for column in inspect(connection).get_columns("product_images")})

    def test_checkout_payment_migration_preserves_legacy_orders_and_reverses(self):
        migration_path = Path(__file__).parent / "migrations" / "versions" / "20261109_add_checkout_payments.py"
        spec = importlib.util.spec_from_file_location("checkout_payments_migration", migration_path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with self.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql(
                "CREATE TABLE commerce_orders (id INTEGER PRIMARY KEY, order_number VARCHAR(40) NOT NULL UNIQUE, "
                "user_id INTEGER NOT NULL REFERENCES users(id), status VARCHAR(24) NOT NULL, "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            connection.exec_driver_sql("INSERT INTO users (id) VALUES (7)")
            connection.exec_driver_sql(
                "INSERT INTO commerce_orders (id, order_number, user_id, status) VALUES (1, 'FK-LEGACY-1', 7, 'placed')"
            )
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            columns = {column["name"] for column in inspect(connection).get_columns("commerce_orders")}
            self.assertTrue({"subtotal", "total_amount", "currency", "payment_status", "delivery_address", "idempotency_key"}.issubset(columns))
            self.assertIn("payment_attempts", inspect(connection).get_table_names())
            self.assertIn("payment_webhook_events", inspect(connection).get_table_names())
            legacy = connection.exec_driver_sql(
                "SELECT order_number, status, currency, payment_status, total_amount FROM commerce_orders WHERE id = 1"
            ).one()
            self.assertEqual(tuple(legacy), ("FK-LEGACY-1", "placed", "INR", "pending", None))
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            self.assertNotIn("payment_attempts", inspect(connection).get_table_names())
            columns_after = {column["name"] for column in inspect(connection).get_columns("commerce_orders")}
            self.assertNotIn("payment_status", columns_after)
            self.assertEqual(
                connection.exec_driver_sql("SELECT order_number, status FROM commerce_orders WHERE id = 1").one(),
                ("FK-LEGACY-1", "placed"),
            )

    def test_order_and_shipment_event_migration_preserves_legacy_rows_and_guards_downgrade(self):
        migration_path = Path(__file__).parent / "migrations" / "versions" / "f2b8c6d4a109_separate_order_and_shipment_events.py"
        spec = importlib.util.spec_from_file_location("order_shipment_event_migration", migration_path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with self.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE commerce_orders (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE shipments (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql(
                "CREATE TABLE shipment_events ("
                "id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL REFERENCES shipments(id), "
                "previous_status VARCHAR(32), new_status VARCHAR(32) NOT NULL, "
                "changed_by_id INTEGER REFERENCES users(id), note VARCHAR(500), "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
            connection.exec_driver_sql("INSERT INTO commerce_orders (id) VALUES (1)")
            connection.exec_driver_sql("INSERT INTO shipments (id) VALUES (1)")
            connection.exec_driver_sql(
                "INSERT INTO shipment_events (id, shipment_id, new_status) VALUES (1, 1, 'shipped')"
            )
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()

            legacy = connection.exec_driver_sql(
                "SELECT event_type, order_id, shipment_id, new_status FROM shipment_events WHERE id = 1"
            ).one()
            self.assertEqual(tuple(legacy), ("shipment_status", None, 1, "shipped"))
            connection.exec_driver_sql(
                "INSERT INTO shipment_events (event_type, order_id, shipment_id, new_status) "
                "VALUES ('order_status', 1, NULL, 'accepted')"
            )
            with self.assertRaisesRegex(RuntimeError, "order status history exists"):
                with Operations.context(MigrationContext.configure(connection)):
                    migration.downgrade()

            connection.exec_driver_sql("DELETE FROM shipment_events WHERE event_type = 'order_status'")
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            self.assertNotIn("event_type", {column["name"] for column in inspect(connection).get_columns("shipment_events")})
            shipment_id = next(column for column in inspect(connection).get_columns("shipment_events") if column["name"] == "shipment_id")
            self.assertFalse(shipment_id["nullable"])
            self.assertEqual(
                connection.exec_driver_sql("SELECT shipment_id, new_status FROM shipment_events WHERE id = 1").one(),
                (1, "shipped"),
            )


if __name__ == "__main__":
    unittest.main()
