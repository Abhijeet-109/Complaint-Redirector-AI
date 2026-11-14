"""Focused database-backed tests for Returns agent read-only tools."""

import unittest
import io
import os
import sys
import types
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from PIL import Image
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("GROQ_API_KEY", "test-key")

# Keep the agent package import independent of Hugging Face model downloads.
_pipeline = types.ModuleType("backend.chatbot.answer_pipeline")
_pipeline.answer_question = lambda question, chat_history=None: {"answer": "unused", "sources": []}
_vector_store = types.ModuleType("backend.chatbot.vector_store")
_vector_store.vectorstore = object()
sys.modules.setdefault("backend.chatbot.answer_pipeline", _pipeline)
sys.modules.setdefault("backend.chatbot.vector_store", _vector_store)

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    CommerceOrder,
    CommerceOrderItem,
    Department,
    Product,
    ProductVariant,
    Refund,
    ReturnEvidence,
    ReturnHandoff,
    ReturnInspection,
    ReturnRequest,
    ReturnRequestEvent,
    Shipment,
    User,
    ChatConversation,
)
from backend.agents.returns import tools as returns_tools
from backend.agents.returns import agent as returns_agent


class ReturnsToolsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        table_names = (
            "users", "departments", "products", "product_variants", "commerce_orders", "chat_conversations",
            "commerce_order_items", "return_requests", "return_request_events",
            "return_evidence", "return_handoffs", "return_inspections", "refunds", "shipments",
        )
        Base.metadata.create_all(
            self.engine,
            tables=[Base.metadata.tables[name] for name in table_names],
        )
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.customer = User(name="Customer", email="customer@example.test", password="x")
        self.other_customer = User(name="Other", email="other@example.test", password="x")
        self.db.add_all([self.customer, self.other_customer])
        self.db.flush()
        self.order = CommerceOrder(
            order_number="ORD-CUSTOMER", user_id=self.customer.id, status="delivered",
            subtotal=Decimal("50.00"), total_amount=Decimal("50.00"),
        )
        self.other_order = CommerceOrder(
            order_number="ORD-OTHER", user_id=self.other_customer.id, status="delivered",
            subtotal=Decimal("50.00"), total_amount=Decimal("50.00"),
        )
        self.product = Product(
            name="Notebook", slug="notebook-test", is_returnable=True,
            return_window_days=30, is_refundable=True,
        )
        self.db.add_all([self.order, self.other_order, self.product])
        self.db.flush()
        self.variant = ProductVariant(
            product_id=self.product.id, sku="NOTEBOOK-TEST", name="A5",
            price=Decimal("50.00"), mrp=Decimal("50.00"),
        )
        self.db.add(self.variant)
        self.db.flush()
        self.item = CommerceOrderItem(
            order_id=self.order.id, variant_id=self.variant.id,
            product_name="Notebook", variant_name="A5", sku="NOTEBOOK-TEST",
            quantity=2, unit_price=Decimal("50.00"),
        )
        self.other_item = CommerceOrderItem(
            order_id=self.other_order.id, variant_id=self.variant.id,
            product_name="Notebook", variant_name="A5", sku="NOTEBOOK-TEST",
            quantity=1, unit_price=Decimal("50.00"),
        )
        self.db.add_all([self.item, self.other_item])
        self.db.flush()
        self.request = ReturnRequest(
            order_id=self.order.id, order_item_id=self.item.id, quantity=1,
            reason="Damaged", status="requested", resolution_type="refund",
            reason_code="damaged", workflow_status=None,
        )
        self.other_request = ReturnRequest(
            id=200,
            order_id=self.other_order.id, order_item_id=self.other_item.id,
            quantity=1, reason="Other", status="requested",
        )
        self.empty_order = CommerceOrder(
            order_number="ORD-EMPTY", user_id=self.customer.id, status="delivered",
        )
        self.db.add_all([self.request, self.other_request, self.empty_order])
        self.db.flush()
        self.thread_id = f"returns-test-{uuid.uuid4()}"
        self.db.add(ChatConversation(thread_id=self.thread_id, user_id=self.customer.id, title="Return test"))
        self.db.flush()
        self.db.add(Shipment(
            order_id=self.order.id, status="delivered",
            delivered_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2),
        ))
        self.db.commit()
        self.patch_session = patch.object(returns_tools, "SessionLocal", self.Session)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.patch_session.start()
        self.addCleanup(self.patch_session.stop)

    def tool(self, name):
        return {item.name: item for item in returns_tools.build_returns_tools(self.customer.id)}[name]

    def test_build_validates_authenticated_user_id(self):
        for invalid in (None, 0, -1, True, "1"):
            with self.subTest(user_id=invalid), self.assertRaises(ValueError):
                returns_tools.build_returns_tools(invalid)

    def test_tool_names_remain_compatible_and_all_capabilities_are_exposed(self):
        self.assertEqual(
            {item.name for item in returns_tools.build_returns_tools(self.customer.id)},
            {
                "list_my_return_requests",
                "get_my_order_return_requests",
                "get_my_return_request_details",
                "get_my_return_by_order_and_request_id",
                "check_my_return_eligibility",
                "submit_my_return_request",
            },
        )

    def test_agent_still_constructs_with_the_existing_tool_integration(self):
        with patch.object(returns_agent, "get_model", return_value="model"), patch.object(
            returns_agent, "create_agent", side_effect=lambda **kwargs: kwargs,
        ):
            constructed = returns_agent.build_returns_agent(self.customer.id)
        self.assertEqual(
            {item.name for item in constructed["tools"]},
            {item.name for item in returns_tools.build_returns_tools(self.customer.id)},
        )

    def _png(self):
        output = io.BytesIO()
        Image.new("RGB", (2, 2), "blue").save(output, format="PNG")
        return output.getvalue()

    def test_chat_submission_retry_reuses_request_and_evidence_rows(self):
        from backend.Database.return_evidence_storage import delete_evidence, stage_evidence

        key = str(uuid.uuid4())
        root = os.path.join(os.getcwd(), "backend", "private_return_evidence")
        with patch.dict(os.environ, {
            "RETURN_EVIDENCE_DIR": root,
            "APP_ENV": "test",
            "RETURN_EVIDENCE_STORAGE_PROVIDER": "local_private",
            "IMAGEKIT_PRIVATE_KEY": "",
        }):
            stage_evidence(self._png(), "proof.png", "image/png", self.customer.id,
                           self.thread_id, self.order.id, self.item.id, key)
            self.request.status = "rejected"
            self.request.workflow_status = "rejected"
            self.db.commit()
            tool = {item.name: item for item in returns_tools.build_returns_tools(
                self.customer.id, self.thread_id, self.order.id, self.item.id, key
            )}["submit_my_return_request"]
            payload = {
                "order_id": self.order.id, "order_item_id": self.item.id, "quantity": 1,
                "resolution_type": "refund", "refund_timing": "immediate",
                "reason_code": "damaged", "description": "Photo evidence attached",
            }
            first = tool.invoke(payload)
            retry = tool.invoke(payload)
            self.assertTrue(first["success"], first)
            self.assertTrue(retry["success"], retry)
            self.assertEqual(first["return_request_id"], retry["return_request_id"])
            self.assertEqual(self.db.query(ReturnRequest).filter_by(submission_key=key).count(), 1)
            self.assertEqual(self.db.query(ReturnEvidence).filter_by(
                return_request_id=first["return_request_id"]
            ).count(), 1)
            original_claim = self.db.get(ReturnRequest, first["return_request_id"])
            original_claim.status = "rejected"
            original_claim.workflow_status = "rejected"
            self.db.commit()

            next_key = str(uuid.uuid4())
            stage_evidence(self._png(), "proof-2.png", "image/png", self.customer.id,
                           self.thread_id, self.order.id, self.item.id, next_key)
            next_tool = {item.name: item for item in returns_tools.build_returns_tools(
                self.customer.id, self.thread_id, self.order.id, self.item.id, next_key
            )}["submit_my_return_request"]
            next_result = next_tool.invoke(payload)
            self.assertTrue(next_result["success"], next_result)
            self.assertNotEqual(next_result["return_request_id"], first["return_request_id"])
            self.assertEqual(self.db.query(ReturnRequest).filter(
                ReturnRequest.submission_key.in_([key, next_key])
            ).count(), 2)

            for claim_id in (first["return_request_id"], next_result["return_request_id"]):
                evidence = self.db.query(ReturnEvidence).filter_by(return_request_id=claim_id).first()
                delete_evidence(evidence.storage_key)

    def test_read_tools_close_their_database_sessions(self):
        closed = []

        class TrackingSession(self.Session.class_):
            def close(session):
                closed.append(True)
                super().close()

        tracking_factory = sessionmaker(
            bind=self.engine, class_=TrackingSession, expire_on_commit=False,
        )
        with patch.object(returns_tools, "SessionLocal", tracking_factory):
            result = self.tool("list_my_return_requests").invoke({})
        self.assertTrue(result["success"])
        self.assertEqual(len(closed), 1)

    def test_read_tools_do_not_flush_or_commit(self):
        writes = []

        class ReadOnlyTrackingSession(self.Session.class_):
            pass

        event.listen(ReadOnlyTrackingSession, "before_flush", lambda *args: writes.append("flush"))
        event.listen(ReadOnlyTrackingSession, "before_commit", lambda *args: writes.append("commit"))
        factory = sessionmaker(bind=self.engine, class_=ReadOnlyTrackingSession)
        with patch.object(returns_tools, "SessionLocal", factory):
            result = self.tool("list_my_return_requests").invoke({})
        self.assertTrue(result["success"])
        self.assertEqual(writes, [])

    def test_list_is_customer_scoped_and_includes_legacy_workflow_null(self):
        result = self.tool("list_my_return_requests").invoke({})
        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 1)
        summary = result["return_requests"][0]
        self.assertEqual(summary["return_request_id"], self.request.id)
        self.assertEqual(summary["order_number"], "ORD-CUSTOMER")
        self.assertEqual(summary["product_name"], "Notebook")
        self.assertEqual(summary["variant_name"], "A5")
        self.assertIsNone(summary["workflow_status"])
        self.assertNotEqual(summary["return_request_id"], self.other_request.id)

    def test_empty_customer_list_is_successful(self):
        result = self.tool("list_my_return_requests").invoke({})
        self.assertTrue(result["success"])
        self.db.query(ReturnRequest).filter(ReturnRequest.order_id == self.order.id).delete()
        self.db.commit()
        result = self.tool("list_my_return_requests").invoke({})
        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["return_requests"], [])

    def test_order_lookup_is_scoped_and_empty_order_is_distinguished(self):
        tool = self.tool("get_my_order_return_requests")
        own = tool.invoke({"order_number": "ORD-CUSTOMER"})
        self.assertTrue(own["success"])
        self.assertEqual(own["count"], 1)
        empty = tool.invoke({"order_number": "ORD-EMPTY"})
        self.assertTrue(empty["success"])
        self.assertEqual(empty["count"], 0)
        self.assertFalse(tool.invoke({"order_number": "ORD-OTHER"})["success"])
        self.assertFalse(tool.invoke({"order_number": "missing"})["success"])
        self.assertFalse(tool.invoke({"order_number": " "})["success"])

    def test_details_returns_complete_history_metadata_and_linked_refunds(self):
        returns = Department(name="Returns", email="returns@example.test")
        payments = Department(name="Payments & Refunds", email="payments@example.test")
        handoff = ReturnHandoff(
            return_request_id=self.request.id,
            source_department=returns, destination_department=payments,
            handoff_type="refund_processing", status="completed",
            idempotency_key="handoff-test", payload={"refund_timing": "immediate", "storage_key": "secret"},
            failure_reason=None,
        )
        second_handoff = ReturnHandoff(
            return_request_id=self.request.id,
            source_department=payments, destination_department=returns,
            handoff_type="refund_processing", status="in_progress",
            idempotency_key="handoff-test-2", payload={"pickup_handoff_id": 5},
        )
        self.db.add_all([handoff, second_handoff])
        self.db.flush()
        self.db.add_all([
            ReturnRequestEvent(
                return_request_id=self.request.id, event_type="claim_submitted",
                new_status="submitted", note="Submitted", event_data={"quantity": 1, "secret": "x"},
                created_at=datetime(2026, 1, 2),
            ),
            ReturnRequestEvent(
                return_request_id=self.request.id, event_type="refund_approved",
                previous_status="submitted", new_status="approved", note="Approved",
                event_data={"reason_code": "damaged"}, created_at=datetime(2026, 1, 3),
            ),
            ReturnInspection(
                return_request_id=self.request.id, handoff_id=handoff.id,
                inspection_type="physical_pickup", outcome="passed", notes="Box received",
            ),
            ReturnEvidence(
                return_request_id=self.request.id, storage_provider="local", storage_key="private/key",
                original_filename="photo.jpg", mime_type="image/jpeg", size_bytes=123,
                uploaded_by_id=self.customer.id, is_active=False,
            ),
            Refund(
                order_id=self.order.id, return_request_id=self.request.id, amount=Decimal("25.00"),
                currency="INR", reason="Partial return", refund_method="manual_bank",
                status="processing", idempotency_key="refund-test", failure_reason=None,
            ),
            Refund(
                order_id=self.order.id, return_request_id=self.request.id, amount=Decimal("25.00"),
                currency="INR", reason="Retry", refund_method="manual_bank",
                status="failed", idempotency_key="refund-test-2", failure_reason="Bank rejected",
            ),
            Refund(
                order_id=self.order.id, return_request_id=self.request.id, amount=Decimal("25.00"),
                currency="INR", reason="Successful retry", refund_method="manual_bank",
                status="processed", idempotency_key="refund-test-3", failure_reason=None,
            ),
            Refund(
                order_id=self.order.id, return_request_id=self.request.id, amount=Decimal("25.00"),
                currency="INR", reason="Awaiting processing", refund_method="manual_bank",
                status="pending", idempotency_key="refund-test-4", failure_reason=None,
            ),
        ])
        self.db.commit()
        result = self.tool("get_my_return_request_details").invoke({"return_request_id": self.request.id})
        self.assertTrue(result["success"])
        self.assertEqual(result["order"]["order_number"], "ORD-CUSTOMER")
        self.assertEqual(result["product"]["sku"], "NOTEBOOK-TEST")
        self.assertIsNone(result["request"]["workflow_status"])
        self.assertEqual([event["timestamp"] for event in result["audit_history"]], sorted(
            event["timestamp"] for event in result["audit_history"]
        ))
        self.assertEqual(result["audit_history"][1]["previous_status"], "submitted")
        self.assertEqual(result["audit_history"][1]["new_status"], "approved")
        self.assertNotIn("secret", result["audit_history"][0]["event_data"])
        self.assertEqual(result["department_handoffs"][0]["source_department_name"], "Returns")
        self.assertEqual(result["department_handoffs"][0]["destination_department_name"], "Payments & Refunds")
        self.assertEqual(len(result["department_handoffs"]), 2)
        self.assertEqual(result["department_handoffs"][0]["status"], "completed")
        self.assertNotIn("storage_key", result["department_handoffs"][0]["payload"])
        self.assertEqual(result["inspection_history"][0]["handoff_id"], handoff.id)
        self.assertFalse(result["evidence"][0]["active"])
        self.assertNotIn("storage_key", result["evidence"][0])
        self.assertEqual(
            {row["status"] for row in result["refund_history"]},
            {"pending", "processing", "failed", "processed"},
        )
        self.assertIn("Bank rejected", [row["failure_reason"] for row in result["refund_history"]])

    def test_details_hides_missing_and_other_customers_requests(self):
        tool = self.tool("get_my_return_request_details")
        for request_id in (999999, self.other_request.id, 0, True):
            result = tool.func(request_id)
            self.assertFalse(result["success"])
            self.assertNotIn("ORD-OTHER", str(result))

    def test_details_empty_optional_histories_and_absent_refund_are_explicit(self):
        result = self.tool("get_my_return_request_details").invoke({"return_request_id": self.request.id})
        self.assertTrue(result["success"])
        self.assertEqual(result["audit_history"], [])
        self.assertEqual(result["department_handoffs"], [])
        self.assertEqual(result["inspection_history"], [])
        self.assertEqual(result["evidence"], [])
        self.assertEqual(result["refund_history"], [])

    def test_eligibility_calls_shared_service_with_customer_order_and_item(self):
        self.request.status = "rejected"
        self.db.commit()
        count_before = self.db.query(ReturnRequest).count()
        result = self.tool("check_my_return_eligibility").invoke({
            "order_number": "ORD-CUSTOMER", "order_item_id": self.item.id,
        })
        self.assertTrue(result["success"])
        self.assertTrue(result["eligible"])
        self.assertEqual(result["reason_code"], "eligible")
        self.assertEqual(result["quantity_purchased"], 2)
        self.assertEqual(result["return_window_days"], 30)
        self.assertEqual(result["available_resolutions"], ["refund", "replacement"])
        self.assertFalse(self.tool("check_my_return_eligibility").invoke({
            "order_number": "ORD-OTHER", "order_item_id": self.other_item.id,
        })["success"])
        self.assertFalse(self.tool("check_my_return_eligibility").invoke({
            "order_number": "ORD-CUSTOMER", "order_item_id": self.other_item.id,
        })["success"])
        self.assertEqual(self.db.query(ReturnRequest).count(), count_before)

    def test_ineligible_result_preserves_the_shared_service_reason(self):
        result = self.tool("check_my_return_eligibility").invoke({
            "order_number": "ORD-CUSTOMER", "order_item_id": self.item.id,
        })
        self.assertTrue(result["success"])
        self.assertFalse(result["eligible"])
        self.assertEqual(result["reason_code"], "active_claim_exists")
        self.assertEqual(result["active_claim"]["id"], self.request.id)

    def test_completed_pickup_handoff_does_not_prove_a_refund(self):
        source = Department(name="Returns & Replacement", email="returns-replacement@example.test")
        destination = Department(name="Order & Delivery", email="delivery@example.test")
        self.db.add_all([source, destination])
        self.db.flush()
        pickup = ReturnHandoff(
            return_request_id=self.request.id,
            source_department_id=source.id, destination_department_id=destination.id,
            handoff_type="refund_pickup", status="completed",
            idempotency_key="completed-pickup-test", payload={},
        )
        self.db.add(pickup)
        self.db.commit()
        result = self.tool("get_my_return_request_details").invoke({"return_request_id": self.request.id})
        self.assertTrue(result["success"])
        self.assertEqual(result["department_handoffs"][0]["status"], "completed")
        self.assertEqual(result["refund_history"], [])

    def test_eligibility_rejects_invalid_arguments_without_writes(self):
        tool = self.tool("check_my_return_eligibility")
        before = self.db.scalar(select(ReturnRequest).where(ReturnRequest.order_id == self.order.id)).id
        for args in (
            {"order_number": " ", "order_item_id": self.item.id},
            {"order_number": "ORD-CUSTOMER", "order_item_id": True},
            {"order_number": "ORD-CUSTOMER", "order_item_id": self.item.id, "requested_quantity": 0},
            {"order_number": "ORD-CUSTOMER", "order_item_id": self.item.id, "resolution_type": "other"},
        ):
            self.assertFalse(tool.func(**args)["success"])
        self.assertEqual(self.db.scalar(select(ReturnRequest).where(ReturnRequest.order_id == self.order.id)).id, before)

    def test_database_errors_return_failure_not_empty_success(self):
        with patch.object(returns_tools, "SessionLocal", side_effect=RuntimeError("db unavailable")):
            result = self.tool("list_my_return_requests").invoke({})
        self.assertFalse(result["success"])
        self.assertNotIn("db unavailable", result["message"])


if __name__ == "__main__":
    unittest.main()
