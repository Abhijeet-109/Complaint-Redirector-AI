"""Database-backed tests for customer-facing specialist agent tools."""

import unittest
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from backend.Database.connection import Base
from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    CommerceOrderItem,
    Inventory,
    Product,
    ProductCategory,
    ProductImage,
    ProductVariant,
    Shipment,
    ShipmentEvent,
    User,
    UserAddress,
)
from backend.agents.product import tools as product_tools
from backend.agents.cart import tools as cart_tools
from backend.agents.order import tools as order_tools
from backend.agents.shipping import tools as shipping_tools
from backend.agents.support import tools as support_tools


class CustomerAgentToolTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        event.listen(
            self.engine,
            "connect",
            lambda connection, _record: connection.execute("PRAGMA foreign_keys=ON"),
        )
        table_names = (
            "users", "departments", "product_categories", "products", "product_variants", "product_images",
            "inventory", "carts", "cart_items", "commerce_orders", "commerce_order_items",
            "shipments", "shipment_events", "user_addresses",
        )
        Base.metadata.create_all(
            self.engine,
            tables=[Base.metadata.tables[name] for name in table_names],
        )
        # The model's default-address index is partial on PostgreSQL; recreate
        # that predicate in SQLite so multiple non-default test addresses work.
        with self.engine.begin() as connection:
            connection.exec_driver_sql("DROP INDEX uq_user_addresses_one_default_per_user")
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX uq_user_addresses_one_default_per_user "
                "ON user_addresses(user_id) WHERE is_default = 1"
            )
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.user = User(name="Customer", email="customer@example.test", password="hash", mobile_number="9876543210")
        self.other_user = User(name="Other", email="other@example.test", password="secret", mobile_number="9111222333")
        self.active_category = ProductCategory(name="Electronics", slug="electronics", is_active=True)
        self.inactive_category = ProductCategory(name="Hidden", slug="hidden", is_active=False)
        self.db.add_all([self.user, self.other_user, self.active_category, self.inactive_category])
        self.db.flush()

        self.product = Product(
            category_id=self.active_category.id, name="Stored Speaker", slug="stored-speaker",
            brand="Sound Co", description="Full description", short_description="Portable speaker",
            highlights=["Bluetooth"], specifications={"power": "10W"}, is_active=True,
        )
        self.inactive_product = Product(
            category_id=self.active_category.id, name="Hidden Speaker", slug="hidden-speaker",
            brand="Sound Co", is_active=False,
        )
        self.hidden_category_product = Product(
            category_id=self.inactive_category.id, name="Hidden Category Product",
            slug="hidden-category-product", brand="Private", is_active=True,
        )
        self.db.add_all([self.product, self.inactive_product, self.hidden_category_product])
        self.db.flush()
        self.variant = ProductVariant(
            product_id=self.product.id, sku="SPEAKER-BLK", name="Black",
            price=Decimal("30.00"), mrp=Decimal("40.00"), is_available=True,
        )
        self.out_of_stock_variant = ProductVariant(
            product_id=self.product.id, sku="SPEAKER-WHT", name="White",
            price=Decimal("35.00"), mrp=Decimal("40.00"), is_available=True,
        )
        self.new_variant = ProductVariant(
            product_id=self.product.id, sku="SPEAKER-BLU", name="Blue",
            price=Decimal("32.00"), mrp=Decimal("40.00"), is_available=True,
        )
        self.db.add_all([self.variant, self.out_of_stock_variant, self.new_variant])
        self.db.flush()
        self.db.add_all([
            Inventory(variant_id=self.variant.id, available_stock=5, reserved_stock=0, total_stock=5, stock_status="in_stock"),
            Inventory(variant_id=self.out_of_stock_variant.id, available_stock=0, reserved_stock=0, total_stock=0, stock_status="out_of_stock"),
            Inventory(variant_id=self.new_variant.id, available_stock=1, reserved_stock=0, total_stock=1, stock_status="in_stock"),
            ProductImage(product_id=self.product.id, variant_id=None, storage_key="https://cdn.example/speaker.jpg", provider="public_cdn"),
        ])

        self.cart = Cart(user_id=self.user.id, status="active")
        self.other_cart = Cart(user_id=self.other_user.id, status="active")
        self.db.add_all([self.cart, self.other_cart])
        self.db.flush()
        self.db.add_all([
            CartItem(cart_id=self.cart.id, variant_id=self.variant.id, quantity=2),
            CartItem(cart_id=self.other_cart.id, variant_id=self.variant.id, quantity=1),
        ])

        self.order = CommerceOrder(
            order_number="ORD-CUSTOMER", user_id=self.user.id, status="shipped",
            subtotal=Decimal("30.00"), total_amount=Decimal("30.00"), currency="INR",
            payment_method="cod", payment_status="pending", placed_at=datetime(2026, 1, 2),
        )
        self.no_shipment_order = CommerceOrder(
            order_number="ORD-NO-SHIPMENT", user_id=self.user.id, status="placed",
            total_amount=Decimal("0.00"), payment_status="captured",
        )
        self.other_order = CommerceOrder(
            order_number="ORD-OTHER", user_id=self.other_user.id, status="delivered",
            total_amount=Decimal("30.00"), payment_status="captured",
        )
        self.db.add_all([self.order, self.no_shipment_order, self.other_order])
        self.db.flush()
        self.order_item = CommerceOrderItem(
            order_id=self.order.id, variant_id=self.variant.id,
            product_name="Historical Speaker Name", variant_name="Historical Black",
            sku="OLD-SKU", quantity=1, unit_price=Decimal("25.00"),
        )
        self.other_order_item = CommerceOrderItem(
            order_id=self.other_order.id, variant_id=self.variant.id,
            product_name="Other Speaker", variant_name="Black", sku="SPEAKER-BLK",
            quantity=1, unit_price=Decimal("30.00"),
        )
        self.db.add_all([self.order_item, self.other_order_item])
        self.db.flush()
        self.shipment = Shipment(
            order_id=self.order.id, tracking_reference="TRACK-1", status="shipped",
            carrier="Stored Carrier", tracking_url="https://carrier.example/track/TRACK-1",
            estimated_delivery_date=datetime(2026, 1, 5), shipped_at=datetime(2026, 1, 3),
            notes="Internal note must not be exposed",
        )
        self.db.add(self.shipment)
        self.db.flush()
        self.db.add_all([
            ShipmentEvent(shipment_id=self.shipment.id, previous_status=None, new_status="pending", note="Internal note", created_at=datetime(2026, 1, 2)),
            ShipmentEvent(shipment_id=self.shipment.id, previous_status="pending", new_status="shipped", note="Internal note", created_at=datetime(2026, 1, 3)),
            UserAddress(
                user_id=self.user.id, recipient_name="Customer Name", mobile_number="9876543210",
                address_line1="Private street", locality="Private locality", city="Pune", state="Maharashtra",
                pin_code="411001", label="Home", is_default=True,
            ),
            UserAddress(
                user_id=self.user.id, recipient_name="Work Contact", mobile_number="9876543200",
                address_line1="Office street", locality="Office locality", city="Mumbai", state="Maharashtra",
                pin_code="400001", label="Work", is_default=False,
            ),
            UserAddress(
                user_id=self.other_user.id, recipient_name="Other Person", mobile_number="9111222333",
                address_line1="Other street", locality="Other locality", city="Delhi", state="Delhi",
                pin_code="110001", label="Home", is_default=True,
            ),
        ])
        self.db.commit()
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.patches = [
            patch.object(module, "SessionLocal", self.Session)
            for module in (product_tools, cart_tools, order_tools, shipping_tools, support_tools)
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def tools(self, module, user_id=None):
        factory = module.build_product_tools if module is product_tools else None
        if module is product_tools:
            built = factory()
        elif module is cart_tools:
            built = module.build_cart_tools(self.user.id if user_id is None else user_id)
        elif module is order_tools:
            built = module.build_order_tools(self.user.id if user_id is None else user_id)
        elif module is shipping_tools:
            built = module.build_shipping_tools(self.user.id if user_id is None else user_id)
        else:
            built = module.build_support_tools(self.user.id if user_id is None else user_id)
        return {tool.name: tool for tool in built}

    def test_product_search_category_details_and_stock_are_database_backed(self):
        tools = self.tools(product_tools)
        found = tools["search_products"].invoke({"query": "Sound Co"})
        self.assertTrue(found["success"])
        self.assertEqual(found["count"], 1)
        self.assertEqual(found["products"][0]["category"], "Electronics")
        self.assertTrue(found["products"][0]["variants"][0]["is_available"])
        by_category = tools["search_products_by_category"].invoke({"category": "electronics"})
        self.assertEqual(by_category["count"], 1)
        details = tools["get_product_details"].invoke({"product_id": self.product.id})["product"]
        self.assertEqual(details["highlights"], ["Bluetooth"])
        self.assertEqual(details["specifications"], {"power": "10W"})
        self.assertEqual(details["images"][0]["url"], "https://cdn.example/speaker.jpg")
        self.assertNotIn("storage_key", str(details))
        variants = {row["sku"]: row for row in details["variants"]}
        self.assertEqual(variants["SPEAKER-BLK"]["available_stock"], 5)
        self.assertTrue(variants["SPEAKER-BLK"]["is_available"])
        self.assertEqual(variants["SPEAKER-WHT"]["available_stock"], 0)
        self.assertFalse(variants["SPEAKER-WHT"]["is_available"])

    def test_product_tools_reject_bad_inputs_and_hide_inactive_catalogue(self):
        tools = self.tools(product_tools)
        self.assertFalse(tools["search_products"].invoke({"query": " "})["success"])
        self.assertFalse(tools["get_product_details"].invoke({"product_id": True})["success"])
        self.assertFalse(tools["search_products_by_category"].invoke({"category": "hidden"})["success"])
        self.assertFalse(tools["get_product_details"].invoke({"product_id": self.inactive_product.id})["success"])
        categories = tools["list_product_categories"].invoke({})["categories"]
        self.assertEqual([row["slug"] for row in categories], ["electronics"])
        self.assertNotIn("is_active", str(categories))
        compared = tools["compare_products"].invoke({
            "product_ids": f"{self.product.id},{self.product.id},{self.inactive_product.id}",
        })
        self.assertEqual(compared["count"], 1)
        self.assertEqual(compared["not_found"], [self.inactive_product.id])
        for invalid in ("1,,2", "-1", "0", "1,999999999999999999999"):
            self.assertFalse(tools["compare_products"].invoke({"product_ids": invalid})["success"])

    def test_cart_read_add_update_remove_and_ownership(self):
        tools = self.tools(cart_tools)
        current = tools["get_my_cart"].invoke({})["cart"]
        self.assertEqual(current["item_count"], 2)
        self.assertEqual(current["total"], "60.00")
        added = tools["add_item_to_my_cart"].invoke({"variant_id": self.out_of_stock_variant.id, "quantity": 1})
        self.assertFalse(added["success"])
        added = tools["add_item_to_my_cart"].invoke({"variant_id": self.new_variant.id, "quantity": 1})
        self.assertTrue(added["success"], added.get("message"))
        self.assertEqual(added["cart"]["item_count"], 3)
        self.assertTrue(any(row["variant_id"] == self.new_variant.id for row in added["cart"]["items"]))
        self.assertIn("final checkout amount may differ", added["message"])
        updated = tools["update_my_cart_item_quantity"].invoke({"variant_id": self.variant.id, "quantity": 3})
        self.assertTrue(updated["success"], updated.get("message"))
        self.assertEqual(updated["cart"]["items"][0]["quantity"], 3)
        self.assertFalse(tools["update_my_cart_item_quantity"].invoke({
            "variant_id": self.variant.id, "quantity": 6,
        })["success"])
        removed = tools["remove_item_from_my_cart"].invoke({"variant_id": self.variant.id})
        self.assertTrue(removed["success"])
        self.assertFalse(tools["remove_item_from_my_cart"].invoke({
            "variant_id": self.variant.id,
        })["success"])
        other_quantity = self.db.scalar(select(CartItem.quantity).where(CartItem.cart_id == self.other_cart.id))
        self.assertEqual(other_quantity, 1)

    def test_cart_validation_and_empty_cart(self):
        self.db.query(CartItem).filter(CartItem.cart_id == self.cart.id).delete()
        self.db.commit()
        tools = self.tools(cart_tools)
        self.assertEqual(tools["get_my_cart"].invoke({})["cart"]["items"], [])
        self.assertEqual(tools["get_my_cart"].invoke({})["cart"]["total"], "0.00")
        for args in (
            {"variant_id": True, "quantity": 1},
            {"variant_id": self.variant.id, "quantity": 0},
            {"variant_id": self.variant.id, "quantity": 1000},
        ):
            self.assertFalse(tools["add_item_to_my_cart"].func(**args)["success"])
        self.assertFalse(tools["add_item_to_my_cart"].invoke({
            "variant_id": True, "quantity": 1,
        })["success"])

    def test_order_listing_details_status_and_ownership(self):
        tools = self.tools(order_tools)
        listing = tools["list_my_orders"].invoke({"status": "shipped", "limit": 5})
        self.assertTrue(listing["success"])
        self.assertEqual(listing["count"], 1)
        order_summary = listing["orders"][0]
        self.assertEqual(order_summary["payment_status"], "pending")
        self.assertEqual(order_summary["payment_method"], "cod")
        self.assertEqual(order_summary["item_count"], 1)
        self.assertEqual(order_summary["total_amount"], "30.00")
        self.assertFalse(tools["list_my_orders"].invoke({"status": "unknown"})["success"])
        self.assertFalse(tools["list_my_orders"].invoke({"limit": True})["success"])
        details = tools["get_order_details"].invoke({"order_number": "ORD-CUSTOMER"})
        self.assertTrue(details["success"])
        item = details["order"]["items"][0]
        self.assertEqual(item["product"], "Historical Speaker Name")
        self.assertEqual(item["sku"], "OLD-SKU")
        self.assertEqual(item["unit_price"], "25.00")
        self.assertEqual(item["line_total"], "25.00")
        self.assertFalse(tools["get_order_details"].invoke({"order_number": "ORD-OTHER"})["success"])
        self.assertFalse(tools["get_order_details"].invoke({"order_number": " "})["success"])
        status = tools["get_order_status"].invoke({"order_number": "ORD-CUSTOMER"})
        self.assertEqual(status["status"], "shipped")
        self.assertNotIn("shipment", status)

    def test_shipping_listing_details_events_and_tracking_url_safety(self):
        tools = self.tools(shipping_tools)
        listing = tools["list_my_shipments"].invoke({})
        self.assertTrue(listing["success"])
        shipments = {row["order_number"]: row for row in listing["shipments"]}
        self.assertTrue(shipments["ORD-CUSTOMER"]["shipment_available"])
        self.assertEqual(shipments["ORD-CUSTOMER"]["carrier"], "Stored Carrier")
        self.assertFalse(shipments["ORD-NO-SHIPMENT"]["shipment_available"])
        details = tools["get_my_shipment"].invoke({"order_number": "ORD-CUSTOMER"})["shipment"]
        self.assertEqual([row["new_status"] for row in details["events"]], ["pending", "shipped"])
        self.assertNotIn("Internal note", str(details))
        self.assertEqual(details["tracking_url"], "https://carrier.example/track/TRACK-1")
        missing = tools["get_my_shipment"].invoke({"order_number": "ORD-NO-SHIPMENT"})
        self.assertTrue(missing["success"])
        self.assertFalse(missing["shipment"]["shipment_available"])
        self.assertFalse(tools["get_my_shipment"].invoke({"order_number": "ORD-OTHER"})["success"])
        self.shipment.tracking_url = "javascript:alert(1)"
        self.db.commit()
        invalid_url = tools["get_my_shipment"].invoke({"order_number": "ORD-CUSTOMER"})["shipment"]
        self.assertIsNone(invalid_url["tracking_url"])

    def test_support_account_and_addresses_are_scoped_and_minimized(self):
        tools = self.tools(support_tools)
        account = tools["get_my_account_summary"].invoke({})["account"]
        self.assertEqual(account["name"], "Customer")
        self.assertEqual(account["mobile_number"], "******3210")
        self.assertNotIn("password", str(account))
        addresses = tools["list_my_saved_addresses"].invoke({})
        self.assertEqual(addresses["count"], 2)
        self.assertTrue(addresses["addresses"][0]["is_default"])
        self.assertEqual(addresses["addresses"][0]["city"], "Pune")
        self.assertEqual(addresses["addresses"][0]["mobile_number"], "******3210")
        self.assertNotIn("Private street", str(addresses))
        self.assertNotIn("Other Person", str(addresses))

    def test_authenticated_tool_factories_reject_invalid_user_ids(self):
        factories = (
            (cart_tools, cart_tools.build_cart_tools),
            (order_tools, order_tools.build_order_tools),
            (shipping_tools, shipping_tools.build_shipping_tools),
            (support_tools, support_tools.build_support_tools),
        )
        for module, factory in factories:
            for invalid in (None, 0, -1, True, "1"):
                with self.subTest(module=module.__name__, user_id=invalid), self.assertRaises(ValueError):
                    factory(invalid)

    def test_agent_tool_factories_expose_the_expected_customer_capabilities(self):
        expected = {
            product_tools: {
                "search_products", "search_products_by_category", "get_product_details",
                "compare_products", "list_product_categories",
            },
            cart_tools: {
                "get_my_cart", "add_item_to_my_cart", "remove_item_from_my_cart",
                "update_my_cart_item_quantity",
            },
            order_tools: {"list_my_orders", "get_order_details", "get_order_status"},
            shipping_tools: {"list_my_shipments", "get_my_shipment"},
            support_tools: {"get_my_account_summary", "list_my_saved_addresses"},
        }
        for module, expected_names in expected.items():
            with self.subTest(module=module.__name__):
                self.assertEqual(set(self.tools(module)), expected_names)


if __name__ == "__main__":
    unittest.main()
