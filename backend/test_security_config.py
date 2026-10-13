import unittest
import secrets
import os
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware

from backend.security_config import (
    cors_origins,
    validate_database_url,
    validate_jwt_secret,
    validate_login_lockout_config,
)


class SecurityConfigTests(unittest.TestCase):
    def test_development_keeps_existing_local_origins(self):
        origins = cors_origins(configured=None, environment="development")
        self.assertIn("http://localhost:5173", origins)
        self.assertIn("http://127.0.0.1:8501", origins)

    def test_production_requires_strong_jwt_secret(self):
        for secret in (None, "short", "replace-me", "a" * 64):
            with self.subTest(secret_is_set=bool(secret)):
                with self.assertRaises(RuntimeError):
                    validate_jwt_secret(secret, environment="production")

    def test_production_accepts_a_long_configured_jwt_secret(self):
        validate_jwt_secret(secrets.token_urlsafe(48), environment="production")

    def test_production_requires_exact_https_origins(self):
        with self.assertRaises(RuntimeError):
            cors_origins(configured=None, environment="production")

        with self.assertRaises(RuntimeError):
            cors_origins(
                configured="https://shop.example.com,*",
                environment="production",
            )

        with self.assertRaises(RuntimeError):
            cors_origins(
                configured="http://localhost:5173",
                environment="production",
            )

    def test_production_accepts_deployed_https_origins(self):
        self.assertEqual(
            cors_origins(
                configured="https://shop.example.com,https://admin.example.com",
                environment="production",
            ),
            ["https://shop.example.com", "https://admin.example.com"],
        )

    def test_production_requires_postgres_ssl_database_url(self):
        validate_database_url(
            "postgresql://app:secret@db.example.com:5432/flatkart?sslmode=require",
            "production",
        )

    def test_production_rejects_database_urls_without_ssl(self):
        for value in (
            None,
            "sqlite:///local.db",
            "postgresql://app:secret@db.example.com:5432/flatkart",
        ):
            with self.subTest(value=value):
                with self.assertRaises(RuntimeError):
                    validate_database_url(value, "production")

    def test_production_requires_enabled_lockout_and_strong_hmac_key(self):
        key = secrets.token_urlsafe(48)
        validate_login_lockout_config("true", key, "production")

        for enabled, invalid_key in (
            ("false", key),
            ("true", ""),
            ("true", "short"),
        ):
            with self.subTest(enabled=enabled, has_key=bool(invalid_key)):
                with self.assertRaises(RuntimeError):
                    validate_login_lockout_config(enabled, invalid_key, "production")

    def test_cors_preflight_allows_configured_origin_and_rejects_others(self):
        app = FastAPI()
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins(
                "https://shop.example.com",
                environment="production",
            ),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Accept", "Authorization", "Content-Type"],
        )

        @app.post("/resource")
        def resource():
            return {"ok": True}

        with TestClient(app) as client:
            allowed = client.options(
                "/resource",
                headers={
                    "Origin": "https://shop.example.com",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type",
                },
            )
            self.assertEqual(allowed.status_code, 200)
            self.assertEqual(
                allowed.headers.get("access-control-allow-origin"),
                "https://shop.example.com",
            )

            blocked = client.options(
                "/resource",
                headers={
                    "Origin": "https://unapproved.example.com",
                    "Access-Control-Request-Method": "POST",
                },
            )
            self.assertEqual(blocked.status_code, 400)
            self.assertNotIn("access-control-allow-origin", blocked.headers)


if __name__ == "__main__":
    unittest.main()
