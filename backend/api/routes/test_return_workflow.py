import io
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    CommerceOrder, CommerceOrderItem, Department, ReturnHandoff,
    ReturnRequest, ReturnRequestEvent, User,
)
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
        self.admin = User(name="Admin", email="admin@example.test", password="hash", role="admin")
        self.db.add_all([self.customer, self.other, self.handler_department, self.other_department,
                         self.delivery_department,
                         self.payments_handler, self.admin])
        self.db.flush()
        self.handler.department_id = self.handler_department.id
        self.payments_handler.department_id = self.other_department.id
        self.order = CommerceOrder(order_number="RET-ORDER-1", user_id=self.customer.id, status="delivered")
        self.db.add(self.order)
        self.db.flush()
        self.item = CommerceOrderItem(order_id=self.order.id, variant_id=1, product_name="Notebook",
                                      variant_name="A4", sku="NB-A4", quantity=2, unit_price=100)
        self.db.add(self.item)
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
        self.assertEqual(handoff.destination_department_id, self.other_department.id)
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
        reviewed = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "evidence_review", "outcome": "passed", "notes": "Photo is clear",
        })
        self.assertEqual(reviewed.status_code, 201, reviewed.text)
        details = self.client.get(f"/api/v1/departments/returns/{self.claim.id}").json()
        self.assertEqual([row["type"] for row in details["inspection_history"]], ["evidence_review"])
        self.assertEqual(self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Physical package checked",
        }).status_code, 409)

        handoff = self.db.scalar(select(ReturnHandoff).where(ReturnHandoff.return_request_id == self.claim.id))
        self.actor = self.payments_handler
        accepted = self.client.patch(f"/api/v1/departments/return-handoffs/{handoff.id}/status",
                                     json={"status": "accepted", "note": "Work accepted"})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.actor = self.handler
        physical = self.client.post(f"/api/v1/departments/returns/{self.claim.id}/inspections", json={
            "inspection_type": "physical_pickup", "outcome": "passed", "notes": "Physical package checked",
        })
        self.assertEqual(physical.status_code, 201, physical.text)

    def test_replacement_routing_and_decision_rollback_when_department_is_missing(self):
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

        second = ReturnRequest(order_id=self.order.id, order_item_id=self.item.id, quantity=1,
                               reason="Refund", status="requested", resolution_type="refund",
                               reason_code="damaged", workflow_status="submitted")
        self.db.add(second)
        self.db.commit()
        self.db.delete(self.other_department)
        self.db.commit()
        failed = self.client.post(f"/api/v1/departments/returns/{second.id}/approve",
                                  json={"note": "Refund approved"})
        self.assertEqual(failed.status_code, 404)
        self.db.refresh(second)
        self.assertEqual(second.workflow_status, "submitted")
        self.assertIsNone(self.db.scalar(select(ReturnHandoff.id).where(ReturnHandoff.return_request_id == second.id)))


if __name__ == "__main__":
    unittest.main()
