import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.admin_commerce_services import update_order_status, update_shipment
from backend.Database.admin_commerce_services import get_store_dashboard_kpis
from backend.Database.connection import Base
from backend.Database.models import (
    CommerceOrder, CommerceOrderItem, Department, Inventory, ProductVariant,
    Shipment, ShipmentEvent, User,
)
from backend.Database.seed_commerce import seed_catalog
from backend.api.routes.admin_commerce import router as admin_commerce_router
from backend.api.routes.account import router as account_router
from backend.api.routes.auth import router as auth_router
from backend.api.routes.department import handler_router
from backend.auth.dependencies import get_current_user, get_db


class OrderDeliveryWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[table for table in Base.metadata.sorted_tables if table.name != "knowledge_chunks"],
        )
        self.db = Session(self.engine)
        self.customer = User(name="Customer", email="customer@workflow.test", password="hash", role="user")
        self.delivery_department = Department(name="Order & Delivery", email="delivery@workflow.test")
        self.returns_department = Department(name="Returns & Replacement", email="returns@workflow.test")
        self.handler = User(name="Delivery Handler", email="handler@workflow.test", password="hash", role="department_handler")
        self.returns_handler = User(name="Returns Handler", email="returns-handler@workflow.test", password="hash", role="department_handler")
        self.admin = User(name="Admin", email="admin@workflow.test", password="hash", role="admin")
        self.db.add_all((self.customer, self.delivery_department, self.returns_department,
                         self.handler, self.returns_handler, self.admin))
        self.db.flush()
        self.handler.department_id = self.delivery_department.id
        self.returns_handler.department_id = self.returns_department.id
        seed_catalog(self.db)
        self.variant = self.db.scalar(select(ProductVariant).where(ProductVariant.sku == "FK-DEMO-1"))
        self.inventory = self.db.scalar(select(Inventory).where(Inventory.variant_id == self.variant.id))
        self.order = CommerceOrder(
            order_number="WF-ORDER-1", user_id=self.customer.id, status="placed",
            payment_method="cod", payment_status="pending", total_amount=100,
        )
        self.db.add(self.order)
        self.db.flush()
        self.db.add(CommerceOrderItem(
            order_id=self.order.id,
            variant_id=self.variant.id,
            product_name=self.variant.product.name,
            variant_name=self.variant.name,
            sku=self.variant.sku,
            quantity=2,
            unit_price=50,
        ))
        self.inventory.total_stock = 12
        self.inventory.available_stock = 10
        self.inventory.reserved_stock = 2
        self.db.commit()

        self.app = FastAPI()
        self.app.include_router(handler_router)
        self.app.include_router(admin_commerce_router)
        self.app.include_router(account_router)
        self.app.include_router(auth_router)
        self.actor = self.handler

        def db_session():
            with Session(self.engine) as session:
                yield session

        self.app.dependency_overrides[get_db] = db_session
        self.app.dependency_overrides[get_current_user] = lambda: self.actor
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def test_order_preparation_and_shipment_delivery_are_separate(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        self.db.refresh(self.inventory)
        self.assertEqual((self.inventory.available_stock, self.inventory.reserved_stock, self.inventory.total_stock), (10, 2, 12))
        self.assertEqual(self.order.status, "ready_to_ship")
        self.assertEqual(self.order.shipment.status, "ready_for_dispatch")

        for status in ("received", "scheduled"):
            update_shipment(self.db, self.order.id, status=status, changed_by=self.handler)
        update_shipment(self.db, self.order.id, status="out_for_delivery", changed_by=self.handler)
        self.db.refresh(self.inventory)
        self.assertEqual((self.inventory.available_stock, self.inventory.reserved_stock, self.inventory.total_stock), (10, 0, 10))

        with self.assertRaises(ValueError):
            update_shipment(self.db, self.order.id, status="out_for_delivery", changed_by=self.handler)
        self.db.refresh(self.inventory)
        self.assertEqual(self.inventory.total_stock, 10)

        delivered = update_shipment(self.db, self.order.id, status="delivered", changed_by=self.handler)
        self.db.refresh(self.order)
        self.db.refresh(self.order.shipment)
        self.assertEqual(self.order.status, "delivered")
        self.assertEqual(self.order.shipment.status, "delivered")
        self.assertIsNotNone(self.order.shipment.delivered_at)
        self.assertEqual(delivered["status"], "delivered")
        self.assertEqual(
            self.db.scalar(select(ShipmentEvent).where(ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id).order_by(ShipmentEvent.id.desc())).new_status,
            "ready_to_ship",
        )
        shipment_events = self.db.scalars(select(ShipmentEvent).where(ShipmentEvent.shipment_id == self.order.shipment.id)).all()
        self.assertEqual([event.new_status for event in shipment_events], [
            "ready_for_dispatch", "received", "scheduled", "out_for_delivery", "delivered",
        ])

        self.actor = self.customer
        customer_orders = self.client.get("/api/account/orders").json()
        customer_order = next(item for item in customer_orders if item["id"] == self.order.id)
        self.assertEqual([event["event_type"] for event in customer_order["tracking_events"]], [
            "order_status", "order_status", "order_status", "order_status",
            "shipment_status", "shipment_status", "shipment_status", "shipment_status", "shipment_status",
        ])
        self.assertEqual(customer_order["shipment"]["carrier"], None)

    def test_failed_delivery_transaction_keeps_order_and_shipment_unchanged(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        for status in ("received", "scheduled", "out_for_delivery"):
            update_shipment(self.db, self.order.id, status=status, changed_by=self.handler)

        with patch.object(self.db, "commit", side_effect=RuntimeError("simulated transaction failure")):
            with self.assertRaises(RuntimeError):
                update_shipment(self.db, self.order.id, status="delivered", changed_by=self.handler)
        self.db.refresh(self.order)
        self.db.refresh(self.order.shipment)
        self.assertEqual(self.order.status, "ready_to_ship")
        self.assertEqual(self.order.shipment.status, "out_for_delivery")
        self.assertIsNone(self.order.shipment.delivered_at)

    def test_dashboard_does_not_count_unmatched_shipment_as_delivered(self):
        self.order.status = "ready_to_ship"
        self.order.shipment = Shipment(order_id=self.order.id, status="delivered")
        self.db.commit()
        counts = get_store_dashboard_kpis(self.db)["fulfilment_counts"]
        self.assertEqual(counts["ready_to_ship"], 1)
        self.assertEqual(counts["delivered"], 0)

    def test_order_management_cannot_advance_shipment_statuses(self):
        for invalid_status in ("shipped", "out_for_delivery", "delivered"):
            with self.subTest(status=invalid_status), self.assertRaises(ValueError):
                update_order_status(self.db, self.order.id, invalid_status, changed_by=self.handler)
            self.db.rollback()
            self.db.refresh(self.order)
            self.assertEqual(self.order.status, "placed")

    def test_shipment_stages_cannot_be_skipped_or_deduct_inventory(self):
        update_order_status(self.db, self.order.id, "accepted", changed_by=self.handler)
        update_order_status(self.db, self.order.id, "processing", changed_by=self.handler)
        update_order_status(self.db, self.order.id, "packed", changed_by=self.handler)
        update_order_status(self.db, self.order.id, "ready_to_ship", changed_by=self.handler)
        with self.assertRaises(ValueError):
            update_shipment(self.db, self.order.id, status="scheduled", changed_by=self.handler)
        self.db.rollback()
        self.db.refresh(self.inventory)
        self.assertEqual((self.inventory.reserved_stock, self.inventory.total_stock), (2, 12))

    def test_o_and_d_apis_enforce_department_assignment_and_state_machine(self):
        self.actor = self.returns_handler
        denied = self.client.get("/api/v1/departments/order-delivery/orders")
        self.assertEqual(denied.status_code, 403)

        self.actor = self.handler
        listing = self.client.get("/api/v1/departments/order-delivery/orders")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["items"][0]["id"], self.order.id)
        invalid = self.client.patch(
            f"/api/v1/departments/order-delivery/orders/{self.order.id}/status",
            json={"status": "delivered", "department_id": self.returns_department.id},
        )
        self.assertEqual(invalid.status_code, 422)
        cross_domain = self.client.patch(
            f"/api/v1/departments/order-delivery/orders/{self.order.id}/status",
            json={"status": "delivered"},
        )
        self.assertEqual(cross_domain.status_code, 409)

    def test_authenticated_profile_includes_persisted_department_details(self):
        self.actor = self.handler
        profile = self.client.get("/api/auth/me")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["department_id"], self.delivery_department.id)
        self.assertEqual(profile.json()["department_name"], "Order & Delivery")

    def test_admin_status_override_requires_reason_and_records_it(self):
        self.actor = self.admin
        missing_reason = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/status",
            json={"status": "accepted"},
        )
        self.assertEqual(missing_reason.status_code, 422)
        updated = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/status",
            json={"status": "accepted", "reason": "Emergency order review"},
        )
        self.assertEqual(updated.status_code, 200)
        event = self.db.scalar(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id,
        ).order_by(ShipmentEvent.id.desc()))
        self.assertEqual(event.note, "Emergency order review")


if __name__ == "__main__":
    unittest.main()
