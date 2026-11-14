import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.admin_commerce_services import get_admin_order_detail, update_order_status, update_shipment
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
        self.db.add(ShipmentEvent(
            event_type="order_status", order_id=self.order.id, previous_status=None,
            new_status="placed", changed_by_id=self.customer.id, note="Order placed",
        ))
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
        update_shipment(self.db, self.order.id, status="shipped", changed_by=self.handler)
        self.db.refresh(self.inventory)
        self.assertEqual((self.inventory.available_stock, self.inventory.reserved_stock, self.inventory.total_stock), (10, 0, 10))
        update_shipment(self.db, self.order.id, status="out_for_delivery", changed_by=self.handler)

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
            "delivered",
        )
        shipment_events = self.db.scalars(select(ShipmentEvent).where(ShipmentEvent.shipment_id == self.order.shipment.id)).all()
        self.assertEqual([event.new_status for event in shipment_events], [
            "ready_for_dispatch", "received", "scheduled", "shipped", "out_for_delivery", "delivered",
        ])
        order_events = self.db.scalars(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id,
        )).all()
        self.assertEqual(order_events[-1].new_status, "delivered")
        self.assertEqual(order_events[-1].changed_by_id, self.handler.id)
        self.assertEqual(order_events[-1].created_at, self.order.shipment.events[-1].created_at)
        shipment_event_count = len(shipment_events)
        order_event_count = len(order_events)
        with self.assertRaises(ValueError):
            update_shipment(self.db, self.order.id, status="delivered", changed_by=self.handler)
        self.db.rollback()
        self.assertEqual(len(self.db.scalars(select(ShipmentEvent).where(ShipmentEvent.shipment_id == self.order.shipment.id)).all()), shipment_event_count)
        self.assertEqual(len(self.db.scalars(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id,
        )).all()), order_event_count)

        self.actor = self.customer
        customer_orders = self.client.get("/api/account/orders").json()
        customer_order = next(item for item in customer_orders if item["id"] == self.order.id)
        self.assertEqual([event["stage"] for event in customer_order["tracking_milestones"]], [
            "order_confirmed", "shipped", "out_for_delivery", "delivered",
        ])
        self.assertEqual(len([event for event in customer_order["tracking_milestones"] if event.get("created_at")]), 4)
        self.assertEqual(customer_order["shipment"]["carrier"], None)

    def test_admin_order_detail_serializes_next_shipment_transition_for_every_state(self):
        self.order.status = "ready_to_ship"
        self.order.shipment = Shipment(order_id=self.order.id, status="pending")
        self.db.commit()
        expected = {
            "pending": ["ready_for_dispatch"],
            "ready_for_dispatch": ["received"],
            "received": ["scheduled"],
            "scheduled": ["shipped"],
            "shipped": ["out_for_delivery"],
            "out_for_delivery": ["delivered"],
            "delivered": [],
        }
        for status, options in expected.items():
            with self.subTest(status=status):
                self.order.shipment.status = status
                self.db.commit()
                detail = get_admin_order_detail(self.db, self.order.id)
                self.assertEqual(detail["shipment"]["next_status_options"], options)

    def test_order_delivery_handler_shipment_queue_returns_next_transition(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        self.actor = self.handler
        response = self.client.get("/api/v1/departments/order-delivery/shipments")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["items"][0]["next_status_options"], ["received"])

    def test_admin_shipment_api_full_sequence_and_order_delivery_sync(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        self.actor = self.admin

        detail = self.client.get(f"/api/admin/commerce/orders/{self.order.id}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["shipment"]["next_status_options"], ["received"])

        for status, expected_next in (
            ("received", ["scheduled"]),
            ("scheduled", ["shipped"]),
            ("shipped", ["out_for_delivery"]),
            ("out_for_delivery", ["delivered"]),
            ("delivered", []),
        ):
            response = self.client.patch(
                f"/api/admin/commerce/orders/{self.order.id}/shipment",
                json={"status": status},
            )
            self.assertEqual(response.status_code, 200, response.text)
            refreshed = self.client.get(f"/api/admin/commerce/orders/{self.order.id}")
            self.assertEqual(refreshed.json()["shipment"]["next_status_options"], expected_next)
            if status == "out_for_delivery":
                self.assertEqual(expected_next, ["delivered"])

        self.db.refresh(self.order)
        self.db.refresh(self.order.shipment)
        self.assertEqual(self.order.status, "delivered")
        self.assertEqual(self.order.shipment.status, "delivered")
        self.assertIsNotNone(self.order.shipment.delivered_at)
        order_delivery_event = self.db.scalar(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status",
            ShipmentEvent.order_id == self.order.id,
            ShipmentEvent.new_status == "delivered",
        ))
        shipment_delivery_event = self.db.scalar(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "shipment_status",
            ShipmentEvent.shipment_id == self.order.shipment.id,
            ShipmentEvent.new_status == "delivered",
        ))
        self.assertIsNotNone(order_delivery_event)
        self.assertIsNotNone(shipment_delivery_event)
        self.assertEqual(order_delivery_event.created_at, shipment_delivery_event.created_at)
        duplicate = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/shipment",
            json={"status": "delivered"},
        )
        self.assertEqual(duplicate.status_code, 409)

    def test_failed_delivery_transaction_keeps_order_and_shipment_unchanged(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        for status in ("received", "scheduled", "shipped", "out_for_delivery"):
            update_shipment(self.db, self.order.id, status=status, changed_by=self.handler)

        with patch.object(self.db, "commit", side_effect=RuntimeError("simulated transaction failure")):
            with self.assertRaises(RuntimeError):
                update_shipment(self.db, self.order.id, status="delivered", changed_by=self.handler)
        self.db.refresh(self.order)
        self.db.refresh(self.order.shipment)
        self.assertEqual(self.order.status, "ready_to_ship")
        self.assertEqual(self.order.shipment.status, "out_for_delivery")
        self.assertIsNone(self.order.shipment.delivered_at)
        order_events = self.db.scalars(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id,
        )).all()
        self.assertNotIn("delivered", [event.new_status for event in order_events])

    def test_dashboard_does_not_count_unmatched_shipment_as_delivered(self):
        self.order.status = "ready_to_ship"
        self.order.shipment = Shipment(order_id=self.order.id, status="delivered")
        self.db.commit()
        counts = get_store_dashboard_kpis(self.db)["fulfilment_overview"]
        self.assertEqual(set(counts), {"placed", "packed", "ready_to_ship", "out_for_delivery", "delivered"})
        self.assertEqual(counts["ready_to_ship"], 1)
        self.assertEqual(counts["delivered"], 0)

    def test_dashboard_uses_shipment_for_out_for_delivery_without_double_counting(self):
        self.order.status = "ready_to_ship"
        self.order.shipment = Shipment(order_id=self.order.id, status="out_for_delivery")
        self.db.commit()
        counts = get_store_dashboard_kpis(self.db)["fulfilment_overview"]
        self.assertEqual(counts["out_for_delivery"], 1)
        self.assertEqual(counts["ready_to_ship"], 0)
        self.assertEqual(sum(counts.values()), 1)

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
        with self.assertRaises(ValueError):
            update_shipment(self.db, self.order.id, status="delivered", changed_by=self.handler)
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

    def test_admin_status_override_reason_is_optional_and_recorded_when_supplied(self):
        self.actor = self.admin
        empty_reason = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/status",
            json={"status": "accepted", "reason": "  "},
        )
        self.assertEqual(empty_reason.status_code, 200)
        empty_event = self.db.scalar(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id,
        ).order_by(ShipmentEvent.id.desc()))
        self.assertIsNone(empty_event.note)
        updated = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/status",
            json={"status": "processing", "reason": "Emergency order review"},
        )
        self.assertEqual(updated.status_code, 200)
        event = self.db.scalar(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "order_status", ShipmentEvent.order_id == self.order.id,
        ).order_by(ShipmentEvent.id.desc()))
        self.assertEqual(event.note, "Emergency order review")

    def test_legacy_pending_and_shipped_shipments_remain_actionable_without_double_deduction(self):
        self.order.status = "ready_to_ship"
        self.order.shipment = Shipment(order_id=self.order.id, status="pending")
        self.db.commit()
        update_shipment(self.db, self.order.id, status="ready_for_dispatch", changed_by=self.handler)
        self.assertEqual(self.order.shipment.status, "ready_for_dispatch")

        self.order.status = "shipped"
        self.order.shipment.status = "shipped"
        self.inventory.total_stock = 10
        self.inventory.reserved_stock = 0
        self.inventory.available_stock = 10
        self.db.commit()
        update_shipment(self.db, self.order.id, status="out_for_delivery", changed_by=self.handler)
        self.assertEqual(self.order.shipment.status, "out_for_delivery")
        self.assertEqual(self.inventory.total_stock, 10)

    def test_handler_can_save_shipment_metadata_and_status_only_preserves_it(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        response = self.client.patch(
            f"/api/v1/departments/order-delivery/shipments/{self.order.id}/status",
            json={
                "carrier": "Example Carrier",
                "tracking_reference": "AWB-123",
                "tracking_url": "https://carrier.example/track/AWB-123",
                "estimated_delivery_date": "2026-11-20T00:00:00Z",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["carrier"], "Example Carrier")
        self.db.expire_all()
        self.assertEqual(self.order.shipment.status, "ready_for_dispatch")
        update_shipment(self.db, self.order.id, status="received", changed_by=self.handler)
        update_shipment(self.db, self.order.id, status="scheduled", changed_by=self.handler)
        self.assertEqual(self.order.shipment.carrier, "Example Carrier")
        self.assertEqual(self.order.shipment.tracking_reference, "AWB-123")
        self.assertEqual(self.order.shipment.tracking_url, "https://carrier.example/track/AWB-123")
        self.assertIsNotNone(self.order.shipment.estimated_delivery_date)

    def test_admin_shipment_reason_is_optional_and_invalid_transition_remains_rejected(self):
        for status in ("accepted", "processing", "packed", "ready_to_ship"):
            update_order_status(self.db, self.order.id, status, changed_by=self.handler)
        self.actor = self.admin
        no_reason = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/shipment",
            json={"status": "received", "reason": ""},
        )
        self.assertEqual(no_reason.status_code, 200, no_reason.text)
        supplied_reason = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/shipment",
            json={"status": "scheduled", "reason": "Carrier scheduling correction"},
        )
        self.assertEqual(supplied_reason.status_code, 200, supplied_reason.text)
        event = self.db.scalar(select(ShipmentEvent).where(
            ShipmentEvent.event_type == "shipment_status",
            ShipmentEvent.shipment_id == self.order.shipment.id,
        ).order_by(ShipmentEvent.id.desc()))
        self.assertEqual(event.note, "Carrier scheduling correction")
        invalid = self.client.patch(
            f"/api/admin/commerce/orders/{self.order.id}/shipment",
            json={"status": "delivered"},
        )
        self.assertEqual(invalid.status_code, 409)


if __name__ == "__main__":
    unittest.main()
