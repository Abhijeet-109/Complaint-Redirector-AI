"""Isolated API regression tests for customer wishlist ownership and persistence."""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import Cart, Inventory, Product, User, WishlistItem
from backend.Database.seed_commerce import seed_catalog
from backend.api.routes.account import router as account_router
from backend.auth.dependencies import get_current_user, get_db


class WishlistApiTests(unittest.TestCase):
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
        self.session = Session(self.engine)
        self.customer = User(name="Wishlist Customer", email="wishlist@example.test", password="hash", role="user")
        self.other_customer = User(name="Other Customer", email="other-wishlist@example.test", password="hash", role="user")
        self.session.add_all((self.customer, self.other_customer))
        self.session.flush()
        seed_catalog(self.session)
        self.product = self.session.scalar(select(Product).where(Product.is_active.is_(True)))
        self.session.commit()

        self.actor = self.customer
        self.app = FastAPI()
        self.app.include_router(account_router)

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

    def test_wishlist_persists_isolates_users_and_does_not_touch_cart_or_inventory(self):
        initial_cart_count = self.session.scalar(select(func.count()).select_from(Cart))
        initial_inventory = self.session.execute(
            select(Inventory.available_stock, Inventory.reserved_stock).order_by(Inventory.id)
        ).all()

        self.assertEqual(self.client.get("/api/account/wishlist").json(), [])
        added = self.client.post(f"/api/account/wishlist/{self.product.id}")
        self.assertEqual(added.status_code, 201)
        self.assertEqual(added.json(), {"product_id": self.product.id, "saved": True})
        self.assertEqual(self.client.post(f"/api/account/wishlist/{self.product.id}").status_code, 201)
        self.assertEqual(
            self.session.scalar(select(func.count()).select_from(WishlistItem).where(WishlistItem.user_id == self.customer.id)),
            1,
        )

        saved = self.client.get("/api/account/wishlist").json()
        self.assertEqual([row["id"] for row in saved], [self.product.id])
        self.assertTrue(saved[0]["variants"])

        self.actor = self.other_customer
        self.assertEqual(self.client.get("/api/account/wishlist").json(), [])
        self.assertEqual(self.client.delete(f"/api/account/wishlist/{self.product.id}").status_code, 204)
        self.assertEqual(
            self.session.scalar(select(func.count()).select_from(WishlistItem).where(WishlistItem.user_id == self.customer.id)),
            1,
        )

        self.actor = self.customer
        self.assertEqual(self.client.delete(f"/api/account/wishlist/{self.product.id}").status_code, 204)
        self.assertEqual(self.client.get("/api/account/wishlist").json(), [])
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Cart)), initial_cart_count)
        self.assertEqual(
            self.session.execute(
                select(Inventory.available_stock, Inventory.reserved_stock).order_by(Inventory.id)
            ).all(),
            initial_inventory,
        )

    def test_wishlist_rejects_missing_and_inactive_products(self):
        self.assertEqual(self.client.post("/api/account/wishlist/999999").status_code, 404)
        self.product.is_active = False
        self.session.commit()
        self.assertEqual(self.client.post(f"/api/account/wishlist/{self.product.id}").status_code, 404)


if __name__ == "__main__":
    unittest.main()
