import io
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    CommerceOrder, CommerceOrderItem, Department, Product, ProductVariant,
    ReturnHandoff, ReturnRequest, ReturnRequestEvent, Shipment, User,
)
from backend.Database.return_services import create_return_claim, record_inspection
from backend.api.routes.account import router as account_router
from backend.api.routes.department import handler_router
from backend.api.routes.admin_commerce import router as admin_commerce_router
from backend.auth.dependencies import get_current_user, get_db


class ReturnWorkflowApiTests(unittest.TestCase):
    def setUp(self):
        self.storage_root = os.path.join(os.getcwd(), "backend", "private_return_evidence")
        self.storage_patch = patch.dict(os.environ, {"RETURN_EVIDENCE_DIR": self.storage_root})
        self.storage_patch.start()
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[t for t in Base.metadata.sorted_tables if t.name != "knowledge_chunks"])
        self.db = Session(self.engine)
        self.customer = User(name="Customer", email="customer@example.test", password="hash", role="user")
        self.other = User(name="Other", email="other@example.test", password="hash", role="user")
        self.handler_department = Department(name="Returns & Replacement", email="returns@example.test")
        self.other_department = Department(name="Payments & Refunds", email="payments@example.test")
        self.delivery_department = Department(name="Order & Delivery", email="delivery@example.test")
        self.handler = User(name="Handler", email="handler@example.test", password="hash", role="department_handler")
        self.payments_handler = User(name="Payments Handler", email="payments-handler@example.test",
                                     password="hash", role="department_handler")
        self.delivery_handler = User(name="Delivery Handler", email="delivery-handler@example.test",
                                     password="hash", role="department_handler")
        self.admin = User(name="Admin", email="admin@example.test", password="hash", role="admin")
        self.db.add_all([self.customer, self.other, self.handler_department, self.other_department,
                         self.delivery_department,
                         self.payments_handler, self.delivery_handler, self.admin])
        self.db.flush()
        self.handler.department_id = self.handler_department.id
        self.payments_handler.department_id = self.other_department.id
        self.delivery_handler.department_id = self.delivery_department.id
        self.order = CommerceOrder(order_number="RET-ORDER-1", user_id=self.customer.id, status="delivered")
        self.db.add(self.order)
        self.db.flush()
        self.product = Product(name="Notebook", slug="return-test-notebook", is_returnable=True,
                               return_window_days=30, is_refundable=True)
        self.variant = ProductVariant(product=self.product, sku="RET-NB-A4", name="A4",
                                      price=100, mrp=100, is_available=True)
        self.db.add(self.variant)
        self.db.flush()
        self.item = CommerceOrderItem(order_id=self.order.id, variant_id=self.variant.id, product_name="Notebook",
                                      variant_name="A4", sku="NB-A4", quantity=2, unit_price=100)
        self.db.add(self.item)
        self.db.flush()
        self.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=3)
        self.shipment = Shipment(order_id=self.order.id, status="delivered", delivered_at=self.delivered_at)
        self.db.add(self.shipment)
        self.db.flush()
        self.claim = ReturnRequest(order_id=self.order.id, order_item_id=self.item.id, quantity=1,
                                   reason="Damaged", status="requested", resolution_type="refund",
                                   reason_code="damaged", description="Cover is bent", workflow_status="submitted")
        self.db.add(self.claim)
        self.db.flush()
        self.app = FastAPI()
        self.app.include_router(account_router)
        self.app.include_router(handler_router)
        self.app.include_router(admin_commerce_router)

        def session_override():
            with Session(self.engine) as session:
                yield session

        self.app.dependency_overrides[get_db] = session_override
        self.actor = self.customer
        self.app.dependency_overrides[get_current_user] = lambda: self.actor
        self.client = TestClient(self.app)
        self.db.commit()

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()
        self.storage_patch.stop()
        evidence_dir = os.path.join(self.storage_root, "returns")
        if os.path.isdir(evidence_dir):
            for name in os.listdir(evidence_dir):
                if name.endswith((".jpg", ".jpeg", ".png", ".webp")):
                    os.remove(os.path.join(evidence_dir, name))
            if not os.listdir(evidence_dir):
                os.rmdir(evidence_dir)

    def png(self):
        stream = io.BytesIO()
        Image.new("RGB", (2, 2), "red").save(stream, format="PNG")
        return stream.getvalue()

    def create_customer_claim(self, **overrides):
        # Isolate service validation from the manually-created claim used by
        # the API tests above.
        self.claim.status = "rejected"
        self.claim.workflow_status = "rejected"
        self.db.commit()
        values = {
            "user_id": self.customer.id,
            "order_id": self.order.id,
            "order_item_id": self.item.id,
            "quantity": 1,
            "resolution_type": "refund",
            "reason_code": "damaged",
            "description": "Item arrived damaged",
        }
        values.update(overrides)
        return create_return_claim(self.db, **values)

    def preview(self, order_id=None, order_item_id=None):
        return self.client.get(
            f"/api/account/orders/{order_id or self.order.id}/items/"
            f"{order_item_id or self.item.id}/return-eligibility"
        )

    def close_seed_claim(self, *, status="rejected"):
        self.claim.status = status
        self.claim.workflow_status = status
        self.db.commit()

    def test_return_eligibility_preview_has_refund_and_replacement(self):
        self.close_seed_claim()
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertTrue(data["eligible"])
        self.assertEqual(data["reason_code"], "eligible")
        self.assertEqual(data["available_resolutions"], ["refund", "replacement"])
        self.assertEqual(data["order_id"], self.order.id)
        self.assertEqual(data["order_item_id"], self.item.id)
        self.assertEqual(data["quantity_purchased"], 2)
        self.assertEqual(data["quantity_already_claimed"], 0)
        self.assertEqual(data["quantity_available"], 2)
        self.assertIsNone(data["active_claim"])
        self.assertEqual(data["return_window_days"], 30)
        self.assertEqual(data["delivered_at"], self.delivered_at.isoformat())
        self.assertEqual(
            data["return_deadline"],
            (self.delivered_at + timedelta(days=30)).isoformat(),
        )

    def test_return_eligibility_preview_reports_expired_window(self):
        self.close_seed_claim()
        self.shipment.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "return_window_expired")
        self.assertEqual(data["available_resolutions"], ["refund", "replacement"])

    def test_return_eligibility_preview_reports_non_returnable_product(self):
        self.close_seed_claim()
        self.product.is_returnable = False
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "not_returnable")
        self.assertEqual(data["available_resolutions"], [])

    def test_return_eligibility_preview_reports_missing_return_policy(self):
        self.close_seed_claim()
        self.product.is_returnable = None
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "policy_not_configured")
        self.product.is_returnable = True
        self.product.return_window_days = None
        self.db.commit()
        self.assertEqual(self.preview().json()["reason_code"], "policy_not_configured")

    def test_return_eligibility_preview_refund_disabled_leaves_replacement(self):
        self.close_seed_claim()
        self.product.is_refundable = False
        self.db.commit()
        data = self.preview().json()
        self.assertTrue(data["eligible"])
        self.assertEqual(data["available_resolutions"], ["replacement"])

    def test_return_eligibility_preview_unconfigured_refund_leaves_replacement(self):
        self.close_seed_claim()
        self.product.is_refundable = None
        self.db.commit()
        data = self.preview().json()
        self.assertTrue(data["eligible"])
        self.assertEqual(data["available_resolutions"], ["replacement"])

    def test_return_eligibility_preview_reports_delivery_state(self):
        self.close_seed_claim()
        self.shipment.status = "shipped"
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "not_delivered")
        self.shipment.status = "delivered"
        self.shipment.delivered_at = None
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "delivery_timestamp_missing")

    def test_return_eligibility_preview_reports_active_claim_safely(self):
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "active_claim_exists")
        self.assertEqual(data["active_claim"]["id"], self.claim.id)
        self.assertNotIn("description", data["active_claim"])
        self.assertEqual(data["quantity_already_claimed"], 1)
        self.assertEqual(data["quantity_available"], 1)

    def test_return_eligibility_preview_counts_completed_claims(self):
        self.claim.quantity = 2
        self.claim.status = "completed"
        self.claim.workflow_status = "completed"
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "quantity_exhausted")
        self.assertEqual(data["quantity_already_claimed"], 2)
        self.assertEqual(data["quantity_available"], 0)

    def test_customer_cannot_preview_another_customers_order(self):
        self.actor = self.other
        response = self.preview()
        self.assertEqual(response.status_code, 404)

    def test_customer_cannot_preview_item_from_a_different_order(self):
        second_order = CommerceOrder(order_number="RET-ORDER-2", user_id=self.customer.id, status="delivered")
        self.db.add(second_order)
        self.db.flush()
        second_item = CommerceOrderItem(
            order_id=second_order.id, variant_id=self.variant.id,
            product_name="Notebook", variant_name="A4", sku="NB-A4-2",
            quantity=1, unit_price=100,
        )
        self.db.add(second_item)
        self.db.commit()
        response = self.preview(order_item_id=second_item.id)
        self.assertEqual(response.status_code, 404)

    def test_refund_and_replacement_submission_use_existing_claim_workflow(self):
        self.close_seed_claim()
        refund = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "refund", "reason_code": "damaged",
        })
        self.assertEqual(refund.status_code, 201, refund.text)
        self.assertEqual(refund.json()["return_request"]["workflow_status"], "submitted")
        submitted_refund_id = refund.json()["return_request"]["id"]
        submitted_refund = self.db.get(ReturnRequest, submitted_refund_id)
        submitted_refund.status = "rejected"
        submitted_refund.workflow_status = "rejected"
        self.db.commit()
        replacement = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "replacement", "reason_code": "defective",
        })
        self.assertEqual(replacement.status_code, 201, replacement.text)
        self.assertEqual(replacement.json()["return_request"]["resolution_type"], "replacement")
        self.assertEqual(replacement.json()["return_request"]["workflow_status"], "submitted")

    def test_refund_disabled_submission_still_allows_replacement(self):
        self.close_seed_claim()
        self.product.is_refundable = False
        self.db.commit()
        refund = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "refund", "reason_code": "damaged",
        })
        self.assertEqual(refund.status_code, 409)
        replacement = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "replacement", "reason_code": "defective",
        })
        self.assertEqual(replacement.status_code, 201, replacement.text)

    def test_delivered_order_can_be_claimed_but_undelivered_cannot(self):
        self.shipment.status = "shipped"
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "after confirmed delivery"):
            self.create_customer_claim()
        self.shipment.status = "delivered"
        self.db.commit()
        claim = self.create_customer_claim()
        self.assertEqual(claim.workflow_status, "submitted")

    def test_missing_delivery_timestamp_is_rejected(self):
        self.shipment.delivered_at = None
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "after confirmed delivery"):
            self.create_customer_claim()

    def test_expired_return_window_is_rejected(self):
        self.shipment.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "return window has expired"):
            self.create_customer_claim()

    def test_non_returnable_product_is_rejected(self):
        self.product.is_returnable = False
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "not returnable"):
            self.create_customer_claim()

    def test_missing_return_policy_configuration_is_rejected(self):
        self.product.is_returnable = None
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "policy is not configured"):
            self.create_customer_claim()
        self.product.is_returnable = True
        self.product.return_window_days = None
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "Return window is not configured"):
            self.create_customer_claim()

    def test_refund_policy_restrictions_are_enforced(self):
        self.product.is_refundable = False
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "not eligible for a refund"):
            self.create_customer_claim()
        self.product.is_refundable = None
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "Refund policy is not configured"):
            self.create_customer_claim()

    def test_requested_quantity_cannot_exceed_purchased_quantity(self):
        with self.assertRaisesRegex(ValueError, "exceeds purchased quantity"):
            self.create_customer_claim(quantity=3)

    def test_duplicate_active_claim_is_rejected(self):
        first = self.create_customer_claim()
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "active return request already exists"):
            self.create_customer_claim()
        self.assertIsNotNone(first.id)

    def test_claim_detail_is_owner_scoped(self):
        self.assertEqual(self.client.get(f"/api/account/returns/{self.claim.id}").status_code, 200)
        self.actor = self.other
        self.assertEqual(self.client.get(f"/api/account/returns/{self.claim.id}").status_code, 404)

    def test_handler_department_scope_and_approval_handoff(self):
        self.actor = User(id=901, name="Wrong", email="wrong@example.test", password="hash",
                          role="department_handler", department_id=self.other_department.id)
        self.assertEqual(self.client.get(f"/api/v1/departments/returns/{self.claim.id}").status_code, 403)
        self.actor = self.handler
        response = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve", json={"note": "Evidence reviewed"})
        self.assertEqual(response.status_code, 200, response.text)
        handoff = self.db.scalar(select(ReturnHandoff).where(ReturnHandoff.return_request_id == self.claim.id))
        self.assertIsNotNone(handoff)
        self.assertEqual(handoff.destination_department_id, self.delivery_department.id)
        self.assertEqual(handoff.handoff_type, "refund_pickup")
        self.assertEqual(handoff.status, "pending")
        self.assertEqual(self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve", json={"note": "Duplicate"}).status_code, 409)

    def test_evidence_upload_validates_and_is_only_returned_via_authorized_endpoint(self):
        response = self.client.post(f"/api/account/returns/{self.claim.id}/evidence", files={
            "files": ("proof.png", self.png(), "image/png"),
        })
        self.assertEqual(response.status_code, 201, response.text)
        evidence_id = response.json()["items"][0]["id"]
        fetched = self.client.get(f"/api/account/returns/{self.claim.id}/evidence/{evidence_id}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.headers["cache-control"], "private, no-store")
        self.actor = self.other
        self.assertEqual(self.client.get(f"/api/account/returns/{self.claim.id}/evidence/{evidence_id}").status_code, 404)

    def test_invalid_evidence_and_information_response_transitions(self):
        bad = self.client.post(f"/api/account/returns/{self.claim.id}/evidence", files={
            "files": ("proof.png", b"not an image", "image/png"),
        })
        self.assertEqual(bad.status_code, 400)
        self.actor = self.handler
        requested = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/request-information",
                                     json={"note": "Please provide a clear product photo"})
        self.assertEqual(requested.status_code, 200, requested.text)
        self.actor = self.customer
        response = self.client.post(f"/api/account/returns/{self.claim.id}/respond", data={"message": "Attached photo"},
                                    files={"files": ("proof.png", self.png(), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["workflow_status"], "under_review")
        self.assertGreaterEqual(self.db.query(ReturnRequestEvent).filter_by(return_request_id=self.claim.id).count(), 3)

    def test_legacy_admin_status_update_keeps_structured_claim_audited(self):
        self.actor = self.admin
        response = self.client.patch(f"/api/admin/commerce/returns/{self.claim.id}/status",
                                     json={"status": "approved", "restock": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.claim)
        self.assertEqual(self.claim.status, "approved")
        self.assertEqual(self.claim.workflow_status, "approved")
        event = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "legacy_status_changed",
        ))
        self.assertIsNotNone(event)

    def test_evidence_review_is_separate_from_physical_inspection(self):
        self.actor = self.handler
        approved = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve",
                                    json={"note": "Photo evidence reviewed"})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(
            self.db.scalars(select(ReturnHandoff).where(
                ReturnHandoff.return_request_id == self.claim.id,
                ReturnHandoff.handoff_type == "refund_processing",
            )).all(),
            [],
        )
        reviewed = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "evidence_review", "outcome": "passed", "notes": "Photo is clear",
        })
        self.assertEqual(reviewed.status_code, 201, reviewed.text)
        details = self.client.get(f"/api/v1/departments/returns/{self.claim.id}").json()
        self.assertEqual([row["type"] for row in details["inspection_history"]], ["evidence_review"])
        self.actor = self.payments_handler
        self.assertEqual(self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Physical package checked",
        }).status_code, 403)
        self.actor = self.handler
        self.assertEqual(self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Returns handler cannot inspect pickup",
        }).status_code, 403)

        # Even a validly accepted handoff cannot authorize pickup inspection
        # unless it is specifically the Order & Delivery refund-pickup handoff.
        misleading = ReturnHandoff(
            return_request_id=self.claim.id,
            source_department_id=self.handler_department.id,
            destination_department_id=self.other_department.id,
            handoff_type="refund_processing",
            status="accepted",
            idempotency_key=f"test-misleading:{self.claim.id}",
            payload={},
        )
        self.db.add(misleading)
        self.db.commit()
        self.actor = self.delivery_handler
        rejected_inspection = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Should not be authorized",
        })
        self.assertEqual(rejected_inspection.status_code, 409)
        self.db.delete(misleading)
        self.db.commit()

        handoff = self.db.scalar(select(ReturnHandoff).where(ReturnHandoff.return_request_id == self.claim.id))
        self.actor = self.payments_handler
        accepted = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                     json={"status": "accepted", "note": "Work accepted"})
        self.assertEqual(accepted.status_code, 403)
        self.actor = self.delivery_handler
        accepted = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                     json={"status": "accepted", "note": "Work accepted"})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.actor = self.delivery_handler
        physical = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Physical package checked",
        })
        self.assertEqual(physical.status_code, 201, physical.text)
        duplicate_physical = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Duplicate inspection event",
        })
        self.assertEqual(duplicate_physical.status_code, 201, duplicate_physical.text)
        processing = self.db.scalars(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_processing",
        )).all()
        self.assertEqual(len(processing), 1)
        self.assertEqual(processing[0].destination_department_id, self.other_department.id)
        self.assertEqual(processing[0].source_department_id, self.delivery_department.id)

    def test_replacement_routing(self):
        replacement = ReturnRequest(order_id=self.order.id, order_item_id=self.item.id, quantity=1,
                                    reason="Replace", status="requested", resolution_type="replacement",
                                    reason_code="defective", workflow_status="submitted")
        self.db.add(replacement)
        self.db.commit()
        self.actor = self.handler
        response = self.client.post(f"/api/v1/departments/returns/{replacement.id}/approve",
                                    json={"note": "Replacement approved"})
        self.assertEqual(response.status_code, 200, response.text)
        handoff = self.db.scalar(select(ReturnHandoff).where(ReturnHandoff.return_request_id == replacement.id))
        self.assertEqual(handoff.destination_department_id, self.delivery_department.id)
        self.assertEqual(handoff.handoff_type, "replacement_fulfillment")

    def test_approval_rolls_back_when_order_delivery_is_not_configured(self):
        self.db.delete(self.delivery_department)
        self.db.commit()
        self.actor = self.handler
        failed = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve",
                                  json={"note": "Refund approved"})
        self.assertEqual(failed.status_code, 404)
        self.db.refresh(self.claim)
        self.assertEqual(self.claim.workflow_status, "submitted")
        self.assertIsNone(self.db.scalar(select(ReturnHandoff.id).where(ReturnHandoff.return_request_id == self.claim.id)))

    def test_inspection_rolls_back_when_payments_is_not_configured(self):
        self.actor = self.handler
        approved = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve",
                                    json={"note": "Pickup approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        pickup = self.db.scalar(select(ReturnHandoff).where(ReturnHandoff.return_request_id == self.claim.id))
        self.actor = self.delivery_handler
        accepted = self.client.patch(f"/api/v1/departments/return-handoffs/{pickup.id}/status",
                                     json={"status": "accepted", "note": "Pickup accepted"})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.db.delete(self.other_department)
        self.db.commit()
        self.actor = self.delivery_handler
        failed = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Item received",
        })
        self.assertEqual(failed.status_code, 404)
        from backend.Database.models import ReturnInspection
        self.assertEqual(self.db.query(ReturnInspection).filter_by(return_request_id=self.claim.id).count(), 0)
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(
            return_request_id=self.claim.id, handoff_type="refund_processing",
        ).count(), 0)


if __name__ == "__main__":
    unittest.main()
