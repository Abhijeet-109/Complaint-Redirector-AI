"""PostgreSQL migration, constraint, and concurrency checks.

Set TEST_DATABASE_URL to a freshly provisioned database owned by a dedicated
non-privileged `flatkart_test_runner_*` role. Tests verify that identity before
creating/dropping only their run-specific schemas.
"""

import os
import re
import threading
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Float, JSON, create_engine, func, inspect, select, text
from sqlalchemy.dialects.postgresql import ARRAY as PostgreSQLArray
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from backend.Database.connection import DATABASE_URL, Base
from backend.Database import models  # noqa: F401 - registers all mapped tables
from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    CommerceOrderItem,
    Department,
    Inventory,
    LoginThrottle,
    PaymentAttempt,
    Product,
    ProductCategory,
    ProductVariant,
    Refund,
    ReturnHandoff,
    ReturnRequest,
    ReturnRequestEvent,
    Shipment,
    User,
)
from backend.Database.checkout_services import create_cod_order, create_online_order, fail_attempt
from backend.Database.return_services import apply_claim_decision, create_return_claim
from backend.Database.services import add_cart_item, get_or_create_active_cart, set_category_parent
from backend.login_lockout import _digest, prepare_login, record_failed_login, record_successful_login


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
CHECKPOINT_TABLES = {"checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations"}


def _target(url):
    parsed = make_url(url)
    return parsed.get_backend_name(), parsed.host, parsed.port, parsed.database


def _verify_test_database(connection):
    if not TEST_DATABASE_URL:
        raise RuntimeError("TEST_DATABASE_URL is required for PostgreSQL tests")
    configured = make_url(TEST_DATABASE_URL)
    project = make_url(DATABASE_URL)
    if _target(TEST_DATABASE_URL) == _target(DATABASE_URL):
        raise RuntimeError("TEST_DATABASE_URL must not point to the configured application database")
    if not configured.database or not configured.database.startswith("flatkart_test_"):
        raise RuntimeError("TEST_DATABASE_URL must identify a fresh flatkart_test_* database")
    if not configured.username or not configured.username.startswith("flatkart_test_runner_"):
        raise RuntimeError("TEST_DATABASE_URL must use a dedicated flatkart_test_runner_* role")

    identity = connection.execute(text("""
        SELECT current_database(), current_user,
               (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()),
               (SELECT oid FROM pg_database WHERE datname = current_database()),
               (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
               (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user),
               (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user)
    """)).one()
    database_name, role_name, owner_name, database_oid, is_superuser, can_create_database, can_create_role = identity
    if database_name != configured.database or role_name != configured.username:
        raise RuntimeError("Connected PostgreSQL identity does not match TEST_DATABASE_URL")
    if database_name == project.database or owner_name != role_name:
        raise RuntimeError("The isolated test role must own a database separate from the application database")
    if is_superuser or can_create_database or can_create_role:
        raise RuntimeError("PostgreSQL test credentials must not have cluster-level privileges")
    return database_name, role_name, database_oid


def _compare_server_defaults(context, inspected_column, metadata_column,
                             rendered_inspected_default, metadata_default,
                             rendered_metadata_default):
    del context, inspected_column, metadata_default
    if isinstance(metadata_column.type, JSON):
        def normalize(expression):
            value = str(expression or "").strip().lower()
            value = re.sub(r"::jsonb?\b", "", value)
            while value.startswith("(") and value.endswith(")"):
                value = value[1:-1].strip()
            return value

        return normalize(rendered_metadata_default) != normalize(rendered_inspected_default)
    return None


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL is not configured; PostgreSQL behavior is unverified")
class PostgreSQLCommerceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = f"commerce_test_{uuid.uuid4().hex}"
        cls.checkpoint_schema = f"checkpoint_guard_{uuid.uuid4().hex}"
        cls.created_schemas = []
        cls.identity = None
        cls.admin_engine = create_engine(TEST_DATABASE_URL)
        cls.engine = None
        try:
            with cls.admin_engine.begin() as connection:
                cls.identity = _verify_test_database(connection)
                existing = set(inspect(connection).get_schema_names())
                if cls.schema in existing or cls.checkpoint_schema in existing:
                    raise RuntimeError("A generated test schema already exists; refusing to reuse it")
                connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
                cls.created_schemas.append(cls.schema)
                connection.execute(text(f'CREATE SCHEMA "{cls.checkpoint_schema}"'))
                cls.created_schemas.append(cls.checkpoint_schema)
                for table_name in sorted(CHECKPOINT_TABLES):
                    connection.execute(text(
                        f'CREATE TABLE "{cls.checkpoint_schema}"."{table_name}" '
                        '(marker INTEGER PRIMARY KEY)'
                    ))
                    connection.execute(text(
                        f'INSERT INTO "{cls.checkpoint_schema}"."{table_name}" (marker) VALUES (1)'
                    ))

            cls.engine = create_engine(
                TEST_DATABASE_URL,
                connect_args={"options": f"-csearch_path={cls.schema}"},
            )
            with cls.engine.begin() as connection:
                if _verify_test_database(connection) != cls.identity:
                    raise RuntimeError("PostgreSQL test database identity changed during setup")
                config = Config("alembic.ini")
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
                cls.expected_head = ScriptDirectory.from_config(config).get_current_head()
                actual_revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
                if actual_revision != cls.expected_head:
                    raise RuntimeError("Alembic did not reach the expected migration head")
            cls.sessions = sessionmaker(bind=cls.engine, expire_on_commit=False)
        except Exception:
            cls._drop_created_schemas()
            cls.admin_engine.dispose()
            if cls.engine is not None:
                cls.engine.dispose()
            raise

    @classmethod
    def _drop_created_schemas(cls):
        if not cls.identity or not cls.created_schemas:
            return
        with cls.admin_engine.begin() as connection:
            if _verify_test_database(connection) != cls.identity:
                raise RuntimeError("Refusing cleanup because the PostgreSQL database identity changed")
            for schema_name in reversed(cls.created_schemas):
                owner = connection.execute(text(
                    "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = :schema"
                ), {"schema": schema_name}).scalar_one_or_none()
                if owner != cls.identity[1]:
                    raise RuntimeError(f"Refusing cleanup of schema not owned by this test run: {schema_name}")
                connection.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
        cls.created_schemas.clear()

    @classmethod
    def tearDownClass(cls):
        if cls.engine is not None:
            cls.engine.dispose()
        if cls.admin_engine is not None:
            cls._drop_created_schemas()
            cls.admin_engine.dispose()

    def setUp(self):
        self.session = self.sessions()
        if _verify_test_database(self.session.connection()) != self.identity:
            self.session.close()
            self.fail("Refusing test writes because the PostgreSQL database identity changed")
        self.user = User(name="PG Customer", email=f"{uuid.uuid4()}@example.com", password="hash", role="user")
        self.session.add(self.user)
        self.session.flush()
        category = ProductCategory(name="PG Test", slug=f"pg-{uuid.uuid4()}")
        product = Product(name="PG Test Product", slug=f"pg-{uuid.uuid4()}", attributes={}, category=category)
        variant = ProductVariant(
            product=product,
            sku=f"PG-{uuid.uuid4()}",
            name="Default",
            price=10,
            mrp=10,
            is_available=True,
        )
        variant.inventory = Inventory(
            available_stock=5,
            total_stock=5,
            reserved_stock=0,
            stock_status="in_stock",
        )
        self.session.add(product)
        self.session.flush()
        self.product = product
        self.variant = variant
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
            self.assertEqual(_verify_test_database(connection), self.identity)
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            self.assertEqual(revision, self.expected_head)
            migration_context = MigrationContext.configure(
                connection,
                opts={
                    "compare_type": True,
                    "compare_server_default": _compare_server_defaults,
                },
            )
            self.assertEqual(compare_metadata(migration_context, Base.metadata), [])

    def test_postgresql_array_type_and_checkpoint_tables_are_isolated(self):
        self.assertEqual(
            set(inspect(self.engine).get_table_names(schema=self.schema)) & CHECKPOINT_TABLES,
            set(),
        )
        columns = inspect(self.engine).get_columns("knowledge_chunks", schema=self.schema)
        embedding = next(column for column in columns if column["name"] == "embedding")
        self.assertIsInstance(embedding["type"], PostgreSQLArray)
        self.assertIsInstance(embedding["type"].item_type, Float)

        with self.admin_engine.connect() as connection:
            self.assertEqual(_verify_test_database(connection), self.identity)
            guard_tables = set(inspect(connection).get_table_names(schema=self.checkpoint_schema))
            self.assertEqual(guard_tables, CHECKPOINT_TABLES)
            for table_name in CHECKPOINT_TABLES:
                marker = connection.execute(text(
                    f'SELECT marker FROM "{self.checkpoint_schema}"."{table_name}"'
                )).scalar_one()
                self.assertEqual(marker, 1)

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

    def test_concurrent_conflicting_category_moves_cannot_create_cycle(self):
        first = ProductCategory(name="PG Category A", slug=f"pg-a-{uuid.uuid4()}")
        second = ProductCategory(name="PG Category B", slug=f"pg-b-{uuid.uuid4()}")
        self.session.add_all([first, second])
        self.session.commit()
        first_id, second_id = first.id, second.id
        barrier = threading.Barrier(2)
        outcomes = []

        def move(category_id, parent_id):
            session = self.sessions()
            try:
                barrier.wait(timeout=10)
                set_category_parent(session, category_id, parent_id)
                session.commit()
                outcomes.append("moved")
            except ValueError:
                session.rollback()
                outcomes.append("rejected")
            except Exception as exc:
                session.rollback()
                outcomes.append(exc)
            finally:
                session.close()

        threads = [
            threading.Thread(target=move, args=(first_id, second_id)),
            threading.Thread(target=move, args=(second_id, first_id)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads), "category move deadlocked")
        self.assertCountEqual(outcomes, ["moved", "rejected"])
        self.session.expire_all()
        first_after = self.session.get(ProductCategory, first_id)
        second_after = self.session.get(ProductCategory, second_id)
        self.assertFalse(first_after.parent_id == second_id and second_after.parent_id == first_id)

    def test_postgresql_login_throttle_persists_and_serializes_concurrent_failures(self):
        email = self.user.email
        client_ip = f"192.0.2.{self.user.id % 254 + 1}"
        hmac_key = "postgres-login-throttle-test-key"
        barrier = threading.Barrier(8)
        outcomes = []

        def record_failure():
            session = self.sessions()
            try:
                barrier.wait(timeout=10)
                record_failed_login(session, email, client_ip, hmac_key=hmac_key)
                outcomes.append("recorded")
            except Exception as exc:
                session.rollback()
                outcomes.append(exc)
            finally:
                session.close()

        threads = [threading.Thread(target=record_failure) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads), "login throttle update deadlocked")
        self.assertEqual(outcomes, ["recorded"] * 8)

        email_digest = _digest("email", email, hmac_key)
        ip_digest = _digest("ip", client_ip, hmac_key)
        email_row = self.session.get(LoginThrottle, ("email", email_digest))
        ip_row = self.session.get(LoginThrottle, ("ip", ip_digest))
        self.assertEqual(email_row.failure_count, 8)
        self.assertEqual(ip_row.failure_count, 8)
        self.assertIsNotNone(email_row.locked_until)
        self.assertGreater(
            prepare_login(self.session, email, client_ip, hmac_key=hmac_key),
            0,
        )

        record_successful_login(self.session, email, hmac_key=hmac_key)
        self.session.expire_all()
        reset_email_row = self.session.get(LoginThrottle, ("email", email_digest))
        self.assertEqual(reset_email_row.failure_count, 0)
        self.assertIsNone(reset_email_row.locked_until)
        self.assertIsNone(prepare_login(self.session, email, client_ip, hmac_key=hmac_key))

    def test_postgresql_online_checkout_failure_releases_inventory_once_and_retries(self):
        self.product.payment_methods = ["upi"]
        self.session.commit()
        add_cart_item(self.session, self.user.id, self.variant_id, 2)
        self.session.commit()
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == self.variant_id))
        address = {"recipient_name": "PG Customer", "pin_code": "411001"}

        with patch.dict(os.environ, {
            "RAZORPAY_MODE": "test",
            "RAZORPAY_KEY_ID": "rzp_test_synthetic",
            "RAZORPAY_KEY_SECRET": "synthetic-test-secret",
        }):
            order, attempt, reused = create_online_order(
                self.session,
                user_id=self.user.id,
                idempotency_key="pg-payment-attempt-1",
                address=address,
            )
            self.assertFalse(reused)
            self.session.commit()
            self.session.refresh(inventory)
            self.assertEqual((inventory.available_stock, inventory.reserved_stock), (3, 2))

            repeated_order, repeated_attempt, reused = create_online_order(
                self.session,
                user_id=self.user.id,
                idempotency_key="pg-payment-attempt-1",
                address=address,
            )
            self.assertTrue(reused)
            self.assertEqual(repeated_order.id, order.id)
            self.assertEqual(repeated_attempt.id, attempt.id)
            self.session.commit()

            self.assertTrue(fail_attempt(self.session, attempt, "Synthetic provider decline"))
            self.session.commit()
            self.assertFalse(fail_attempt(self.session, attempt, "Duplicate failure callback"))
            self.session.commit()
            self.session.refresh(inventory)
            self.assertEqual((inventory.available_stock, inventory.reserved_stock), (5, 0))
            self.assertEqual(order.status, "payment_failed")
            self.assertEqual(order.payment_status, "failed")
            self.assertEqual(self.session.scalar(
                select(func.count()).select_from(CommerceOrder).where(CommerceOrder.user_id == self.user.id)
            ), 1)

            retry_order, retry_attempt, reused = create_online_order(
                self.session,
                user_id=self.user.id,
                idempotency_key="pg-payment-attempt-2",
                address=address,
            )
            self.assertFalse(reused)
            self.assertEqual(retry_order.id, order.id)
            self.assertNotEqual(retry_attempt.id, attempt.id)
            self.session.commit()
            self.session.refresh(inventory)
            self.assertEqual((inventory.available_stock, inventory.reserved_stock), (3, 2))
            self.assertEqual(self.session.scalar(
                select(func.count()).select_from(CommerceOrder).where(CommerceOrder.user_id == self.user.id)
            ), 1)
            self.assertEqual(self.session.scalar(
                select(func.count()).select_from(PaymentAttempt).join(CommerceOrder).where(
                    CommerceOrder.user_id == self.user.id
                )
            ), 2)

    def test_postgresql_cod_checkout_is_idempotent_and_does_not_create_payment_attempts(self):
        self.product.payment_methods = ["cod"]
        self.session.commit()
        add_cart_item(self.session, self.user.id, self.variant_id, 2)
        self.session.commit()
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == self.variant_id))
        address = {"recipient_name": "PG Customer", "pin_code": "411001"}

        order, repeated = create_cod_order(
            self.session,
            user_id=self.user.id,
            idempotency_key="pg-cod-order-1",
            address=address,
        )
        self.assertFalse(repeated)
        self.session.commit()
        self.session.refresh(inventory)
        self.assertEqual((inventory.available_stock, inventory.reserved_stock, inventory.total_stock), (3, 2, 5))
        self.assertEqual(order.payment_method, "cod")
        self.assertEqual(order.payment_status, "pending")
        self.assertEqual(self.session.scalar(
            select(func.count()).select_from(PaymentAttempt).join(CommerceOrder).where(
                CommerceOrder.user_id == self.user.id
            )
        ), 0)

        repeated_order, repeated = create_cod_order(
            self.session,
            user_id=self.user.id,
            idempotency_key="pg-cod-order-1",
            address=address,
        )
        self.assertTrue(repeated)
        self.assertEqual(repeated_order.id, order.id)
        self.session.commit()
        self.session.refresh(inventory)
        self.assertEqual((inventory.available_stock, inventory.reserved_stock, inventory.total_stock), (3, 2, 5))
        self.assertEqual(self.session.scalar(
            select(func.count()).select_from(CommerceOrder).where(CommerceOrder.user_id == self.user.id)
        ), 1)
        cart = self.session.scalar(select(Cart).where(Cart.user_id == self.user.id, Cart.status == "active"))
        self.assertEqual(cart.items, [])

    def test_postgresql_return_submission_is_idempotent_and_hands_off_without_executing_refund(self):
        self.product.is_returnable = True
        self.product.return_window_days = 30
        self.product.is_refundable = True
        self.session.add_all([
            Department(name="Returns & Replacement", email="returns@example.test"),
            Department(name="Order & Delivery", email="delivery@example.test"),
            Department(name="Payments & Refunds", email="payments@example.test"),
        ])
        order = CommerceOrder(
            order_number=f"PG-RETURN-{uuid.uuid4().hex[:12]}",
            user_id=self.user.id,
            status="delivered",
            payment_method="cod",
            payment_status="pending",
            total_amount=20,
        )
        self.session.add(order)
        self.session.flush()
        item = CommerceOrderItem(
            order_id=order.id,
            variant_id=self.variant_id,
            product_name=self.product.name,
            variant_name="Default",
            sku=self.variant.sku,
            quantity=2,
            unit_price=10,
        )
        delivered_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
        self.session.add_all([
            item,
            Shipment(order_id=order.id, status="delivered", delivered_at=delivered_at),
        ])
        self.session.commit()
        submission_key = str(uuid.uuid4())
        barrier = threading.Barrier(2)
        claim_ids = []
        errors = []

        def submit_claim():
            session = self.sessions()
            try:
                barrier.wait(timeout=10)
                claim = create_return_claim(
                    session,
                    user_id=self.user.id,
                    order_id=order.id,
                    order_item_id=item.id,
                    quantity=1,
                    resolution_type="refund",
                    refund_timing="immediate",
                    reason_code="damaged",
                    submission_key=submission_key,
                )
                session.commit()
                claim_ids.append(claim.id)
            except Exception as exc:
                session.rollback()
                errors.append(exc)
            finally:
                session.close()

        threads = [threading.Thread(target=submit_claim) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads), "return submission deadlocked")
        self.assertEqual(errors, [])
        self.assertEqual(len(claim_ids), 2)
        self.assertEqual(claim_ids[0], claim_ids[1])
        claim = self.session.get(ReturnRequest, claim_ids[0])
        self.assertEqual(self.session.scalar(
            select(func.count()).select_from(ReturnRequest).join(CommerceOrder).where(
                CommerceOrder.user_id == self.user.id
            )
        ), 1)
        self.assertEqual(self.session.scalar(
            select(func.count()).select_from(ReturnRequestEvent).join(ReturnRequest).join(CommerceOrder).where(
                CommerceOrder.user_id == self.user.id
            )
        ), 1)

        apply_claim_decision(
            self.session,
            claim.id,
            actor_id=self.user.id,
            decision="approved",
            note="Synthetic test approval",
            refund_timing="immediate",
        )
        self.session.commit()
        handoffs = self.session.scalars(
            select(ReturnHandoff).where(ReturnHandoff.return_request_id == claim.id)
        ).all()
        self.assertCountEqual(
            [handoff.handoff_type for handoff in handoffs],
            ["refund_pickup", "refund_processing"],
        )
        self.assertTrue(all(handoff.status == "pending" for handoff in handoffs))
        self.assertEqual(self.session.scalar(
            select(func.count()).select_from(Refund).join(CommerceOrder).where(
                CommerceOrder.user_id == self.user.id
            )
        ), 0)

    def test_commerce_downgrade_preserves_legacy_tables(self):
        config = Config("alembic.ini")
        with self.engine.begin() as connection:
            self.assertEqual(_verify_test_database(connection), self.identity)
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
