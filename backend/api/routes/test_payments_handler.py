import unittest
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    CommerceOrder, CommerceOrderItem, Department, PaymentAttempt, Product, ProductVariant,
    Refund, ReturnHandoff, ReturnRequest, Shipment, User,
)
from backend.api.routes.department import (
    get_payments_dashboard,
    list_payments_transactions, get_payment_transaction_details,
    list_payments_refunds, get_payment_refund_details,
    list_payments_settlements, list_payments_disputes,
    get_payments_reports_stats, list_payments_history_audit,
)
from fastapi import HTTPException


class PaymentsHandlerUnitTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[t for t in Base.metadata.sorted_tables if t.name != "knowledge_chunks"])
        self.db = Session(self.engine)

        self.payments_dept = Department(name="Payments & Refunds", email="payments@example.test")
        self.returns_dept = Department(name="Returns & Replacement", email="returns@example.test")
        self.delivery_dept = Department(name="Order & Delivery", email="delivery@example.test")

        self.customer = User(name="Test Customer", email="customer@example.test", password="hash", role="user")
        self.payments_handler = User(name="Payments Handler", email="payments-handler@example.test",
                                     password="hash", role="department_handler")
        self.delivery_handler = User(name="Delivery Handler", email="delivery-handler@example.test",
                                     password="hash", role="department_handler")
        self.admin = User(name="Admin", email="admin@example.test", password="hash", role="admin")

        self.db.add_all([
            self.payments_dept, self.returns_dept, self.delivery_dept,
            self.customer, self.payments_handler, self.delivery_handler, self.admin
        ])
        self.db.flush()

        self.payments_handler.department_id = self.payments_dept.id
        self.delivery_handler.department_id = self.delivery_dept.id

        product = Product(name="Leather Jacket", slug="leather-jacket", brand="Flatkart", category_id=None,
                          is_active=True, is_returnable=True, return_window_days=7, is_refundable=True)
        self.db.add(product)
        self.db.flush()
        variant = ProductVariant(product_id=product.id, sku="FK-JKT-BLK", name="Black",
                                 price=Decimal("2480.00"), mrp=Decimal("2480.00"), is_available=True)
        self.db.add(variant)
        self.db.flush()

        order = CommerceOrder(order_number="FK-2048", user_id=self.customer.id,
                              status="placed", payment_method="upi", total_amount=Decimal("2480.00"),
                              currency="INR")
        self.db.add(order)
        self.db.flush()

        order_item = CommerceOrderItem(order_id=order.id, variant_id=variant.id,
                                       product_name=product.name, variant_name=variant.name,
                                       sku=variant.sku, quantity=1, unit_price=Decimal("2480.00"))
        self.db.add(order_item)
        self.db.flush()

        attempt = PaymentAttempt(order_id=order.id, provider="razorpay", status="captured",
                                 amount=Decimal("2480.00"), currency="INR", idempotency_key="pay-key-1",
                                 provider_payment_id="pay_ABC123", expires_at=datetime.now(timezone.utc).replace(tzinfo=None))
        self.db.add(attempt)
        self.db.flush()

        claim = ReturnRequest(order_id=order.id, order_item_id=order_item.id,
                              quantity=1, reason="Defective", status="approved", workflow_status="approved",
                              resolution_type="refund", refund_timing="immediate", submission_key="sub-key-1")
        self.db.add(claim)
        self.db.flush()

        handoff = ReturnHandoff(return_request_id=claim.id, source_department_id=self.returns_dept.id,
                                destination_department_id=self.payments_dept.id, handoff_type="refund_processing",
                                status="pending", idempotency_key="claim-1-refund-1")
        self.db.add(handoff)
        self.db.commit()

        self.claim = claim
        self.handoff = handoff
        self.attempt = attempt
        self.order = order

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_payments_dashboard_authorization(self):
        # Payments handler can access
        data = get_payments_dashboard("month", self.db, self.payments_handler)
        self.assertIn("net_collections", data)
        self.assertIn("total_collected", data)
        self.assertIn("payment_overview", data)
        self.assertIn("refund_overview", data)
        self.assertIn("recent_payments", data)
        self.assertIn("refund_requests", data)
        self.assertEqual(data["total_collected"], 2480.0)

        # Other department handler is forbidden
        with self.assertRaises(HTTPException) as ctx:
            get_payments_dashboard("month", self.db, self.delivery_handler)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("You are not assigned to the Payments & Refunds department", ctx.exception.detail)

    def test_payments_transactions_list_and_details(self):
        data = list_payments_transactions(None, None, None, None, None, None, None, 20, 0, self.db, self.payments_handler)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["items"][0]["order_number"], "FK-2048")
        self.assertEqual(data["kpis"]["captured"], 1)

        # Detail view
        detail = get_payment_transaction_details(self.attempt.id, self.db, self.payments_handler)
        self.assertEqual(detail["id"], self.attempt.id)
        self.assertIn("***@", detail["customer"]["masked_email"])

    def test_failed_filter_matches_failed_kpi_bucket_and_keeps_stored_status(self):
        for status, key in (("cancelled", "pay-cancelled"), ("expired", "pay-expired")):
            self.db.add(PaymentAttempt(
                order_id=self.order.id, provider="razorpay", status=status,
                amount=Decimal("2480.00"), currency="INR", idempotency_key=key,
                failure_reason=f"Stored {status} status",
                expires_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
        self.db.commit()

        result = list_payments_transactions(
            search=None, payment_status="failed", payment_method=None,
            date_from=None, date_to=None, amount_min=None, amount_max=None,
            limit=20, offset=0, db=self.db, actor=self.payments_handler,
        )
        self.assertEqual(result["kpis"]["failed"], 2)
        self.assertEqual(result["total"], 2)
        self.assertEqual({row["status"] for row in result["items"]}, {"cancelled", "expired"})

    def test_processing_provider_refund_is_not_reported_as_completed(self):
        self.handoff.status = "completed"
        self.claim.workflow_status = "completed"
        self.db.add(Refund(
            order_id=self.order.id, payment_attempt_id=self.attempt.id,
            return_request_id=self.claim.id, amount=Decimal("2480.00"),
            currency="INR", reason="Return", refund_method="razorpay",
            provider_refund_id="rfnd_pending_test", status="processing",
            idempotency_key="return-pending-test", processed_by_id=self.payments_handler.id,
        ))
        self.db.commit()

        detail = get_payment_refund_details(self.handoff.id, self.db, self.payments_handler)
        self.assertEqual(detail["refund_status"], "processing")
        self.assertEqual(detail["status"], "processing")
        self.assertEqual(detail["handoff_status"], "completed")
        self.assertFalse(detail["is_eligible_for_refund"])

    def test_payments_refunds_queue_and_details(self):
        data = list_payments_refunds(None, None, None, None, 20, 0, self.db, self.payments_handler)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["tab_counts"]["awaiting_processing"], 1)

        detail = get_payment_refund_details(self.handoff.id, self.db, self.payments_handler)
        self.assertEqual(detail["handoff_id"], self.handoff.id)
        self.assertTrue(detail["eligibility"]["is_eligible"])
        self.assertEqual(detail["original_payment"]["provider_payment_id"], "pay_ABC123")
        self.assertEqual(detail["original_payment"]["captured_amount"], 2480.0)
        self.assertEqual(detail["original_payment"]["remaining_refundable"], 2480.0)

    def test_payments_settlements_and_disputes_honest_empty(self):
        s_res = list_payments_settlements(self.db, self.payments_handler)
        self.assertEqual(s_res["items"], [])
        self.assertEqual(s_res["status"], "unsupported")

        d_res = list_payments_disputes(self.db, self.payments_handler)
        self.assertEqual(d_res["items"], [])
        self.assertEqual(d_res["status"], "unsupported")

    def test_payments_reports_and_history_audit(self):
        rep = get_payments_reports_stats("month", self.db, self.payments_handler)
        self.assertEqual(rep["kpis"]["total_collected"], 2480.0)

        hist = list_payments_history_audit(None, None, 20, 0, self.db, self.payments_handler)
        self.assertGreaterEqual(hist["total"], 1)

    def test_payment_transaction_masked_fields_and_order_data(self):
        self.customer.mobile_number = "9876543210"
        self.db.commit()

        detail = get_payment_transaction_details(self.attempt.id, self.db, self.payments_handler)
        self.assertEqual(detail["order_number"], "FK-2048")
        self.assertEqual(detail["order_id"], self.order.id)
        self.assertEqual(detail["payment_method"], "upi")
        self.assertEqual(detail["provider_reference"], "pay_ABC123")
        self.assertIn("customer", detail)
        self.assertIn("***@", detail["customer"]["email_masked"])
        self.assertEqual(detail["customer"]["phone_masked"], "******3210")

    def test_legacy_claim_missing_refund_timing_is_ineligible_and_rejected(self):
        from backend.Database.models import ReturnRequest, ReturnHandoff
        from backend.api.routes.department import process_return_refund_handoff, ReturnRefundExecutionInput

        legacy_claim = ReturnRequest(
            order_id=self.order.id,
            order_item_id=self.order.items[0].id,
            quantity=1,
            reason="Legacy defect without timing",
            status="approved",
            workflow_status="approved",
            resolution_type="refund",
            refund_timing=None,
            submission_key="sub-key-legacy",
        )
        self.db.add(legacy_claim)
        self.db.flush()

        legacy_handoff = ReturnHandoff(
            return_request_id=legacy_claim.id,
            source_department_id=self.returns_dept.id,
            destination_department_id=self.payments_dept.id,
            handoff_type="refund_processing",
            status="pending",
            idempotency_key="legacy-handoff-1",
        )
        self.db.add(legacy_handoff)
        self.db.commit()

        detail = get_payment_refund_details(legacy_handoff.id, self.db, self.payments_handler)
        self.assertFalse(detail["is_eligible_for_refund"])
        self.assertIsNone(detail["refund_timing"])
        self.assertIn("Refund timing is unavailable", detail["ineligible_reason"])

        # Attempting to process refund on legacy claim without timing must fail with 409
        payload = ReturnRefundExecutionInput(external_reference=None)
        with self.assertRaises(HTTPException) as ctx:
            process_return_refund_handoff(legacy_handoff.id, payload, self.db, self.payments_handler)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("Refund timing is unavailable for this request", ctx.exception.detail)

        # Even after accepting the handoff, it is still rejected safely without invoking payment provider
        legacy_handoff.status = "accepted"
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            process_return_refund_handoff(legacy_handoff.id, payload, self.db, self.payments_handler)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("Refund timing is unavailable for this request", ctx.exception.detail)

        # Assert no Refund record was created
        refund_count = self.db.query(Refund).filter(Refund.return_request_id == legacy_claim.id).count()
        self.assertEqual(refund_count, 0)
