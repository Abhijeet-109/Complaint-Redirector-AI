"""PostgreSQL-only constraint and concurrency checks.

Set TEST_POSTGRES_URL to a disposable database with a name containing `test`
or `scratch`. The test creates and removes only a uniquely named schema there.
"""

import os
import threading
import unittest
import uuid
from urllib.parse import urlparse

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from backend.Database.connection import DATABASE_URL, Base
from backend.Database import models  # noqa: F401 - registers all mapped tables
from backend.Database.models import (
    Cart,
    Inventory,
    Product,
    ProductCategory,
    ProductVariant,
    User,
)
from backend.Database.services import add_cart_item, get_or_create_active_cart


TEST_URL = os.getenv("TEST_POSTGRES_URL")


def _target(url):
    parsed = urlparse(url)
    return parsed.scheme, parsed.hostname, parsed.port, parsed.path


@unittest.skipUnless(TEST_URL, "TEST_POSTGRES_URL is not configured; PostgreSQL behavior is unverified")
class PostgreSQLCommerceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if _target(TEST_URL) == _target(DATABASE_URL):
            raise RuntimeError("TEST_POSTGRES_URL must not point to the configured project database")
        database_name = urlparse(TEST_URL).path.strip("/").split("/")[-1]
        if not any(marker in database_name.casefold() for marker in ("test", "scratch", "disposable")):
            raise RuntimeError("TEST_POSTGRES_URL must identify a disposable test or scratch database")

        cls.schema = f"phase1_test_{uuid.uuid4().hex}"
        cls.admin_engine = create_engine(TEST_URL)
        with cls.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
        cls.engine = create_engine(TEST_URL, connect_args={"options": f"-csearch_path={cls.schema}"})
        with cls.engine.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        cls.sessions = sessionmaker(bind=cls.engine, expire_on_commit=False)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            cls.engine.dispose()
        if hasattr(cls, "admin_engine") and hasattr(cls, "schema"):
            with cls.admin_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
            cls.admin_engine.dispose()

    def setUp(self):
        self.session = self.sessions()
        self.user = User(name="PG Customer", email=f"{uuid.uuid4()}@example.com", password="hash", role="user")
        self.session.add(self.user)
        self.session.flush()
        category = ProductCategory(name="PG Test", slug=f"pg-{uuid.uuid4()}")
        product = Product(name="PG Test Product", slug=f"pg-{uuid.uuid4()}", attributes={}, category=category)
        variant = ProductVariant(product=product, sku=f"PG-{uuid.uuid4()}", name="Default", price=10, is_available=True)
        variant.inventory = Inventory(
            available_stock=5,
            total_stock=5,
            reserved_stock=0,
            stock_status="in_stock",
        )
        self.session.add(product)
        self.session.flush()
        self.variant_id = variant.id
        self.session.commit()

    def tearDown(self):
        self.session.rollback()
        self.session.close()

    def test_partial_unique_index_allows_only_one_active_cart(self):
        self.session.add(Cart(user_id=self.user.id, status="active"))
        self.session.commit()
        self.session.add(Cart(user_id=self.user.id, status="active"))
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()
        indexes = inspect(self.engine).get_indexes("carts")
        self.assertIn("uq_carts_one_active_per_user", [index["name"] for index in indexes])

    def test_postgresql_schema_matches_all_models_and_server_defaults(self):
        with self.engine.connect() as connection:
            migration_context = MigrationContext.configure(
                connection,
                opts={"compare_type": True, "compare_server_default": True},
            )
            self.assertEqual(compare_metadata(migration_context, Base.metadata), [])

    def test_concurrent_cart_additions_serialize_on_inventory_row(self):
        add_cart_item(self.session, self.user.id, self.variant_id, 2)
        self.session.commit()
        barrier = threading.Barrier(2)
        outcomes = []

        def add_two():
            session = self.sessions()
            try:
                barrier.wait(timeout=10)
                add_cart_item(session, self.user.id, self.variant_id, 2)
                session.commit()
                outcomes.append("added")
            except ValueError:
                session.rollback()
                outcomes.append("rejected")
            finally:
                session.close()

        threads = [threading.Thread(target=add_two) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads), "cart update deadlocked")
        self.assertCountEqual(outcomes, ["added", "rejected"])
        self.assertEqual(add_cart_item(self.session, self.user.id, self.variant_id, 1).quantity, 5)
        self.session.rollback()

    def test_active_cart_creation_uses_unique_constraint_recovery(self):
        cart = get_or_create_active_cart(self.session, self.user.id)
        self.session.commit()
        again = get_or_create_active_cart(self.session, self.user.id)
        self.assertEqual(cart.id, again.id)

    def test_concurrent_active_cart_creation_returns_one_cart(self):
        barrier = threading.Barrier(2)
        outcomes = []

        def create_cart():
            session = self.sessions()

            class CoordinatedSession:
                first_lookup = True

                def scalar(inner_self, statement):
                    result = session.scalar(statement)
                    if inner_self.first_lookup:
                        inner_self.first_lookup = False
                        barrier.wait(timeout=10)
                    return result

                def __getattr__(inner_self, name):
                    return getattr(session, name)

            try:
                cart = get_or_create_active_cart(CoordinatedSession(), self.user.id)
                session.commit()
                outcomes.append(cart.id)
            except Exception as exc:
                session.rollback()
                outcomes.append(exc)
            finally:
                session.close()

        threads = [threading.Thread(target=create_cart) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads), "active cart creation deadlocked")
        self.assertEqual(len(outcomes), 2)
        self.assertTrue(all(isinstance(cart_id, int) for cart_id in outcomes), outcomes)
        self.assertEqual(outcomes[0], outcomes[1])

    def test_commerce_downgrade_preserves_legacy_tables(self):
        config = Config("alembic.ini")
        with self.engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "c421f790ab63")
            names = set(inspect(connection).get_table_names())
            self.assertIn("users", names)
            self.assertIn("complaints", names)
            self.assertFalse(names & {
                "product_categories", "products", "product_images", "product_variants", "inventory",
                "carts", "cart_items", "commerce_orders", "commerce_order_items", "shipments", "return_requests",
            })
            command.upgrade(config, "head")


if __name__ == "__main__":
    unittest.main()
