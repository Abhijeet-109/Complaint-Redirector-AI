"""Focused JWT lifetime and required-claim tests."""

import os
import unittest
from datetime import datetime, timedelta, timezone

os.environ.setdefault("JWT_SECRET_KEY", "test-only-jwt-signing-key-32-bytes-long")

import jwt

from backend.auth import security


class AuthTokenSecurityTests(unittest.TestCase):
    def test_issued_token_has_expiration_issuer_and_existing_identity_claims(self):
        token = security.create_access_token(42, "user")
        payload = security.decode_access_token(token)

        self.assertEqual(payload["user_id"], 42)
        self.assertEqual(payload["role"], "user")
        self.assertEqual(payload["iss"], security.JWT_ISSUER)
        self.assertIn("iat", payload)
        self.assertIn("exp", payload)
        self.assertLessEqual(
            payload["exp"] - payload["iat"],
            int(security.ACCESS_TOKEN_TTL.total_seconds()),
        )

    def test_tokens_without_expiration_are_rejected(self):
        legacy_token = jwt.encode(
            {"user_id": 42, "role": "user"},
            security.SECRET_KEY,
            algorithm=security.ALGORITHM,
        )
        with self.assertRaises(jwt.MissingRequiredClaimError):
            security.decode_access_token(legacy_token)

    def test_expired_tokens_are_rejected(self):
        now = datetime.now(timezone.utc)
        expired_token = jwt.encode(
            {
                "user_id": 42,
                "role": "user",
                "iss": security.JWT_ISSUER,
                "iat": now - timedelta(hours=13),
                "exp": now - timedelta(hours=1),
            },
            security.SECRET_KEY,
            algorithm=security.ALGORITHM,
        )
        with self.assertRaises(jwt.ExpiredSignatureError):
            security.decode_access_token(expired_token)


if __name__ == "__main__":
    unittest.main()
