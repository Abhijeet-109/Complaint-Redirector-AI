import hashlib
import hmac
import json
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import (
    Cart,
    CartItem,
    CommerceOrder,
    Inventory,
    PaymentAttempt,
    Product,
    ProductVariant,
    User,
)
from backend.Database.seed_commerce import seed_catalog
from backend.api.routes.commerce import router as commerce_router
from backend.auth.dependencies import get_current_user, get_db


class CommerceApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(
            self.engine,
            tables=[table for table in Base.metadata.sorted_tables if table.name != "knowledge_chunks"],
        )
        self.session = Session(self.engine)
        self.user = User(name="Test Customer", email="checkout@example.com", password="hash", role="user")
        self.other_user = User(name="Other Customer", email="other-checkout@example.com", password="hash", role="user")
        self.session.add_all([self.user, self.other_user])
        self.session.flush()
        seed_catalog(self.session)
        for product in self.session.scalars(select(Product)).all():
            product.payment_methods = ["cod", "upi", "netbanking"]
        self.session.commit()
        self.actor = self.user
        self.app = FastAPI()
        self.app.include_router(commerce_router)

        def database_session():
            with Session(self.engine) as request_session:
                yield request_session

        self.app.dependency_overrides[get_db] = database_session
        self.app.dependency_overrides[get_current_user] = lambda: self.actor
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def variant(self, sku="FK-DEMO-1"):
        return self.session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))

    def product(self, variant=None):
        variant = variant or self.variant()
        return variant.product

    def add(self, variant=None, quantity=1):
        variant = variant or self.variant()
        return self.client.post("/api/cart/items", json={
            "product_id": variant.product_id,
            "variant_id": variant.id,
            "quantity": quantity,
        })

    def address(self):
        return {
            "recipient_name": "Test Customer",
            "mobile_number": "9876543210",
            "address_line1": "12 Example Road",
            "address_line2": "Flat 4",
            "locality": "Central Market",
            "city": "Pune",
            "state": "Maharashtra",
            "pin_code": "411001",
        }

    def test_cart_adds_variants_updates_removes_and_isolates_customers(self):
        first = self.variant()
        product = first.product
        second = ProductVariant(
            product_id=product.id,
            sku="FK-DEMO-1-ALT",
            name="Large",
            price=first.price,
            mrp=first.mrp,
            is_available=True,
        )
        self.session.add(second)
        self.session.flush()
        self.session.add(Inventory(variant_id=second.id, available_stock=8, total_stock=8, reserved_stock=0, stock_status="in_stock"))
        self.session.commit()

        self.assertEqual(self.client.get("/api/cart").json()["items"], [])
        one = self.add(first).json()
        again = self.add(first).json()
        self.assertEqual(again["item_count"], 2)
        self.assertEqual(len(again["items"]), 1)
        separate = self.add(second).json()
        self.assertEqual(len(separate["items"]), 2)
        updated = self.client.put(f"/api/cart/items/{second.id}", json={"quantity": 3}).json()
        self.assertEqual(next(line["quantity"] for line in updated["items"] if line["variant_id"] == second.id), 3)
        self.assertEqual(self.client.delete(f"/api/cart/items/{first.id}").json()["item_count"], 3)

        self.actor = self.other_user
        isolated = self.client.get("/api/cart").json()
        self.assertEqual(isolated["items"], [])
        self.assertEqual(one["items"][0]["quantity"], 1)

    def test_cart_rejects_invalid_quantity_wrong_product_and_insufficient_stock(self):
        variant = self.variant()
        self.assertEqual(self.client.post("/api/cart/items", json={"product_id": variant.product_id, "variant_id": variant.id, "quantity": 0}).status_code, 422)
        self.assertEqual(self.client.post("/api/cart/items", json={"product_id": variant.product_id + 1, "variant_id": variant.id, "quantity": 1}).status_code, 404)
        self.assertEqual(self.add(variant, 999).status_code, 409)
        self.assertEqual(self.client.put(f"/api/cart/items/{variant.id}", json={"quantity": 2}).status_code, 404)

    def test_cod_places_one_order_clears_cart_and_allocates_inventory_once(self):
        variant = self.variant()
        self.add(variant, 2)
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        original_stock = inventory.total_stock
        headers = {"Idempotency-Key": "cod-checkout-001"}
        payload = {"address": self.address(), "total_amount": "0.01", "unit_price": "0.01"}
        result = self.client.post("/api/checkout/cod", json=payload, headers=headers)
        self.assertEqual(result.status_code, 200, result.text)
        order = result.json()["order"]
        self.assertEqual(order["payment_method"], "cod")
        self.assertEqual(order["payment_status"], "pending")
        self.assertEqual(order["items"][0]["quantity"], 2)
        self.assertEqual(order["delivery_address"]["pin_code"], "411001")
        self.session.refresh(inventory)
        self.assertEqual(inventory.total_stock, original_stock)
        self.assertEqual(inventory.reserved_stock, 2)
        self.assertEqual(self.client.get("/api/cart").json()["items"], [])
        repeated = self.client.post("/api/checkout/cod", json=payload, headers=headers).json()
        self.assertEqual(repeated["order"]["id"], order["id"])
        self.assertEqual(self.session.scalar(select(CommerceOrder).where(CommerceOrder.user_id == self.user.id)).order_number, order["order_number"])
        self.session.refresh(inventory)
        self.assertEqual(inventory.total_stock, original_stock)
        self.assertEqual(inventory.reserved_stock, 2)

    def test_cod_respects_each_products_configuration_and_address_validation(self):
        variant = self.variant()
        variant.product.payment_methods = ["upi"]
        self.session.commit()
        self.add(variant)
        denied = self.client.post("/api/checkout/cod", json={"address": self.address()}, headers={"Idempotency-Key": "cod-not-allowed-001"})
        self.assertEqual(denied.status_code, 409)
        invalid = self.client.post("/api/checkout/cod", json={"address": {**self.address(), "pin_code": "123"}}, headers={"Idempotency-Key": "bad-address-001"})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(CommerceOrder)), 0)

    def test_empty_checkout_rejects_and_price_is_read_again_when_order_is_created(self):
        headers = {"Idempotency-Key": "empty-checkout-001"}
        empty = self.client.post("/api/checkout/cod", json={"address": self.address()}, headers=headers)
        self.assertEqual(empty.status_code, 409)
        variant = self.variant()
        self.add(variant)
        variant.price = 321.45
        self.session.commit()
        placed = self.client.post(
            "/api/checkout/cod",
            json={"address": self.address(), "total_amount": "0.01"},
            headers={"Idempotency-Key": "fresh-price-checkout-001"},
        )
        self.assertEqual(placed.status_code, 200, placed.text)
        self.assertEqual(placed.json()["order"]["total_amount"], "321.45")
        self.assertEqual(placed.json()["order"]["items"][0]["unit_price"], "321.45")

    def test_razorpay_order_creation_signature_provider_check_and_duplicate_verify(self):
        variant = self.variant()
        self.add(variant, 2)
        secret = "test_key_secret"
        key_id = "rzp_test_public"
        with patch.dict(os.environ, {"RAZORPAY_MODE": "test", "RAZORPAY_KEY_ID": key_id, "RAZORPAY_KEY_SECRET": secret}):
            with patch("backend.api.routes.commerce._razorpay_request") as provider:
                provider.side_effect = [
                    {"id": "order_test_123", "amount": int(variant.price * 200), "currency": "INR"},
                    {"id": "pay_test_123", "order_id": "order_test_123", "amount": int(variant.price * 200), "currency": "INR", "status": "captured"},
                ]
                checkout = self.client.post(
                    "/api/checkout/razorpay",
                    json={"address": self.address()},
                    headers={"Idempotency-Key": "razorpay-checkout-001"},
                )
                self.assertEqual(checkout.status_code, 200, checkout.text)
                details = checkout.json()
                self.assertEqual(details["amount"], int(variant.price * 200))
                self.assertEqual(details["key_id"], key_id)
                signature = hmac.new(secret.encode(), b"order_test_123|pay_test_123", hashlib.sha256).hexdigest()
                verified = self.client.post("/api/payments/verify", json={
                    "razorpay_order_id": "order_test_123",
                    "razorpay_payment_id": "pay_test_123",
                    "razorpay_signature": signature,
                })
                self.assertEqual(verified.status_code, 200, verified.text)
                self.assertTrue(verified.json()["success"])
                repeated = self.client.post("/api/payments/verify", json={
                    "razorpay_order_id": "order_test_123",
                    "razorpay_payment_id": "pay_test_123",
                    "razorpay_signature": signature,
                })
                self.assertTrue(repeated.json()["duplicate"])
                self.assertEqual(provider.call_count, 2)
        attempt = self.session.scalar(select(PaymentAttempt).where(PaymentAttempt.provider_order_id == "order_test_123"))
        order = self.session.get(CommerceOrder, attempt.order_id)
        self.assertEqual(order.payment_status, "captured")
        self.assertEqual(order.status, "placed")
        self.assertEqual(attempt.provider_payment_id, "pay_test_123")
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        self.session.refresh(inventory)
        self.assertEqual(inventory.total_stock, inventory.available_stock + inventory.reserved_stock)
        self.assertEqual(inventory.reserved_stock, 2)

    def test_invalid_signature_and_webhook_replay(self):
        variant = self.variant()
        self.add(variant)
        secret = "test_key_secret"
        with patch.dict(os.environ, {"RAZORPAY_MODE": "test", "RAZORPAY_KEY_ID": "rzp_test_public", "RAZORPAY_KEY_SECRET": secret}):
            with patch("backend.api.routes.commerce._razorpay_request", return_value={"id": "order_webhook_1", "amount": int(variant.price * 100), "currency": "INR"}):
                checkout = self.client.post("/api/checkout/razorpay", json={"address": self.address()}, headers={"Idempotency-Key": "webhook-checkout-001"})
            self.assertEqual(checkout.status_code, 200, checkout.text)
            invalid = self.client.post("/api/payments/verify", json={"razorpay_order_id": "order_webhook_1", "razorpay_payment_id": "pay_webhook_1", "razorpay_signature": "0" * 64})
            self.assertEqual(invalid.status_code, 400)

        raw = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
            "id": "pay_webhook_1", "order_id": "order_webhook_1", "amount": int(variant.price * 100), "currency": "INR", "status": "captured",
        }}}}, separators=(",", ":")).encode()
        webhook_secret = "webhook_test_secret"
        signature = hmac.new(webhook_secret.encode(), raw, hashlib.sha256).hexdigest()
        with patch.dict(os.environ, {
            "RAZORPAY_MODE": "test",
            "RAZORPAY_KEY_ID": "rzp_test_public",
            "RAZORPAY_KEY_SECRET": secret,
            "RAZORPAY_WEBHOOK_SECRET": webhook_secret,
        }):
            first = self.client.post("/api/payments/razorpay/webhook", content=raw, headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": "evt_test_1"})
            duplicate = self.client.post("/api/payments/razorpay/webhook", content=raw, headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": "evt_test_1"})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(duplicate.json()["status"], "duplicate")

    def test_payment_failed_webhook_releases_reserved_stock_once(self):
        variant = self.variant()
        self.add(variant, 2)
        original = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        self.session.refresh(original)
        original_stock = original.total_stock
        secret = "test_key_secret"
        webhook_secret = "webhook_test_secret"
        with patch.dict(os.environ, {"RAZORPAY_MODE": "test", "RAZORPAY_KEY_ID": "rzp_test_public", "RAZORPAY_KEY_SECRET": secret}):
            with patch("backend.api.routes.commerce._razorpay_request", return_value={"id": "order_failed_1", "amount": int(variant.price * 200), "currency": "INR"}):
                checkout = self.client.post("/api/checkout/razorpay", json={"address": self.address()}, headers={"Idempotency-Key": "failed-payment-checkout-001"})
        self.assertEqual(checkout.status_code, 200, checkout.text)
        self.session.refresh(original)
        self.assertEqual(original.reserved_stock, 2)
        raw = json.dumps({"event": "payment.failed", "payload": {"payment": {"entity": {
            "id": "pay_failed_1", "order_id": "order_failed_1", "amount": int(variant.price * 200),
            "currency": "INR", "status": "failed", "error_description": "Declined",
        }}}}, separators=(",", ":")).encode()
        signature = hmac.new(webhook_secret.encode(), raw, hashlib.sha256).hexdigest()
        headers = {"Content-Type": "application/json", "X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": "evt_failed_1"}
        with patch.dict(os.environ, {
            "RAZORPAY_MODE": "test", "RAZORPAY_KEY_ID": "rzp_test_public", "RAZORPAY_KEY_SECRET": secret,
            "RAZORPAY_WEBHOOK_SECRET": webhook_secret,
        }):
            self.assertEqual(self.client.post("/api/payments/razorpay/webhook", content=raw, headers=headers).status_code, 200)
            self.assertEqual(self.client.post("/api/payments/razorpay/webhook", content=raw, headers=headers).json()["status"], "duplicate")
        self.session.refresh(original)
        self.assertEqual(original.total_stock, original_stock)
        self.assertEqual(original.available_stock + original.reserved_stock, original.total_stock)
        self.assertEqual(original.reserved_stock, 0)

    def test_cancelled_attempt_releases_stock_and_reuses_order_for_unique_retry(self):
        variant = self.variant()
        self.add(variant)
        amount = int(variant.price * 100)
        secret = "test_key_secret"
        with patch.dict(os.environ, {"RAZORPAY_MODE": "test", "RAZORPAY_KEY_ID": "rzp_test_public", "RAZORPAY_KEY_SECRET": secret}):
            with patch("backend.api.routes.commerce._razorpay_request") as provider:
                provider.side_effect = [
                    {"id": "order_retry_1", "amount": amount, "currency": "INR"},
                    {"id": "order_retry_1", "amount": amount, "currency": "INR", "status": "created", "attempts": 0},
                    {"items": []},
                    {"id": "order_retry_2", "amount": amount, "currency": "INR"},
                ]
                first = self.client.post("/api/checkout/razorpay", json={"address": self.address()}, headers={"Idempotency-Key": "retry-checkout-first-001"})
                self.assertEqual(first.status_code, 200, first.text)
                cancelled = self.client.post("/api/payments/cancel", json={"attempt_id": first.json()["attempt_id"]})
                self.assertEqual(cancelled.json()["status"], "cancelled")
                second = self.client.post("/api/checkout/razorpay", json={"address": self.address()}, headers={"Idempotency-Key": "retry-checkout-second-001"})
                self.assertEqual(second.status_code, 200, second.text)
                self.assertEqual(first.json()["order_id"], second.json()["order_id"])
                first_receipt = provider.call_args_list[0].kwargs["payload"]["receipt"]
                second_receipt = provider.call_args_list[3].kwargs["payload"]["receipt"]
                self.assertNotEqual(first_receipt, second_receipt)
                self.assertEqual(second.json()["razorpay_order_id"], "order_retry_2")
        self.assertEqual(self.session.scalar(select(func.count()).select_from(CommerceOrder)), 1)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(PaymentAttempt)), 2)
        inventory = self.session.scalar(select(Inventory).where(Inventory.variant_id == variant.id))
        self.session.refresh(inventory)
        self.assertEqual(inventory.reserved_stock, 1)
        self.assertEqual(inventory.available_stock + inventory.reserved_stock, inventory.total_stock)


if __name__ == "__main__":
    unittest.main()
