import io
import os
import sys
import types
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    CommerceOrder, CommerceOrderItem, Department, PaymentAttempt, Product, ProductVariant,
    Refund, ReturnHandoff, ReturnRequest, ReturnRequestEvent, Shipment, User,
)
from backend.Database.return_services import create_return_claim, record_inspection
from backend.api.routes.account import router as account_router
from backend.api.routes.department import handler_router
from backend.api.routes.admin_commerce import router as admin_commerce_router
from backend.auth.dependencies import get_current_user, get_db


class ReturnWorkflowApiTests(unittest.TestCase):
    def setUp(self):
        self.storage_root = os.path.join(os.getcwd(), "backend", "private_return_evidence")
        self.storage_patch = patch.dict(os.environ, {
            "RETURN_EVIDENCE_DIR": self.storage_root,
            "APP_ENV": "test",
            "RETURN_EVIDENCE_STORAGE_PROVIDER": "local_private",
            "IMAGEKIT_PRIVATE_KEY": "",
        })
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
                                   refund_timing="immediate",
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

    def test_reports_stats_bucket_calendar_periods_and_apply_filters(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.claim.requested_at = now
        self.claim.workflow_status = "submitted"
        replacement = ReturnRequest(
            order_id=self.order.id, order_item_id=self.item.id, quantity=1,
            reason="Damaged", status="requested", resolution_type="replacement",
            reason_code="damaged", workflow_status="approved", requested_at=now - timedelta(days=1),
        )
        older = ReturnRequest(
            order_id=self.order.id, order_item_id=self.item.id, quantity=1,
            reason="Damaged", status="requested", resolution_type="refund",
            reason_code="damaged", workflow_status="resolved", requested_at=now - timedelta(days=190),
        )
        self.db.add_all([replacement, older])
        self.db.commit()
        self.actor = self.handler

        day = self.client.get("/api/v1/departments/reports-stats", params={"period": "day"})
        self.assertEqual(day.status_code, 200, day.text)
        self.assertEqual(len(day.json()["trend"]), 7)
        self.assertEqual(sum(point["val"] for point in day.json()["trend"]), 2)
        self.assertEqual(day.json()["pending"], 1)
        self.assertEqual(day.json()["in_progress"], 1)
        self.assertEqual(sum(point["replacements"] for point in day.json()["trend"]), 1)

        week = self.client.get("/api/v1/departments/reports-stats", params={"period": "week"})
        self.assertEqual(len(week.json()["trend"]), 8)
        self.assertEqual(sum(point["val"] for point in week.json()["trend"]), 2)
        month = self.client.get("/api/v1/departments/reports-stats", params={"period": "month"})
        self.assertEqual(len(month.json()["trend"]), 6)
        self.assertEqual(sum(point["val"] for point in month.json()["trend"]), 2)

        filtered = self.client.get("/api/v1/departments/reports-stats", params={
            "period": "day", "request_type": "replacement", "status": "in_progress",
        })
        self.assertEqual(filtered.status_code, 200, filtered.text)
        self.assertEqual(filtered.json()["total_requests"], 1)
        self.assertEqual(sum(point["val"] for point in filtered.json()["trend"]), 1)

    def progress_delivery_handoff(self, handoff, milestones):
        self.actor = self.delivery_handler
        for state in ("accepted", "in_progress"):
            response = self.client.patch(
                f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                json={"status": state, "note": f"Handoff {state}"},
            )
            self.assertEqual(response.status_code, 200, response.text)
        for milestone in milestones:
            response = self.client.patch(
                f"/api/v1/departments/order-delivery/return-handoffs/{handoff.id}/milestones",
                json={"milestone": milestone, "note": f"Confirmed {milestone}"},
            )
            self.assertEqual(response.status_code, 200, response.text)

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
            "refund_timing": "immediate",
            "reason_code": "damaged",
            "description": "Item arrived damaged",
        }
        values.update(overrides)
        return create_return_claim(self.db, **values)

    def prepare_refund_handoff(self, *, timing="immediate", payment_method="upi"):
        self.claim.refund_timing = timing
        self.order.payment_method = payment_method
        self.order.total_amount = 200
        self.order.currency = "INR"
        self.order.payment_status = "pending" if payment_method == "cod" else "captured"
        attempt = None
        if payment_method != "cod":
            attempt = PaymentAttempt(
                order_id=self.order.id, provider="razorpay", status="captured", amount=200,
                currency="INR", idempotency_key=f"return-test-attempt:{self.claim.id}",
                provider_payment_id=f"pay_return_{self.claim.id}",
                expires_at=datetime.now(timezone.utc).replace(tzinfo=None),
                paid_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            self.db.add(attempt)
        self.db.commit()
        self.actor = self.handler
        approved = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve",
                                    json={"note": "Refund approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        if timing == "after_collection":
            pickup = self.db.scalar(select(ReturnHandoff).where(
                ReturnHandoff.return_request_id == self.claim.id,
                ReturnHandoff.handoff_type == "refund_pickup",
            ))
            self.progress_delivery_handoff(pickup, ("pickup_scheduled", "item_collected"))
        payment_handoff = self.db.scalar(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_processing",
        ))
        return payment_handoff, attempt

    def accept_payment_handoff(self, handoff):
        self.actor = self.payments_handler
        accepted = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                     json={"status": "accepted", "note": "Payment work accepted"})
        self.assertEqual(accepted.status_code, 200, accepted.text)

    def fake_razorpay(self, *, status="processed", raises=None):
        calls = []

        class PaymentApi:
            def refund(self, payment_id, payload):
                calls.append((payment_id, payload))
                if raises:
                    raise raises
                return {"id": "rfnd_test_1", "status": status}

        module = types.ModuleType("razorpay")
        module.Client = lambda auth: types.SimpleNamespace(payment=PaymentApi())
        return module, calls

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

    def test_return_eligibility_requires_synchronized_delivered_order_and_shipment(self):
        self.close_seed_claim()
        self.order.status = "ready_to_ship"
        self.shipment.status = "delivered"
        self.shipment.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
        self.db.commit()
        data = self.preview().json()
        self.assertFalse(data["eligible"])
        self.assertEqual(data["reason_code"], "not_delivered")

        self.order.status = "delivered"
        self.db.commit()
        data = self.preview().json()
        self.assertTrue(data["eligible"])
        self.assertEqual(data["reason_code"], "eligible")

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
            "quantity": 1, "resolution_type": "refund", "refund_timing": "immediate",
            "reason_code": "damaged",
        })
        self.assertEqual(refund.status_code, 201, refund.text)
        self.assertEqual(refund.json()["return_request"]["workflow_status"], "submitted")
        self.assertEqual(refund.json()["return_request"]["refund_timing"], "immediate")
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

    def test_claim_intake_validates_refund_timing(self):
        self.close_seed_claim()
        bad = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "refund", "refund_timing": "later",
            "reason_code": "damaged",
        })
        self.assertEqual(bad.status_code, 422)
        good = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "refund", "refund_timing": "after_collection",
            "reason_code": "damaged",
        })
        self.assertEqual(good.status_code, 201, good.text)
        self.assertEqual(good.json()["return_request"]["refund_timing"], "after_collection")

    def test_return_submission_key_returns_the_original_claim_on_retry(self):
        key = str(uuid.uuid4())
        first = self.create_customer_claim(submission_key=key)
        self.db.commit()
        retry = self.create_customer_claim(submission_key=key)
        self.assertEqual(retry.id, first.id)
        self.assertEqual(self.db.query(ReturnRequest).filter_by(submission_key=key).count(), 1)

    def test_return_submission_key_cannot_be_reused_for_different_payload(self):
        key = str(uuid.uuid4())
        self.create_customer_claim(submission_key=key)
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "already associated"):
            self.create_customer_claim(submission_key=key, quantity=2)
        self.assertEqual(self.db.query(ReturnRequest).filter_by(submission_key=key).count(), 1)

    def test_return_submission_key_has_a_database_unique_constraint(self):
        key = str(uuid.uuid4())
        claim = self.create_customer_claim(submission_key=key)
        self.db.commit()
        self.db.add(ReturnRequest(
            order_id=self.order.id, order_item_id=self.item.id, quantity=1,
            reason="Duplicate", status="requested", resolution_type="refund",
            refund_timing="immediate", reason_code="damaged", workflow_status="submitted",
            submission_key=key,
        ))
        with self.assertRaises(IntegrityError):
            self.db.flush()
        self.db.rollback()
        self.assertIsNotNone(self.db.get(ReturnRequest, claim.id))

    def test_service_normalizes_supported_reason_and_rejects_unknown_reason(self):
        self.close_seed_claim()
        claim = self.create_customer_claim(reason_code="  DAMAGED ")
        self.assertEqual(claim.reason_code, "damaged")
        self.close_seed_claim()
        with self.assertRaisesRegex(ValueError, "supported return reason"):
            self.create_customer_claim(reason_code="customer_dissatisfaction")

    def test_refund_without_timing_is_not_defaulted_or_approvable(self):
        self.close_seed_claim()
        submitted = self.client.post("/api/account/returns", json={
            "order_id": self.order.id, "order_item_id": self.item.id,
            "quantity": 1, "resolution_type": "refund", "reason_code": "damaged",
        })
        self.assertEqual(submitted.status_code, 201, submitted.text)
        claim_id = submitted.json()["return_request"]["id"]
        self.assertIsNone(submitted.json()["return_request"]["refund_timing"])
        self.actor = self.handler
        approval = self.client.post(f"/api/v1/departments/returns/{claim_id}/approve",
                                    json={"note": "Refund approved"})
        self.assertEqual(approval.status_code, 409)
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(return_request_id=claim_id).count(), 0)

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
        payments = self.db.scalars(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_processing",
        )).all()
        self.assertEqual(len(payments), 1)
        self.assertEqual(self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve", json={"note": "Duplicate"}).status_code, 409)
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(return_request_id=self.claim.id).count(), 2)

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
        self.claim.refund_timing = "after_collection"
        self.db.commit()
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
        self.assertEqual(processing, [])

    def test_after_collection_refund_waits_for_completed_pickup_handoff(self):
        self.claim.refund_timing = "after_collection"
        self.db.commit()
        self.actor = self.handler
        approved = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/approve",
                                    json={"note": "Refund after collection"})
        self.assertEqual(approved.status_code, 200, approved.text)
        pickup = self.db.scalar(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_pickup",
        ))
        self.assertIsNotNone(pickup)
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(
            return_request_id=self.claim.id, handoff_type="refund_processing",
        ).count(), 0)
        self.actor = self.delivery_handler
        for state in ("accepted", "in_progress"):
            response = self.client.patch(f"/api/v1/departments/return-handoffs/{pickup.id}/status",
                                         json={"status": state, "note": f"Pickup {state}"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.db.query(ReturnHandoff).filter_by(
                return_request_id=self.claim.id, handoff_type="refund_processing",
            ).count(), 0)
        for milestone in ("pickup_scheduled", "item_collected"):
            completed = self.client.patch(
                f"/api/v1/departments/order-delivery/return-handoffs/{pickup.id}/milestones",
                json={"milestone": milestone, "note": "Collection confirmed"},
            )
            self.assertEqual(completed.status_code, 200, completed.text)
        processing = self.db.scalars(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_processing",
        )).all()
        self.assertEqual(len(processing), 1)
        self.assertEqual(processing[0].payload["pickup_handoff_id"], pickup.id)
        retried = self.client.patch(f"/api/v1/departments/return-handoffs/{pickup.id}/status",
                                    json={"status": "completed", "note": "Retry"})
        self.assertEqual(retried.status_code, 409)
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(
            return_request_id=self.claim.id, handoff_type="refund_processing",
        ).count(), 1)
        self.assertEqual(self.db.query(ReturnRequestEvent).filter_by(
            return_request_id=self.claim.id, event_type="collection_confirmed",
        ).count(), 1)

    def test_payments_queue_and_tracking_authorization(self):
        handoff, _ = self.prepare_refund_handoff()
        self.actor = self.payments_handler
        queue = self.client.get("/api/v1/departments/payments/refund-handoffs")
        self.assertEqual(queue.status_code, 200, queue.text)
        self.assertEqual(queue.json()["total"], 1)
        self.assertEqual(queue.json()["items"][0]["handoff_id"], handoff.id)
        self.assertNotIn("customer_email", queue.json()["items"][0])
        self.actor = self.delivery_handler
        self.assertEqual(self.client.get("/api/v1/departments/payments/refund-handoffs").status_code, 403)
        self.assertEqual(self.client.post(
            f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={}
        ).status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/departments/returns/{self.claim.id}").status_code, 403)
        unrelated_department = Department(name="Customer Support", email="support@example.test")
        unrelated_handler = User(name="Support Handler", email="support-handler@example.test",
                                 password="hash", role="department_handler")
        self.db.add_all([unrelated_department, unrelated_handler])
        self.db.flush()
        unrelated_handler.department_id = unrelated_department.id
        self.db.commit()
        self.actor = unrelated_handler
        self.assertEqual(self.client.get("/api/v1/departments/payments/refund-handoffs").status_code, 403)
        self.actor = self.handler
        details = self.client.get(f"/api/v1/departments/returns/{self.claim.id}")
        self.assertEqual(details.status_code, 200, details.text)
        tracking = details.json()["tracking"]
        self.assertEqual(tracking["return_request_id"], self.claim.id)
        self.assertEqual(tracking["returns_status"], "approved")
        self.assertEqual(tracking["payments"]["handoff_status"], "pending")
        self.assertEqual(tracking["payments"]["refunds"], [])
        self.actor = self.customer
        self.assertEqual(self.client.get("/api/v1/departments/payments/refund-handoffs").status_code, 403)
        customer_details = self.client.get(f"/api/account/returns/{self.claim.id}")
        self.assertEqual(customer_details.status_code, 200, customer_details.text)
        self.assertNotIn("tracking", customer_details.json())

    def test_razorpay_return_refund_is_linked_idempotent_and_completes_only_payments(self):
        handoff, attempt = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(status="processed")
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test_key", "RAZORPAY_KEY_SECRET": "test_secret",
        }):
            first = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json()["status"], "processed")
            self.assertEqual(first.json()["return_request_id"], self.claim.id)
            second = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
            self.assertEqual(second.status_code, 200, second.text)
            self.assertTrue(second.json()["duplicate"])
        refunds = self.db.scalars(select(Refund).where(Refund.return_request_id == self.claim.id)).all()
        self.assertEqual(len(refunds), 1)
        self.assertEqual(refunds[0].payment_attempt_id, attempt.id)
        self.assertEqual(refunds[0].order_id, self.order.id)
        self.assertEqual(refunds[0].idempotency_key, f"return-refund:{self.claim.id}:v1")
        self.assertEqual(refunds[0].return_request_id, self.claim.id)
        self.assertEqual(len(calls), 1)
        self.assertEqual(attempt.amount, self.item.unit_price * self.item.quantity)
        self.assertEqual(Decimal(calls[0][1]["amount"]) / Decimal(100),
                         attempt.amount * self.claim.quantity / self.item.quantity)
        self.assertEqual(calls[0][1]["amount"], 10000)
        self.assertEqual(refunds[0].amount, self.item.unit_price * self.claim.quantity)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "completed")
        pickup = self.db.scalar(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_pickup",
        ))
        self.assertEqual(pickup.status, "pending")
        self.assertEqual(handoff.source_department_id, self.handler_department.id)
        self.assertEqual(self.order.payment_status, "partially_refunded")
        for event_type in ("payments_handoff_accepted", "refund_processing_initiated",
                           "refund_successfully_processed", "refund_execution_retry"):
            self.assertGreaterEqual(self.db.query(ReturnRequestEvent).filter_by(
                return_request_id=self.claim.id, event_type=event_type,
            ).count(), 1)

    def test_after_collection_routing_executes_linked_refund_only_after_collection(self):
        handoff, _ = self.prepare_refund_handoff(timing="after_collection")
        self.assertIsNotNone(handoff)
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(status="processed")
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test_key", "RAZORPAY_KEY_SECRET": "test_secret",
        }):
            response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "processed")
        self.assertEqual(len(calls), 1)
        refund = self.db.scalar(select(Refund).where(Refund.return_request_id == self.claim.id))
        self.assertIsNotNone(refund)
        self.assertEqual(handoff.source_department_id, self.delivery_department.id)
        self.actor = self.handler
        details = self.client.get(f"/api/v1/departments/returns/{self.claim.id}").json()
        self.assertEqual(details["tracking"]["payments"]["refunds"][0]["status"], "processed")

    def test_refund_uses_checkout_price_snapshot_when_mrp_is_higher(self):
        self.variant.mrp = 150
        self.item.unit_price = 100
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(status="processed")
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test_key", "RAZORPAY_KEY_SECRET": "test_secret",
        }):
            response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(calls[0][1]["amount"], 10000)
        self.assertEqual(response.json()["amount"], "100.00")

    def test_pending_razorpay_result_is_not_success_and_retry_does_not_call_provider_again(self):
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(status="pending")
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test_key", "RAZORPAY_KEY_SECRET": "test_secret",
        }):
            first = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
            second = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "processing")
        self.assertEqual(second.json()["status"], "processing")
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(len(calls), 1)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "in_progress")

    def test_uncertain_razorpay_result_is_not_retried(self):
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(raises=TimeoutError("provider response timed out"))
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test_key", "RAZORPAY_KEY_SECRET": "test_secret",
        }):
            first = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
            second = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "processing")
        self.assertEqual(second.json()["status"], "processing")
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(len(calls), 1)
        refund = self.db.scalar(select(Refund).where(Refund.return_request_id == self.claim.id))
        self.assertIn("uncertain", refund.failure_reason.lower())

    def test_payments_handoff_cannot_complete_without_processed_refund(self):
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        self.actor = self.payments_handler
        started = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                    json={"status": "in_progress", "note": "Processing started"})
        self.assertEqual(started.status_code, 200, started.text)
        completed = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                      json={"status": "completed", "note": "Marking complete"})
        self.assertEqual(completed.status_code, 409)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "in_progress")
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=self.claim.id).count(), 0)

    def test_failed_razorpay_result_is_not_success(self):
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(status="failed")
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "test_key", "RAZORPAY_KEY_SECRET": "test_secret",
        }):
            response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "failed")
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "failed")
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.db.query(ReturnRequestEvent).filter_by(
            return_request_id=self.claim.id, event_type="refund_processing_failed",
        ).count(), 1)

    def test_refund_amount_cannot_exceed_captured_payment(self):
        self.item.unit_price = 300
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=self.claim.id).count(), 0)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "failed")
        self.assertIn("exceeds refundable balance", handoff.failure_reason)
        failure = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "refund_execution_failed_before_refund",
        ))
        self.assertEqual(failure.new_status, "failed")
        status_event = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "department_handoff_status_changed",
            ReturnRequestEvent.new_status == "failed",
        ))
        self.assertEqual(status_event.previous_status, "in_progress")

    def test_unsupported_payment_method_is_rejected(self):
        handoff, _ = self.prepare_refund_handoff()
        self.order.payment_method = "unsupported"
        self.db.commit()
        self.accept_payment_handoff(handoff)
        response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=self.claim.id).count(), 0)

    def test_missing_captured_payment_attempt_is_rejected(self):
        handoff, attempt = self.prepare_refund_handoff()
        attempt.status = "failed"
        self.db.commit()
        self.accept_payment_handoff(handoff)
        response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=self.claim.id).count(), 0)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "failed")
        self.assertIn("No captured Razorpay payment", handoff.failure_reason)
        event = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "refund_execution_failed_before_refund",
        ))
        self.assertEqual(event.new_status, "failed")
        handoff_event = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "department_handoff_status_changed",
            ReturnRequestEvent.new_status == "failed",
        ))
        self.assertEqual(handoff_event.previous_status, "in_progress")

    def test_missing_razorpay_configuration_does_not_simulate_refund(self):
        handoff, _ = self.prepare_refund_handoff()
        self.accept_payment_handoff(handoff)
        fake_module, calls = self.fake_razorpay(status="processed")
        with patch.dict(sys.modules, {"razorpay": fake_module}), patch.dict(os.environ, {
            "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": "",
        }):
            response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=self.claim.id).count(), 0)
        self.assertEqual(calls, [])
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "failed")

    def test_cod_refund_uses_existing_service_and_return_link(self):
        handoff, _ = self.prepare_refund_handoff(payment_method="cod")
        self.accept_payment_handoff(handoff)
        first = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund",
                                 json={"external_reference": "BANK-REF-001"})
        second = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund",
                                  json={"external_reference": "BANK-REF-001"})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "processed")
        self.assertEqual(second.status_code, 200, second.text)
        self.assertTrue(second.json()["duplicate"])
        refunds = self.db.scalars(select(Refund).where(Refund.return_request_id == self.claim.id)).all()
        self.assertEqual(len(refunds), 1)
        self.assertEqual(refunds[0].refund_method, "manual_cod")
        self.assertEqual(refunds[0].external_reference, "BANK-REF-001")
        self.assertEqual(self.order.payment_status, "partially_refunded")

    def test_cod_validation_failure_marks_handoff_failed_without_refund(self):
        handoff, _ = self.prepare_refund_handoff(payment_method="cod")
        self.accept_payment_handoff(handoff)
        response = self.client.post(f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund", json={})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=self.claim.id).count(), 0)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "failed")
        self.assertIn("external reference is required", handoff.failure_reason.lower())
        event = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "refund_execution_failed_before_refund",
        ))
        self.assertEqual(event.new_status, "failed")

    def test_replacement_tracking_has_payments_na_and_no_refund(self):
        replacement = ReturnRequest(
            order_id=self.order.id, order_item_id=self.item.id, quantity=1,
            reason="Replace", status="requested", resolution_type="replacement",
            reason_code="defective", workflow_status="submitted",
        )
        self.db.add(replacement)
        self.db.commit()
        self.actor = self.handler
        approved = self.client.post(f"/api/v1/departments/returns/{replacement.id}/approve",
                                    json={"note": "Replacement approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        details = self.client.get(f"/api/v1/departments/returns/{replacement.id}")
        self.assertEqual(details.status_code, 200, details.text)
        self.assertEqual(details.json()["tracking"]["payments"], "N/A")
        self.assertEqual(self.db.query(Refund).filter_by(return_request_id=replacement.id).count(), 0)

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
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(
            return_request_id=replacement.id, handoff_type="refund_processing",
        ).count(), 0)

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

    def test_collection_completion_rolls_back_when_payments_is_not_configured(self):
        self.claim.refund_timing = "after_collection"
        self.db.commit()
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
        self.assertEqual(self.client.patch(f"/api/v1/departments/return-handoffs/{pickup.id}/status",
                                           json={"status": "in_progress", "note": "At warehouse"}).status_code, 200)
        scheduled = self.client.patch(
            f"/api/v1/departments/order-delivery/return-handoffs/{pickup.id}/milestones",
            json={"milestone": "pickup_scheduled", "note": "Pickup scheduled"},
        )
        self.assertEqual(scheduled.status_code, 200, scheduled.text)
        failed = self.client.patch(
            f"/api/v1/departments/order-delivery/return-handoffs/{pickup.id}/milestones",
            json={"milestone": "item_collected", "note": "Collected"},
        )
        self.assertEqual(failed.status_code, 404)
        self.db.refresh(pickup)
        self.assertEqual(pickup.status, "in_progress")
        from backend.Database.models import ReturnInspection
        self.assertEqual(self.db.query(ReturnInspection).filter_by(return_request_id=self.claim.id).count(), 0)
        self.assertEqual(self.db.query(ReturnHandoff).filter_by(
            return_request_id=self.claim.id, handoff_type="refund_processing",
        ).count(), 0)

    def test_department_handoff_lists_are_scoped_and_returns_tracking_is_consolidated(self):
        handoff, _ = self.prepare_refund_handoff(payment_method="cod")
        self.actor = self.delivery_handler
        delivery = self.client.get("/api/v1/departments/order-delivery/return-handoffs")
        self.assertEqual(delivery.status_code, 200, delivery.text)
        self.assertEqual(delivery.json()["items"][0]["return_request_id"], self.claim.id)
        self.assertEqual(delivery.json()["items"][0]["item"]["product_name"], "Notebook")
        self.assertEqual(self.client.get("/api/v1/departments/payments/refund-handoffs").status_code, 403)
        self.actor = self.handler
        tracking = self.client.get("/api/v1/departments/returns-tracking")
        self.assertEqual(tracking.status_code, 200, tracking.text)
        self.assertEqual(tracking.json()["total"], 1)
        row = tracking.json()["items"][0]
        self.assertEqual(row["return_request_id"], self.claim.id)
        self.assertEqual(row["product_id"], self.variant.product_id)
        self.assertEqual(row["order_delivery_status"], "pending")
        self.assertEqual(row["payments_handoff_status"], "pending")
        self.assertEqual(row["financial_refund_status"], [])
        request_records = self.client.get("/api/v1/departments/tracking-handoffs")
        self.assertEqual(request_records.status_code, 200, request_records.text)
        self.assertEqual(request_records.json()["total"], 1)
        consolidated = request_records.json()["items"][0]
        self.assertEqual(consolidated["request_id"], self.claim.id)
        self.assertEqual(consolidated["order_department_status"], "pending")
        self.assertEqual(consolidated["payment_department_status"], "pending")
        detail = self.client.get(f"/api/v1/departments/returns/{self.claim.id}")
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(detail.json()["handoff_history"][0]["source_department"], "Returns & Replacement")
        self.assertIn(detail.json()["handoff_history"][0]["destination_department"],
                      {"Order & Delivery", "Payments & Refunds"})
        self.actor = self.payments_handler
        payments = self.client.get("/api/v1/departments/payments/refund-handoffs")
        self.assertEqual(payments.status_code, 200, payments.text)
        self.assertEqual(payments.json()["items"][0]["customer"]["name"], self.customer.name)
        self.assertEqual(self.client.get("/api/v1/departments/order-delivery/return-handoffs").status_code, 403)

    def test_returns_can_manually_resolve_completed_replacement(self):
        replacement = ReturnRequest(
            order_id=self.order.id, order_item_id=self.item.id, quantity=1,
            reason="Replace", status="requested", resolution_type="replacement",
            reason_code="defective", workflow_status="submitted",
        )
        self.db.add(replacement)
        self.db.commit()
        self.actor = self.handler
        approved = self.client.post(f"/api/v1/departments/returns/{replacement.id}/approve",
                                    json={"note": "Replacement approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        handoff = self.db.scalar(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == replacement.id,
            ReturnHandoff.handoff_type == "replacement_fulfillment",
        ))
        self.actor = self.delivery_handler
        for state in ("accepted", "in_progress"):
            response = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                         json={"status": state, "note": f"Replacement {state}"})
            self.assertEqual(response.status_code, 200, response.text)
        skipped = self.client.patch(
            f"/api/v1/departments/order-delivery/return-handoffs/{handoff.id}/milestones",
            json={"milestone": "replacement_ready_to_ship", "note": "Attempt to skip preparation"},
        )
        self.assertEqual(skipped.status_code, 409)
        premature = self.client.patch(
            f"/api/v1/departments/return-handoffs/{handoff.id}/status",
            json={"status": "completed", "note": "Attempt to complete early"},
        )
        self.assertEqual(premature.status_code, 409)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "in_progress")
        for milestone in ("pickup_scheduled", "item_collected", "replacement_prepared",
                          "replacement_ready_to_ship", "replacement_out_for_delivery"):
            response = self.client.patch(
                f"/api/v1/departments/order-delivery/return-handoffs/{handoff.id}/milestones",
                json={"milestone": milestone, "note": f"Confirmed {milestone}"},
            )
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(handoff.status, "in_progress")
        delivered = self.client.patch(
            f"/api/v1/departments/order-delivery/return-handoffs/{handoff.id}/milestones",
            json={"milestone": "replacement_delivered", "note": "Customer received replacement"},
        )
        self.assertEqual(delivered.status_code, 200, delivered.text)
        self.db.refresh(handoff)
        self.assertEqual(handoff.status, "completed")
        self.actor = self.handler
        resolved = self.client.post(f"/api/v1/departments/returns/{replacement.id}/resolve",
                                    json={"note": "Replacement delivery completed"})
        self.assertEqual(resolved.status_code, 200, resolved.text)
        tracking = self.client.get("/api/v1/departments/returns-tracking").json()
        row = next(item for item in tracking["items"] if item["return_request_id"] == replacement.id)
        self.assertEqual(row["payments_handoff_status"], "N/A")
        self.assertEqual(row["financial_refund_status"], [])

    def test_only_returns_can_manually_resolve_after_all_required_work(self):
        handoff, _ = self.prepare_refund_handoff(payment_method="cod")
        self.accept_payment_handoff(handoff)
        processed = self.client.post(
            f"/api/v1/departments/return-handoffs/{handoff.id}/process-refund",
            json={"external_reference": "BANK-RESOLVE-001"},
        )
        self.assertEqual(processed.status_code, 200, processed.text)
        pickup = self.db.scalar(select(ReturnHandoff).where(
            ReturnHandoff.return_request_id == self.claim.id,
            ReturnHandoff.handoff_type == "refund_pickup",
        ))
        self.actor = self.handler
        incomplete = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/resolve",
                                      json={"note": "Resolve after review"})
        self.assertEqual(incomplete.status_code, 409)
        self.actor = self.delivery_handler
        self.assertEqual(self.client.post(f"/api/v1/departments/returns/{self.claim.id}/resolve",
                                          json={"note": "Wrong department"}).status_code, 403)
        for state in ("accepted", "in_progress"):
            response = self.client.patch(f"/api/v1/departments/return-handoffs/{pickup.id}/status",
                                         json={"status": state, "note": f"Pickup {state}"})
            self.assertEqual(response.status_code, 200, response.text)
        for milestone in ("pickup_scheduled", "item_collected"):
            response = self.client.patch(
                f"/api/v1/departments/order-delivery/return-handoffs/{pickup.id}/milestones",
                json={"milestone": milestone, "note": f"Pickup milestone {milestone}"},
            )
            self.assertEqual(response.status_code, 200, response.text)
        self.actor = self.handler
        resolved = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/resolve",
                                    json={"note": "Refund and pickup verified"})
        self.assertEqual(resolved.status_code, 200, resolved.text)
        self.assertEqual(resolved.json()["workflow_status"], "resolved")
        self.assertEqual(resolved.json()["status"], "completed")
        event = self.db.scalar(select(ReturnRequestEvent).where(
            ReturnRequestEvent.return_request_id == self.claim.id,
            ReturnRequestEvent.event_type == "request_manually_resolved",
        ))
        self.assertEqual(event.actor_user_id, self.handler.id)


if __name__ == "__main__":
    unittest.main()
