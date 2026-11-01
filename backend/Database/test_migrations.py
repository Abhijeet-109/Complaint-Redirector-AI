"""Isolated SQLite migration checks; PostgreSQL-specific behavior is covered separately."""

import unittest

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, event, inspect

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


if __name__ == "__main__":
    unittest.main()
