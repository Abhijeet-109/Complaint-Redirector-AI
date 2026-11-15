"""Comprehensive unit tests for department-specific complaints access, isolation,
lifecycle transitions, redirection, and audit history.
"""

import os
import sys
import types
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "department-complaints-test-secret-key-32-bytes"

# Stub out heavy model predictor before any route imports
stub = types.ModuleType("backend.predictor")
stub.predict_department = lambda c: ("Order & Delivery", 0.95)
sys.modules["backend.predictor"] = stub

# Stub out router email notifications
router_stub = types.ModuleType("backend.router")
router_stub.send_complaint_email = lambda **kw: "test@example.test"
router_stub.send_redirect_email = lambda **kw: True
sys.modules["backend.router"] = router_stub

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    Complaint,
    ComplaintRedirection,
    Department,
    User,
    ReturnRequest,
    Refund,
    ReturnHandoff,
)
from backend.api.routes.complaint import (
    ComplaintStatusUpdate,
    ComplaintRedirectRequest,
    get_handler_complaints,
    get_handler_complaint_by_id,
    update_handler_complaint_status,
    redirect_handler_complaint,
    get_handler_complaint_redirections,
    get_admin_complaints,
)


class DepartmentComplaintsUnitTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[t for t in Base.metadata.sorted_tables if t.name != "knowledge_chunks"],
        )
        self.db = Session(self.engine)

        self._seed_data()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _seed_data(self):
        # 1. Departments
        self.od_dept = Department(name="Order & Delivery", email="od@flatkart.test")
        self.pay_dept = Department(name="Payments & Refunds", email="payments@flatkart.test")
        self.ret_dept = Department(name="Returns & Replacement", email="returns@flatkart.test")
        self.db.add_all([self.od_dept, self.pay_dept, self.ret_dept])
        self.db.flush()

        # 2. Users (Customer, Handlers, Admin)
        self.customer = User(
            name="Ananya Sharma",
            email="ananya@example.test",
            password="test-password-hash",
            role="user",
        )
        self.od_handler = User(
            name="Vikram Delivery",
            email="vikram.od@flatkart.test",
            password="test-password-hash",
            role="department_handler",
            department_id=self.od_dept.id,
        )
        self.pay_handler = User(
            name="Pooja Payments",
            email="pooja.pay@flatkart.test",
            password="test-password-hash",
            role="department_handler",
            department_id=self.pay_dept.id,
        )
        self.ret_handler = User(
            name="Rahul Returns",
            email="rahul.ret@flatkart.test",
            password="test-password-hash",
            role="department_handler",
            department_id=self.ret_dept.id,
        )
        self.admin = User(
            name="Global Admin",
            email="admin@flatkart.test",
            password="test-password-hash",
            role="admin",
        )
        self.db.add_all([
            self.customer,
            self.od_handler,
            self.pay_handler,
            self.ret_handler,
            self.admin,
        ])
        self.db.flush()

        # 3. Seed Complaints for each department
        self.od_complaint = Complaint(
            user_id=self.customer.id,
            predicted_department_id=self.od_dept.id,
            department_id=self.od_dept.id,
            complaint_text="My package delivery has been delayed by 5 days and courier is unreachable.",
            confidence="0.94",
            status="pending",
        )
        self.pay_complaint = Complaint(
            user_id=self.customer.id,
            predicted_department_id=self.pay_dept.id,
            department_id=self.pay_dept.id,
            complaint_text="Amount deducted twice via UPI for order FK-9021 but order shows payment pending.",
            confidence="0.98",
            status="pending",
        )
        self.ret_complaint = Complaint(
            user_id=self.customer.id,
            predicted_department_id=self.ret_dept.id,
            department_id=self.ret_dept.id,
            complaint_text="Received defective item with broken zip, request immediate replacement.",
            confidence="0.96",
            status="pending",
        )
        self.db.add_all([self.od_complaint, self.pay_complaint, self.ret_complaint])
        self.db.commit()

    # Test 1: Order & Delivery handler can list complaints assigned to Order & Delivery
    def test_order_delivery_handler_lists_only_od_complaints(self):
        complaints = get_handler_complaints(self.db, self.od_handler)
        self.assertEqual(len(complaints), 1)
        self.assertEqual(complaints[0]["id"], self.od_complaint.id)
        self.assertEqual(complaints[0]["current_department"], "Order & Delivery")
        self.assertEqual(complaints[0]["user_name"], "Ananya Sharma")

    # Test 2: Payments handler can list complaints assigned to Payments & Refunds
    def test_payments_handler_lists_only_payments_complaints(self):
        complaints = get_handler_complaints(self.db, self.pay_handler)
        self.assertEqual(len(complaints), 1)
        self.assertEqual(complaints[0]["id"], self.pay_complaint.id)
        self.assertEqual(complaints[0]["current_department"], "Payments & Refunds")

    # Test 3: Order & Delivery handler cannot list or read Payments complaints
    def test_od_handler_cannot_read_payments_complaint(self):
        with self.assertRaises(HTTPException) as ctx:
            get_handler_complaint_by_id(self.pay_complaint.id, self.db, self.od_handler)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Complaint not found")

    # Test 4: Payments handler cannot list or read Order & Delivery complaints
    def test_payments_handler_cannot_read_od_complaint(self):
        with self.assertRaises(HTTPException) as ctx:
            get_handler_complaint_by_id(self.od_complaint.id, self.db, self.pay_handler)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Complaint not found")

    # Test 5: A handler cannot access a complaint assigned to another department by guessing its ID
    def test_handler_cannot_access_arbitrary_complaint_id(self):
        with self.assertRaises(HTTPException) as ctx:
            get_handler_complaint_by_id(999999, self.db, self.od_handler)
        self.assertEqual(ctx.exception.status_code, 404)

    # Test 6: Allowed status transitions persist
    def test_allowed_status_transitions_persist(self):
        cmp_id = self.od_complaint.id

        # Transition 1: pending -> followed_up
        res1 = update_handler_complaint_status(
            cmp_id, ComplaintStatusUpdate(status="followed_up"), self.db, self.od_handler
        )
        self.assertEqual(res1["status"], "followed_up")
        c = self.db.query(Complaint).filter(Complaint.id == cmp_id).first()
        self.assertEqual(c.status, "followed_up")

        # Transition 2: followed_up -> resolved
        res2 = update_handler_complaint_status(
            cmp_id, ComplaintStatusUpdate(status="resolved"), self.db, self.od_handler
        )
        self.assertEqual(res2["status"], "resolved")
        c = self.db.query(Complaint).filter(Complaint.id == cmp_id).first()
        self.assertEqual(c.status, "resolved")

        # Transition 3: resolved -> pending
        res3 = update_handler_complaint_status(
            cmp_id, ComplaintStatusUpdate(status="pending"), self.db, self.od_handler
        )
        self.assertEqual(res3["status"], "pending")
        c = self.db.query(Complaint).filter(Complaint.id == cmp_id).first()
        self.assertEqual(c.status, "pending")

    # Test 7: Invalid status transitions are rejected
    def test_invalid_status_transition_rejected(self):
        cmp_id = self.od_complaint.id

        invalid_statuses = ["approved", "closed_by_user", "refunded", "invalid_status", ""]
        for bad_status in invalid_statuses:
            with self.assertRaises(HTTPException) as ctx:
                update_handler_complaint_status(
                    cmp_id, ComplaintStatusUpdate(status=bad_status), self.db, self.od_handler
                )
            self.assertEqual(ctx.exception.status_code, 422)

        # Confirm status remained unchanged in DB
        c = self.db.query(Complaint).filter(Complaint.id == cmp_id).first()
        self.assertEqual(c.status, "pending")

    # Test 8: A stale/reassigned complaint cannot be mutated by the former department
    def test_stale_reassigned_complaint_cannot_be_mutated_by_former_department(self):
        # 1. OD handler redirects complaint to Payments & Refunds
        redirect_res = redirect_handler_complaint(
            self.od_complaint.id,
            ComplaintRedirectRequest(department_id=self.pay_dept.id, reason="further_processing"),
            self.db,
            self.od_handler,
        )
        self.assertEqual(redirect_res["current_department"], "Payments & Refunds")

        # 2. Former OD handler now attempts to update status of the redirected complaint
        with self.assertRaises(HTTPException) as ctx:
            update_handler_complaint_status(
                self.od_complaint.id,
                ComplaintStatusUpdate(status="resolved"),
                self.db,
                self.od_handler,
            )
        # 404 because complaint is no longer assigned to OD department
        self.assertEqual(ctx.exception.status_code, 404)

        # 3. Former OD handler cannot redirect it again
        with self.assertRaises(HTTPException) as ctx:
            redirect_handler_complaint(
                self.od_complaint.id,
                ComplaintRedirectRequest(department_id=self.ret_dept.id, reason="further_processing"),
                self.db,
                self.od_handler,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    # Test 9: Redirection updates assignment and status atomically, creating history
    def test_redirection_atomic_update_and_history(self):
        cmp_id = self.pay_complaint.id

        res = redirect_handler_complaint(
            cmp_id,
            ComplaintRedirectRequest(department_id=self.od_dept.id, reason="model_fault"),
            self.db,
            self.pay_handler,
        )
        self.assertEqual(res["department_id"], self.od_dept.id)
        self.assertEqual(res["current_department"], "Order & Delivery")
        self.assertEqual(res["status"], "pending")
        self.assertEqual(res["redirection_reason"], "model_fault")

        # Verify DB state
        c = self.db.query(Complaint).filter(Complaint.id == cmp_id).first()
        self.assertEqual(c.department_id, self.od_dept.id)
        self.assertIsNone(c.handler_id)
        self.assertEqual(c.status, "pending")

        redirections = self.db.query(ComplaintRedirection).filter(
            ComplaintRedirection.complaint_id == cmp_id
        ).all()
        self.assertEqual(len(redirections), 1)
        self.assertEqual(redirections[0].from_department_id, self.pay_dept.id)
        self.assertEqual(redirections[0].to_department_id, self.od_dept.id)
        self.assertEqual(redirections[0].redirected_by_user_id, self.pay_handler.id)
        self.assertEqual(redirections[0].reason, "model_fault")

        # Verify new department handler can view the redirection history
        history = get_handler_complaint_redirections(cmp_id, self.db, self.od_handler)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["from_department"], "Payments & Refunds")
        self.assertEqual(history[0]["to_department"], "Order & Delivery")
        self.assertEqual(history[0]["redirected_by_name"], "Pooja Payments")
        self.assertEqual(history[0]["reason"], "model_fault")

    # Test 10: Failed redirection leaves original persisted assignment/history intact
    def test_failed_redirection_leaves_original_state_intact(self):
        cmp_id = self.od_complaint.id

        # 1. Target department does not exist (404)
        with self.assertRaises(HTTPException) as ctx1:
            redirect_handler_complaint(
                cmp_id,
                ComplaintRedirectRequest(department_id=99999, reason="further_processing"),
                self.db,
                self.od_handler,
            )
        self.assertEqual(ctx1.exception.status_code, 404)

        # 2. Redirect to same department (400)
        with self.assertRaises(HTTPException) as ctx2:
            redirect_handler_complaint(
                cmp_id,
                ComplaintRedirectRequest(department_id=self.od_dept.id, reason="further_processing"),
                self.db,
                self.od_handler,
            )
        self.assertEqual(ctx2.exception.status_code, 400)

        # Confirm DB unchanged
        c = self.db.query(Complaint).filter(Complaint.id == cmp_id).first()
        self.assertEqual(c.department_id, self.od_dept.id)
        self.assertEqual(c.status, "pending")
        count = self.db.query(ComplaintRedirection).filter(
            ComplaintRedirection.complaint_id == cmp_id
        ).count()
        self.assertEqual(count, 0)

    # Test 11: Returns & Replacement complaint behavior remains unchanged
    def test_returns_replacement_complaint_behavior_unchanged(self):
        complaints = get_handler_complaints(self.db, self.ret_handler)
        self.assertEqual(len(complaints), 1)
        self.assertEqual(complaints[0]["id"], self.ret_complaint.id)
        self.assertEqual(complaints[0]["current_department"], "Returns & Replacement")

    # Test 12: Admin existing broad access remains unchanged
    def test_admin_existing_access_remains_unchanged(self):
        # Admin can view all complaints via get_admin_complaints
        all_complaints = get_admin_complaints(self.db, self.admin)
        self.assertEqual(len(all_complaints), 3)

        # Admin can view complaint details across departments
        od_detail = get_handler_complaint_by_id(self.od_complaint.id, self.db, self.admin)
        self.assertEqual(od_detail["id"], self.od_complaint.id)

    # Test 13: Complaint records are not duplicated on redirection
    def test_complaints_are_not_duplicated_on_redirection(self):
        initial_count = self.db.query(Complaint).count()

        # Redirect OD complaint to Returns
        redirect_handler_complaint(
            self.od_complaint.id,
            ComplaintRedirectRequest(department_id=self.ret_dept.id, reason="further_processing"),
            self.db,
            self.od_handler,
        )

        after_count = self.db.query(Complaint).count()
        self.assertEqual(initial_count, after_count, "Complaint count should not increase on redirection")

    # Test 14: Complaint processing does not create ReturnRequest, Refund or ReturnHandoff records
    def test_complaint_processing_does_not_create_return_or_refund_records(self):
        rr_before = self.db.query(ReturnRequest).count()
        rf_before = self.db.query(Refund).count()
        rh_before = self.db.query(ReturnHandoff).count()

        # Update status
        update_handler_complaint_status(
            self.od_complaint.id,
            ComplaintStatusUpdate(status="followed_up"),
            self.db,
            self.od_handler,
        )
        # Redirect
        redirect_handler_complaint(
            self.od_complaint.id,
            ComplaintRedirectRequest(department_id=self.pay_dept.id, reason="further_processing"),
            self.db,
            self.od_handler,
        )

        self.assertEqual(self.db.query(ReturnRequest).count(), rr_before)
        self.assertEqual(self.db.query(Refund).count(), rf_before)
        self.assertEqual(self.db.query(ReturnHandoff).count(), rh_before)

    # Test 15: Refund processing still requires existing approved Payments refund handoff
    def test_complaints_do_not_bypass_payments_refund_handoff(self):
        # A complaint cannot be "refunded" directly via status
        with self.assertRaises(HTTPException) as ctx:
            update_handler_complaint_status(
                self.pay_complaint.id,
                ComplaintStatusUpdate(status="refunded"),
                self.db,
                self.pay_handler,
            )
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
