import unittest

from sqlalchemy import create_engine, event, func, inspect, select
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
from backend.Database.seed_commerce import PRODUCTS, seed_catalog, seed_demo_activity
from backend.Database.services import (
    add_cart_item,
    get_cart,
    get_category_tree,
    get_order,
    get_or_create_active_cart,
    get_product,
    get_shipment,
    get_variant_inventory,
    list_categories,
    list_orders,
    list_products,
    list_returns,
    remove_cart_item,
    set_category_parent,
)


class CommerceServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _record):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(
            self.engine,
            tables=[table for table in Base.metadata.sorted_tables if table.name != "knowledge_chunks"],
        )
        self.session = Session(self.engine)
        self.user = User(name="Test Customer", email="customer@example.com", password="hash", role="user")
        self.other_user = User(name="Other Customer", email="other@example.com", password="hash", role="user")
        self.session.add_all([self.user, self.other_user])
        self.session.flush()
        self.variant_ids = seed_catalog(self.session)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def variant(self, sku="FK-DEMO-1"):
        return self.session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))

    def test_seed_is_idempotent_and_retrieval_is_bounded(self):
        seed_catalog(self.session)
        self.session.commit()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Product)), len(PRODUCTS))
        self.assertEqual(len(list_categories(self.session)), 9)
        self.assertEqual(len(list_products(self.session)), len(PRODUCTS))
        self.assertEqual(len(list_products(self.session, search="Roadster")), 2)
        self.assertEqual(len(list_products(self.session, limit=1)), 1)
        with self.assertRaises(ValueError):
            list_products(self.session, limit=101)

    def test_default_seed_does_not_overwrite_curated_data_or_stock(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        variant = self.variant()
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        category = product.category
        product.description = "Manually curated description"
        product.is_active = False
        variant.price = 777
        variant.is_available = False
        inventory.available_stock = 2
        inventory.total_stock = 3
        inventory.reserved_stock = 1
        category.is_active = False
        self.session.commit()
        seed_catalog(self.session)
        self.session.commit()
        self.assertEqual(product.description, "Manually curated description")
        self.assertFalse(product.is_active)
        self.assertEqual(variant.price, 777)
        self.assertFalse(variant.is_available)
        self.assertFalse(category.is_active)
        self.assertEqual(inventory.total_stock, 3)
        self.assertEqual(inventory.reserved_stock, 1)

    def test_explicit_catalog_update_changes_catalog_fields_but_never_stock(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        variant = self.variant()
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        category = product.category
        product.description = "Manually curated description"
        product.is_active = False
        variant.price = 777
        variant.is_available = False
        category.is_active = False
        inventory.available_stock = 2
        inventory.total_stock = 3
        inventory.reserved_stock = 1
        self.session.commit()
        seed_catalog(self.session, update_catalog=True)
        self.session.commit()
        self.assertEqual(product.description, "M to XXL")
        self.assertFalse(product.is_active)
        self.assertEqual(variant.price, 1299)
        self.assertFalse(variant.is_available)
        self.assertFalse(category.is_active)
        self.assertEqual(inventory.total_stock, 3)
        self.assertEqual(inventory.reserved_stock, 1)

    def test_category_hierarchy_and_cycle_protection(self):
        tree = get_category_tree(self.session)
        fashion = next(node for node in tree if node["slug"] == "fashion")
        men = next(node for node in fashion["children"] if node["slug"] == "men")
        self.assertEqual(men["children"], [])
        categories = {category.slug: category for category in list_categories(self.session)}
        set_category_parent(self.session, categories["men"].id, categories["women"].id)
        self.session.commit()
        with self.assertRaises(ValueError):
            set_category_parent(self.session, categories["fashion"].id, categories["men"].id)
        with self.assertRaises(ValueError):
            set_category_parent(self.session, categories["men"].id, categories["men"].id)

    def test_active_category_tree_excludes_descendants_of_inactive_ancestors(self):
        categories = {category.slug: category for category in list_categories(self.session, active_only=False)}
        categories["fashion"].is_active = False
        self.session.commit()

        active_tree = get_category_tree(self.session, active_only=True)
        all_tree = get_category_tree(self.session, active_only=False)
        self.assertNotIn("fashion", {node["slug"] for node in active_tree})
        self.assertNotIn("men", {node["slug"] for node in active_tree})
        self.assertIn("men", {
            child["slug"]
            for root in all_tree
            for child in root["children"]
        })

    def test_category_tree_detects_corrupt_multi_node_cycle(self):
        categories = {category.slug: category for category in list_categories(self.session)}
        categories["fashion"].parent_id = categories["men"].id
        self.session.commit()
        with self.assertRaises(RuntimeError):
            get_category_tree(self.session, active_only=False)

    def test_database_rejects_self_parent_category(self):
        category = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt")).category
        category.parent_id = category.id
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

    def test_product_category_inactive_and_image_filters(self):
        men = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        category_id = men.category_id
        category_products = list_products(self.session, category_id=category_id)
        self.assertIn(men.id, [product.id for product in category_products])
        self.assertTrue(all(product.category_id == category_id for product in category_products))
        self.assertEqual(len(men.images), 1)
        self.assertEqual(len(men.variants), 1)
        for product in category_products:
            product.is_active = False
        self.session.commit()
        self.assertEqual(list_products(self.session, category_id=category_id), [])
        self.assertIsNone(get_product(self.session, men.id))

    def test_product_inventory_and_missing_records(self):
        product = self.session.scalar(select(Product).where(Product.slug == "men-sold-casual-shirt"))
        self.assertIsNotNone(get_product(self.session, product.id))
        self.assertIsNone(get_product(self.session, -1))
        variant, inventory = get_variant_inventory(self.session, self.variant().id)
        self.assertEqual(variant.sku, "FK-DEMO-1")
        self.assertEqual(inventory.available_stock, 12)
        self.assertEqual(inventory.stock_status, "in_stock")
        self.assertIsNone(get_variant_inventory(self.session, -1))

    def test_cart_is_owned_by_user_and_checks_quantity_and_stock(self):
        variant = self.variant()
        item = add_cart_item(self.session, self.user.id, variant.id, 2)
        self.assertEqual(item.quantity, 2)
        item = add_cart_item(self.session, self.user.id, variant.id, 3)
        self.assertEqual(item.quantity, 5)
        self.session.commit()
        self.assertEqual(get_cart(self.session, self.user.id).items[0].quantity, 5)
        self.assertIsNone(get_cart(self.session, self.other_user.id))
        self.assertFalse(remove_cart_item(self.session, self.other_user.id, variant.id))
        self.assertTrue(remove_cart_item(self.session, self.user.id, variant.id))
        with self.assertRaises(ValueError):
            add_cart_item(self.session, self.user.id, variant.id, 0)
        variant.is_available = False
        self.session.commit()
        with self.assertRaises(LookupError):
            add_cart_item(self.session, self.user.id, variant.id, 1)
        variant.is_available = True
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        inventory.available_stock = 3
        inventory.total_stock = 4
        inventory.reserved_stock = 1
        self.session.commit()
        self.assertEqual(inventory.available_stock, 3)
        self.assertEqual(inventory.stock_status, "in_stock")
        with self.assertRaises(ValueError):
            add_cart_item(self.session, self.user.id, variant.id, 4)

    def test_cart_rejects_variant_of_inactive_product(self):
        variant = self.variant()
        variant.product.is_active = False
        self.session.commit()
        with self.assertRaises(LookupError):
            add_cart_item(self.session, self.user.id, variant.id, 1)

    def test_inventory_database_constraints_and_single_active_cart(self):
        self.session.add(Cart(user_id=self.user.id, status="active"))
        self.session.commit()
        self.session.add(Cart(user_id=self.user.id, status="active"))
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()
        variant = self.variant()
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        inventory.total_stock = 2
        inventory.reserved_stock = 2
        inventory.available_stock = 0
        inventory.stock_status = "out_of_stock"
        self.session.commit()
        self.assertEqual(inventory.available_stock, 0)
        self.assertEqual(inventory.stock_status, "out_of_stock")
        inventory.stock_status = "in_stock"
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        inventory.total_stock = 2
        inventory.reserved_stock = 1
        inventory.available_stock = 1
        inventory.stock_status = "in_stock"
        self.session.commit()
        self.assertEqual(inventory.available_stock, 1)
        self.assertEqual(inventory.reserved_stock, 1)
        self.assertEqual(inventory.total_stock, 2)
        inventory.total_stock = 1
        inventory.reserved_stock = 2
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

    def test_active_cart_creation_recovers_from_a_uniqueness_conflict(self):
        existing = get_or_create_active_cart(self.session, self.user.id)
        self.session.commit()

        class MissFirstLookup:
            def __init__(inner_self):
                inner_self.first = True

            def scalar(inner_self, statement):
                if inner_self.first:
                    inner_self.first = False
                    return None
                return self.session.scalar(statement)

            def __getattr__(inner_self, name):
                return getattr(self.session, name)

        recovered = get_or_create_active_cart(MissFirstLookup(), self.user.id)
        self.assertEqual(existing.id, recovered.id)

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
        other_order = CommerceOrder(order_number="OTHER-ORDER", user_id=self.other_user.id, status="shipped")
        self.session.add(other_order)
        self.session.flush()
        other_item = CommerceOrderItem(
            order_id=other_order.id, variant_id=variant.id, product_name=variant.product.name,
            variant_name=variant.name, sku=variant.sku, quantity=1, unit_price=variant.price,
        )
        self.session.add(other_item)
        self.session.flush()
        self.session.add_all([
            Shipment(order_id=other_order.id, tracking_reference="OTHER-TRACK", status="in_transit"),
            ReturnRequest(order_id=other_order.id, order_item_id=other_item.id, quantity=1, reason="Other customer"),
        ])
        self.session.commit()
        self.assertIsNone(get_shipment(self.session, self.user.id, other_order.id))
        self.assertEqual(list_returns(self.session, self.user.id), [request])

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
        seed_demo_activity(self.session, self.user.id, self.user.email, self.variant_ids)
        seed_demo_activity(self.session, self.user.id, self.user.email, self.variant_ids)
        self.session.commit()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Cart).where(Cart.user_id == self.user.id)), 1)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(CommerceOrder)), 8)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Shipment)), 4)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(ReturnRequest)), 2)

    def test_demo_activity_requires_matching_customer_identity(self):
        with self.assertRaises(LookupError):
            seed_demo_activity(self.session, self.user.id, self.other_user.email, self.variant_ids)
        admin = User(name="Admin", email="admin@example.com", password="hash", role="admin")
        self.session.add(admin)
        self.session.flush()
        with self.assertRaises(LookupError):
            seed_demo_activity(self.session, admin.id, admin.email, self.variant_ids)

    def test_audit_primary_key_indexes_match_the_models(self):
        inspector = inspect(self.engine).get_indexes("chatbot_audit_requests")
        stage_indexes = inspect(self.engine).get_indexes("chatbot_audit_stages")
        self.assertIn("ix_chatbot_audit_requests_id", [item["name"] for item in inspector])
        self.assertIn("ix_chatbot_audit_stages_id", [item["name"] for item in stage_indexes])


if __name__ == "__main__":
    unittest.main()
