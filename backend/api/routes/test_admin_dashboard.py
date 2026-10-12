"""Unit tests for Admin and Super Admin dashboard endpoints and RBAC rules."""

import os
import sys
import types
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "admin-dashboard-tests-key-32-chars-long"

# Prevent loading real ML predictor
predictor_stub = types.ModuleType("backend.predictor")
predictor_stub.predict_department = lambda complaint: ("Customer Support", 0.95)
sys.modules["backend.predictor"] = predictor_stub

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.Database.connection import Base
from backend.Database.models import Department, User, Complaint, ComplaintRedirection
from backend.auth.dependencies import get_db
from backend.auth.security import create_access_token, hash_password


class AdminDashboardRBACUnitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = hash_password("SecurePassword123")

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

        self._seed()

        def override_get_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def _seed(self):
        db = self.Session()
        # Seed departments
        d1 = Department(name="Customer Support", email="support@flatkart.com")
        d2 = Department(name="Technical Support", email="tech@flatkart.com")
        db.add_all([d1, d2])
        db.commit()

        # Seed users with different roles
        u_normal = User(name="Normal User", email="user@flatkart.com", password=self.password_hash, role="user")
        u_handler = User(name="Dept Handler", email="handler@flatkart.com", password=self.password_hash, role="department_handler", department_id=d1.id)
        u_admin = User(name="Admin User", email="admin@flatkart.com", password=self.password_hash, role="admin")
        u_super = User(name="Super Admin", email="super@flatkart.com", password=self.password_hash, role="super_admin")
        db.add_all([u_normal, u_handler, u_admin, u_super])
        db.commit()

        # Seed a complaint
        c = Complaint(
            user_id=u_normal.id,
            predicted_department_id=d1.id,
            department_id=d1.id,
            complaint_text="My order arrived with missing parts.",
            confidence="0.95",
            status="pending",
        )
        db.add(c)
        db.commit()

        # Seed redirection
        r = ComplaintRedirection(
            complaint_id=c.id,
            from_department_id=d1.id,
            to_department_id=d2.id,
            redirected_by_user_id=u_handler.id,
            reason="further_processing",
        )
        db.add(r)
        db.commit()

        self.d1_id = d1.id
        self.d2_id = d2.id
        self.complaint_id = c.id
        self.user_token = create_access_token(u_normal.id, "user")
        self.handler_token = create_access_token(u_handler.id, "department_handler")
        self.admin_token = create_access_token(u_admin.id, "admin")
        self.super_token = create_access_token(u_super.id, "super_admin")
        db.close()

    def test_unauthenticated_cannot_access_admin_users(self):
        res = self.client.get("/api/admin/users")
        self.assertEqual(res.status_code, 401)

    def test_normal_user_and_handler_forbidden_from_admin_users(self):
        res = self.client.get("/api/admin/users", headers={"Authorization": f"Bearer {self.user_token}"})
        self.assertEqual(res.status_code, 403)

        res2 = self.client.get("/api/admin/users", headers={"Authorization": f"Bearer {self.handler_token}"})
        self.assertEqual(res2.status_code, 403)

    def test_admin_can_list_users_excluding_admins(self):
        res = self.client.get("/api/admin/users", headers={"Authorization": f"Bearer {self.admin_token}"})
        self.assertEqual(res.status_code, 200)
        users = res.json()
        roles = [u["role"] for u in users]
        self.assertNotIn("admin", roles)
        self.assertNotIn("super_admin", roles)

    def test_super_admin_can_list_all_users_including_admins(self):
        res = self.client.get("/api/admin/users", headers={"Authorization": f"Bearer {self.super_token}"})
        self.assertEqual(res.status_code, 200)
        users = res.json()
        roles = [u["role"] for u in users]
        self.assertIn("admin", roles)
        self.assertIn("super_admin", roles)

    def test_admin_cannot_create_admin_account(self):
        res = self.client.post(
            "/api/admin/users",
            json={"name": "New Admin", "email": "newadmin@flatkart.com", "password": "Password123", "role": "admin"},
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(res.status_code, 403)

    def test_super_admin_can_create_admin_account(self):
        res = self.client.post(
            "/api/admin/users",
            json={"name": "Created Admin", "email": "createdadmin@flatkart.com", "password": "Password123", "role": "admin"},
            headers={"Authorization": f"Bearer {self.super_token}"},
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["role"], "admin")

    def test_admin_and_super_admin_can_access_redirection_analytics(self):
        res_admin = self.client.get("/api/v1/admin/redirection-kpis", headers={"Authorization": f"Bearer {self.admin_token}"})
        self.assertEqual(res_admin.status_code, 200)
        self.assertIn("summary", res_admin.json())
        self.assertIn("by_department_route", res_admin.json())

        res_super = self.client.get("/api/v1/admin/redirection-kpis", headers={"Authorization": f"Bearer {self.super_token}"})
        self.assertEqual(res_super.status_code, 200)

    def test_department_safe_deletion_blocks_if_referenced(self):
        # Cannot delete department referenced by staff and complaint
        res = self.client.delete(f"/api/admin/departments/{self.d1_id}", headers={"Authorization": f"Bearer {self.admin_token}"})
        self.assertEqual(res.status_code, 409)

    def test_admin_complaints_redirection_history(self):
        res = self.client.get(
            f"/api/v1/handler/complaints/{self.complaint_id}/redirections",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(res.status_code, 200)
        history = res.json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["reason"], "further_processing")


if __name__ == "__main__":
    unittest.main()
