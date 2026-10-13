"""Isolated API and persistence tests for login lockout behavior."""

import os
import unittest
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["LOGIN_LOCKOUT_ENABLED"] = "true"
os.environ["LOGIN_LOCKOUT_HMAC_KEY"] = "test-only-lockout-hmac-key-32-bytes"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.Database.connection import Base
from backend.Database.models import User
from backend.api.routes.auth import router as auth_router
from backend.auth.dependencies import get_db
from backend.auth.security import hash_password
from backend.login_lockout import prepare_login, record_failed_login


class LoginLockoutTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.session_factory() as db:
            db.add(User(
                name="Test User",
                email="customer@example.com",
                password=hash_password("Correct-Horse-Battery-1"),
                role="user",
            ))
            db.commit()

        self.app = FastAPI()
        self.app.include_router(auth_router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _login(self, email="customer@example.com", password="wrong-password"):
        return self.client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )

    def test_fifth_failure_locks_correct_password_for_24_hours(self):
        for _ in range(5):
            self.assertEqual(self._login().status_code, 401)

        blocked = self._login(password="Correct-Horse-Battery-1")
        self.assertEqual(blocked.status_code, 401)
        self.assertEqual(blocked.json()["detail"], "Invalid email or password")
        self.assertGreater(int(blocked.headers["retry-after"]), 0)

    def test_email_case_variants_share_the_same_lockout(self):
        for email in (
            "Customer@example.com",
            "customer@EXAMPLE.COM",
            "CUSTOMER@example.com",
            "customer@example.com",
        ):
            self.assertEqual(self._login(email=email).status_code, 401)

        self.assertEqual(self._login(email="CUSTOMER@EXAMPLE.COM").status_code, 401)
        blocked = self._login(
            email="Customer@example.com",
            password="Correct-Horse-Battery-1",
        )
        self.assertEqual(blocked.status_code, 401)
        self.assertIn("retry-after", blocked.headers)

    def test_existing_and_nonexistent_accounts_have_the_same_error(self):
        existing = self._login(password="wrong-password")
        missing = self._login(
            email="nobody@example.com",
            password="wrong-password",
        )
        self.assertEqual(existing.status_code, missing.status_code)
        self.assertEqual(existing.json(), missing.json())

    def test_successful_login_resets_consecutive_email_failures(self):
        for _ in range(4):
            self.assertEqual(self._login().status_code, 401)
        success = self._login(password="Correct-Horse-Battery-1")
        self.assertEqual(success.status_code, 200)

        for _ in range(4):
            self.assertEqual(self._login().status_code, 401)
        success = self._login(password="Correct-Horse-Battery-1")
        self.assertEqual(success.status_code, 200)

    def test_lockout_expires_after_24_hours(self):
        fixed_now = datetime(2026, 10, 13, 12, tzinfo=timezone.utc)
        with self.session_factory() as db:
            for _ in range(5):
                record_failed_login(
                    db,
                    "customer@example.com",
                    "192.0.2.10",
                    now=fixed_now,
                    hmac_key=os.environ["LOGIN_LOCKOUT_HMAC_KEY"],
                )

        with self.session_factory() as db:
            retry_after = prepare_login(
                db,
                "customer@example.com",
                "192.0.2.10",
                now=fixed_now + timedelta(hours=24, seconds=1),
                hmac_key=os.environ["LOGIN_LOCKOUT_HMAC_KEY"],
            )
            self.assertIsNone(retry_after)

    def test_ip_throttle_limits_lockout_requests_across_identities(self):
        for attempt in range(30):
            response = self._login(
                email=f"victim{attempt}@example.com",
            )
            self.assertEqual(response.status_code, 401)

        blocked = self._login(email="another-person@example.com")
        self.assertEqual(blocked.status_code, 401)
        self.assertIn("retry-after", blocked.headers)


if __name__ == "__main__":
    unittest.main()
