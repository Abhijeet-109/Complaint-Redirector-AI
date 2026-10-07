"""Isolated API tests for handler departments, complaint privacy, and redirects."""

import os
import sys
import types
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "handler-support-tests-only-key-32-bytes"

# The API tests do not exercise ML prediction; avoid loading model artifacts.
predictor_stub = types.ModuleType("backend.predictor")
predictor_stub.predict_department = lambda complaint: ("Returns & Replacement", 0.9)
sys.modules.setdefault("backend.predictor", predictor_stub)

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.Database.connection import Base
from backend.Database.models import Complaint, Department, User
from backend.auth.dependencies import get_db
from backend.auth.security import hash_password


class HandlerSupportAPITests(unittest.TestCase):
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
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
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
            self.department_a = Department(name="Returns", email="returns@example.com")
            self.department_b = Department(name="Payments", email="payments@example.com")
            db.add_all([self.department_a, self.department_b])
            db.flush()

            self.handler = User(
                name="Handler One", email="handler@example.com",
                password=self.password_hash, role="department_handler",
                department_id=self.department_a.id,
            )
            self.customer = User(
                name="Rahul Sharma", email="rahul@example.com",
                password=self.password_hash, role="user",
            )
            self.ordinary_user = User(
                name="Ordinary User", email="ordinary@example.com",
                password=self.password_hash, role="user",
            )
            self.admin = User(
                name="Admin User", email="admin@example.com",
                password=self.password_hash, role="admin",
            )
            self.super_admin = User(
                name="Super Admin", email="super@example.com",
                password=self.password_hash, role="super_admin",
            )
            db.add_all([self.handler, self.customer, self.ordinary_user, self.admin, self.super_admin])
            db.flush()

            self.assigned_complaint = Complaint(
                user_id=self.customer.id,
                predicted_department_id=self.department_a.id,
                department_id=self.department_a.id,
                handler_id=self.handler.id,
                complaint_text="The item arrived damaged.",
                confidence="0.9421",
                status="followed_up",
            )
            self.other_department_complaint = Complaint(
                user_id=self.customer.id,
                predicted_department_id=self.department_b.id,
                department_id=self.department_b.id,
                complaint_text="A payment is missing.",
                confidence="0.8",
                status="pending",
            )
            db.add_all([self.assigned_complaint, self.other_department_complaint])
            db.commit()
            self.complaint_id = self.assigned_complaint.id
            self.other_complaint_id = self.other_department_complaint.id
            self.customer_id = self.customer.id
            self.department_a_id = self.department_a.id
            self.department_b_id = self.department_b.id
        finally:
            db.close()

    def _login(self, email):
        response = self.client.post(
            "/api/auth/login",
            json={"email": email, "password": "test-password"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def _headers(self, email):
        return {"Authorization": f"Bearer {self._login(email)}"}

    def test_handler_login_and_department_list(self):
        token = self._login("handler@example.com")
        response = self.client.get(
            "/api/v1/departments",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 2)
        self.assertEqual(set(response.json()[0]), {"id", "name", "email"})

    def test_handler_complaints_include_only_assigned_customer_details(self):
        response = self.client.get(
            "/api/v1/handler/complaints",
            headers=self._headers("handler@example.com"),
        )
        self.assertEqual(response.status_code, 200, response.text)
        rows = response.json()
        self.assertEqual([row["id"] for row in rows], [self.complaint_id])
        self.assertEqual(rows[0]["user_id"], self.customer_id)
        self.assertEqual(rows[0]["user_name"], "Rahul Sharma")
        self.assertEqual(rows[0]["user_email"], "rahul@example.com")
        self.assertNotIn("password", rows[0])

    def test_redirect_updates_department_and_clears_handler(self):
        response = self.client.patch(
            f"/api/v1/handler/complaints/{self.complaint_id}/redirect",
            headers=self._headers("handler@example.com"),
            json={"department_id": self.department_b_id},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["department_id"], self.department_b_id)
        self.assertEqual(response.json()["current_department"], "Payments")
        self.assertEqual(response.json()["status"], "pending")
        self.assertIsNone(response.json()["handler_id"])
        self.assertNotIn("user_email", response.json())

    def test_handler_cannot_redirect_complaint_from_other_department(self):
        response = self.client.patch(
            f"/api/v1/handler/complaints/{self.other_complaint_id}/redirect",
            headers=self._headers("handler@example.com"),
            json={"department_id": self.department_a_id},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Complaint not found")

    def test_ordinary_user_cannot_list_departments(self):
        response = self.client.get(
            "/api/v1/departments",
            headers=self._headers("ordinary@example.com"),
        )
        self.assertEqual(response.status_code, 403)

    def test_ordinary_user_cannot_list_handler_complaints(self):
        response = self.client.get(
            "/api/v1/handler/complaints",
            headers=self._headers("ordinary@example.com"),
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_list_departments(self):
        response = self.client.get(
            "/api/v1/departments",
            headers=self._headers("admin@example.com"),
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_super_admin_can_list_departments(self):
        response = self.client.get(
            "/api/v1/departments",
            headers=self._headers("super@example.com"),
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_customer_details_are_not_added_to_user_or_admin_lists(self):
        user_complaints = self.client.get(
            "/api/v1/complaints/mine",
            headers=self._headers("rahul@example.com"),
        )
        admin_complaints = self.client.get(
            "/api/v1/admin/complaints",
            headers=self._headers("admin@example.com"),
        )
        self.assertEqual(user_complaints.status_code, 200, user_complaints.text)
        self.assertEqual(admin_complaints.status_code, 200, admin_complaints.text)
        for response in (user_complaints, admin_complaints):
            for row in response.json():
                self.assertNotIn("user_name", row)
                self.assertNotIn("user_email", row)


if __name__ == "__main__":
    unittest.main()
