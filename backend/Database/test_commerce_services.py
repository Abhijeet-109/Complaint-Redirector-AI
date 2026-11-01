import unittest

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.Database.connection import Base
from backend.Database.models import (
    Cart,
    CartItem,
    ChatbotAuditRequest,
    ChatbotAuditStage,
    CommerceOrder,
    CommerceOrderItem,
    Inventory,
    Product,
    ProductVariant,
    ReturnRequest,
    Shipment,
    User,
)
from backend.Database.seed_commerce import seed_catalog, seed_demo_activity
from backend.Database.services import (
    add_cart_item,
    get_cart,
    get_order,
    get_product,
    get_shipment,
    get_variant_inventory,
    list_categories,
    list_orders,
    list_products,
    list_returns,
    remove_cart_item,
)


class CommerceServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _record):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(name="Test Customer", email="customer@example.com", password="hash", role="user")
        self.other_user = User(name="Other Customer", email="other@example.com", password="hash", role="user")
        self.session.add_all([self.user, self.other_user])
        self.session.flush()
        seed_catalog(self.session)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def variant(self, sku="FK-DEMO-1"):
        return self.session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))

    def test_seed_is_idempotent_and_retrieval_is_bounded(self):
        seed_catalog(self.session)
        self.session.commit()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Product)), 12)
        self.assertEqual(len(list_categories(self.session)), 7)
        self.assertEqual(len(list_products(self.session)), 12)
        self.assertEqual(len(list_products(self.session, search="Roadster")), 1)
        self.assertEqual(len(list_products(self.session, limit=1)), 1)
        with self.assertRaises(ValueError):
            list_products(self.session, limit=101)

    def test_product_inventory_and_missing_records(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        self.assertIsNotNone(get_product(self.session, product.id))
        self.assertIsNone(get_product(self.session, -1))
        variant, inventory = get_variant_inventory(self.session, self.variant().id)
        self.assertEqual(variant.sku, "FK-DEMO-1")
        self.assertEqual(inventory.available_stock, 12)
        self.assertIsNone(get_variant_inventory(self.session, -1))

    def test_cart_is_owned_by_user_and_checks_quantity_and_stock(self):
        variant = self.variant()
        item = add_cart_item(self.session, self.user.id, variant.id, 2)
        self.session.commit()
        self.assertEqual(get_cart(self.session, self.user.id).items[0].quantity, 2)
        self.assertIsNone(get_cart(self.session, self.other_user.id))
        self.assertFalse(remove_cart_item(self.session, self.other_user.id, variant.id))
        self.assertTrue(remove_cart_item(self.session, self.user.id, variant.id))
        with self.assertRaises(ValueError):
            add_cart_item(self.session, self.user.id, variant.id, 0)
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        inventory.available_stock = 1
        self.session.commit()
        with self.assertRaises(ValueError):
            add_cart_item(self.session, self.user.id, variant.id, 2)

    def test_order_shipment_return_retrieval_is_scoped_to_owner(self):
        variant = self.variant()
        order = CommerceOrder(order_number="TEST-ORDER-1", user_id=self.user.id, status="shipped")
        self.session.add(order)
        self.session.flush()
        item = CommerceOrderItem(
            order_id=order.id,
            variant_id=variant.id,
            product_name=variant.product.name,
            variant_name=variant.name,
            sku=variant.sku,
            quantity=1,
            unit_price=variant.price,
        )
        self.session.add(item)
        self.session.flush()
        shipment = Shipment(order_id=order.id, tracking_reference="TEST-TRACK", status="in_transit")
        request = ReturnRequest(order_id=order.id, order_item_id=item.id, quantity=1, reason="Test", status="requested")
        self.session.add_all([shipment, request])
        self.session.commit()
        self.assertEqual(len(list_orders(self.session, self.user.id)), 1)
        self.assertEqual(get_order(self.session, self.user.id, order.id).items[0].sku, variant.sku)
        self.assertIsNone(get_order(self.session, self.other_user.id, order.id))
        self.assertEqual(get_shipment(self.session, self.user.id, order.id).tracking_reference, "TEST-TRACK")
        self.assertEqual(len(list_returns(self.session, self.user.id, order_id=order.id)), 1)
        self.assertEqual(list_orders(self.session, self.other_user.id), [])

    def test_return_item_must_belong_to_the_same_order(self):
        variant = self.variant()
        first = CommerceOrder(order_number="TEST-ORDER-A", user_id=self.user.id, status="placed")
        second = CommerceOrder(order_number="TEST-ORDER-B", user_id=self.user.id, status="placed")
        self.session.add_all([first, second])
        self.session.flush()
        item = CommerceOrderItem(
            order_id=first.id, variant_id=variant.id, product_name=variant.product.name,
            variant_name=variant.name, sku=variant.sku, quantity=1, unit_price=variant.price,
        )
        self.session.add(item)
        self.session.flush()
        self.session.add(ReturnRequest(order_id=second.id, order_item_id=item.id, quantity=1, reason="Mismatch"))
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

    def test_seeded_demo_activity_is_repeatable_for_existing_user(self):
        seed_demo_activity(self.session, self.user.id)
        seed_demo_activity(self.session, self.user.id)
        self.session.commit()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Cart).where(Cart.user_id == self.user.id)), 1)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(CommerceOrder)), 1)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Shipment)), 1)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(ReturnRequest)), 1)

    def test_audit_primary_key_indexes_match_the_models(self):
        inspector = self.engine.dialect.get_indexes(self.engine.connect(), "chatbot_audit_requests")
        stage_indexes = self.engine.dialect.get_indexes(self.engine.connect(), "chatbot_audit_stages")
        self.assertIn("ix_chatbot_audit_requests_id", [item["name"] for item in inspector])
        self.assertIn("ix_chatbot_audit_stages_id", [item["name"] for item in stage_indexes])


if __name__ == "__main__":
    unittest.main()
