"""Tests for Admin and Super Admin redirection analytics."""

import os
import sys
import types
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "redirection-kpi-tests-only-key-32"

# Prevent the tests from loading the real ML predictor.
predictor_stub = types.ModuleType("backend.predictor")
predictor_stub.predict_department = lambda complaint: (
    "Returns",
    0.9,
)
sys.modules["backend.predictor"] = predictor_stub

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.Database.connection import Base
from backend.Database.models import (
    Complaint,
    ComplaintRedirection,
    Department,
    User,
)
from backend.auth.dependencies import get_db
from backend.auth.security import hash_password


class RedirectionAnalyticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = hash_password("test-password")

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        Base.metadata.create_all(self.engine)

        self.Session = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
        )

        self._seed_data()

        def override_get_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _seed_data(self):
        db = self.Session()

        try:
            returns = Department(
                name="Returns",
                email="returns@example.com",
            )
            payments = Department(
                name="Payments",
                email="payments@example.com",
            )
            support = Department(
                name="Support",
                email="support@example.com",
            )

            db.add_all([returns, payments, support])
            db.flush()

            customer_one = User(
                name="Customer One",
                email="customer1@example.com",
                password=self.password_hash,
                role="user",
            )
            customer_two = User(
                name="Customer Two",
                email="customer2@example.com",
                password=self.password_hash,
                role="user",
            )
            admin = User(
                name="Admin User",
                email="admin@example.com",
                password=self.password_hash,
                role="admin",
            )
            super_admin = User(
                name="Super Admin",
                email="super@example.com",
                password=self.password_hash,
                role="super_admin",
            )
            handler = User(
                name="Department Handler",
                email="handler@example.com",
                password=self.password_hash,
                role="department_handler",
                department_id=returns.id,
            )

            db.add_all([
                customer_one,
                customer_two,
                admin,
                super_admin,
                handler,
            ])
            db.flush()

            complaint_one = Complaint(
                user_id=customer_one.id,
                predicted_department_id=returns.id,
                department_id=support.id,
                complaint_text="First test complaint",
                confidence="0.9",
                status="pending",
            )
            complaint_two = Complaint(
                user_id=customer_two.id,
                predicted_department_id=returns.id,
                department_id=payments.id,
                complaint_text="Second test complaint",
                confidence="0.8",
                status="pending",
            )

            db.add_all([complaint_one, complaint_two])
            db.flush()

            # One complaint has two transfers; another has one.
            db.add_all([
                ComplaintRedirection(
                    complaint_id=complaint_one.id,
                    from_department_id=returns.id,
                    to_department_id=payments.id,
                    redirected_by_user_id=handler.id,
                    reason="model_fault",
                ),
                ComplaintRedirection(
                    complaint_id=complaint_one.id,
                    from_department_id=payments.id,
                    to_department_id=support.id,
                    redirected_by_user_id=handler.id,
                    reason="further_processing",
                ),
                ComplaintRedirection(
                    complaint_id=complaint_two.id,
                    from_department_id=returns.id,
                    to_department_id=payments.id,
                    redirected_by_user_id=handler.id,
                    reason="model_fault",
                ),
            ])

            db.commit()

        finally:
            db.close()

    def _headers(self, email):
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": "test-password",
            },
        )

        self.assertEqual(response.status_code, 200, response.text)

        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_admin_can_access_kpis(self):
        response = self.client.get(
            "/api/v1/admin/redirection-kpis",
            headers=self._headers("admin@example.com"),
        )

        self.assertEqual(response.status_code, 200, response.text)

    def test_super_admin_can_access_kpis(self):
        response = self.client.get(
            "/api/v1/admin/redirection-kpis",
            headers=self._headers("super@example.com"),
        )

        self.assertEqual(response.status_code, 200, response.text)

    def test_kpi_counts_and_department_routes(self):
        response = self.client.get(
            "/api/v1/admin/redirection-kpis",
            headers=self._headers("admin@example.com"),
        )

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()

        summary = data["summary"]

        self.assertEqual(summary["total_complaints_forwarded"], 2)
        self.assertEqual(summary["total_transfer_events"], 3)
        self.assertEqual(summary["model_fault_transfers"], 2)
        self.assertEqual(summary["further_processing_transfers"], 1)

        routes = {
            (
                row["from_department"],
                row["to_department"],
            ): row
            for row in data["by_department_route"]
        }

        returns_to_payments = routes[("Returns", "Payments")]
        self.assertEqual(
            returns_to_payments["unique_complaints_forwarded"],
            2,
        )
        self.assertEqual(
            returns_to_payments["total_transfer_events"],
            2,
        )
        self.assertEqual(
            returns_to_payments["model_fault_transfers"],
            2,
        )
        self.assertEqual(
            returns_to_payments["further_processing_transfers"],
            0,
        )

        payments_to_support = routes[("Payments", "Support")]
        self.assertEqual(
            payments_to_support["unique_complaints_forwarded"],
            1,
        )
        self.assertEqual(
            payments_to_support["total_transfer_events"],
            1,
        )
        self.assertEqual(
            payments_to_support["model_fault_transfers"],
            0,
        )
        self.assertEqual(
            payments_to_support["further_processing_transfers"],
            1,
        )

    def test_ordinary_user_cannot_access_kpis(self):
        response = self.client.get(
            "/api/v1/admin/redirection-kpis",
            headers=self._headers("customer1@example.com"),
        )

        self.assertEqual(response.status_code, 403)

    def test_department_handler_cannot_access_kpis(self):
        response = self.client.get(
            "/api/v1/admin/redirection-kpis",
            headers=self._headers("handler@example.com"),
        )

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()