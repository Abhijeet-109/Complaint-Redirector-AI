"""Environment validation for production-only security settings."""

import os
from urllib.parse import parse_qs, urlsplit


DEVELOPMENT_ORIGINS = (
    "http://localhost:8501",
    "http://127.0.0.1:8501",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
)

_WEAK_JWT_SECRETS = {
    "secret",
    "changeme",
    "change-me",
    "your-secret-key",
    "replace-me",
    "replace-with-random-32-byte-or-more-secret",
}


def app_environment(value: str | None = None) -> str:
    environment = (value or os.getenv("APP_ENV") or "development").strip().lower()
    if environment not in {"development", "test", "production"}:
        raise RuntimeError("APP_ENV must be development, test, or production.")
    return environment


def validate_jwt_secret(secret: str | None, environment: str | None = None) -> None:
    if app_environment(environment) != "production":
        return

    normalized_secret = (secret or "").strip()
    if (
        len(normalized_secret.encode("utf-8")) < 32
        or len(set(normalized_secret)) < 16
        or normalized_secret.lower() in _WEAK_JWT_SECRETS
    ):
        raise RuntimeError(
            "Production requires JWT_SECRET_KEY with at least 32 bytes of "
            "random secret material."
        )


def validate_database_url(database_url: str | None, environment: str | None = None) -> None:
    if app_environment(environment) != "production":
        return

    parsed = urlsplit((database_url or "").strip())
    ssl_modes = parse_qs(parsed.query).get("sslmode", [])
    if (
        parsed.scheme not in {"postgres", "postgresql", "postgresql+psycopg2", "postgresql+psycopg"}
        or not parsed.hostname
        or not parsed.username
        or not parsed.password
        or not ssl_modes
        or ssl_modes[0].lower() not in {"require", "verify-ca", "verify-full"}
    ):
        raise RuntimeError(
            "Production requires DATABASE_URL for PostgreSQL with SSL enabled."
        )


def validate_login_lockout_config(
    enabled: str | None = None,
    hmac_key: str | None = None,
    environment: str | None = None,
) -> None:
    production = app_environment(environment) == "production"
    enabled_value = (enabled if enabled is not None else os.getenv("LOGIN_LOCKOUT_ENABLED", "false"))
    key_value = (hmac_key if hmac_key is not None else os.getenv("LOGIN_LOCKOUT_HMAC_KEY", ""))

    if production and enabled_value.strip().lower() != "true":
        raise RuntimeError("LOGIN_LOCKOUT_ENABLED=true is required in production.")
    if production and (
        len(key_value.encode("utf-8")) < 32
        or len(set(key_value)) < 16
        or key_value.lower() in _WEAK_JWT_SECRETS
    ):
        raise RuntimeError(
            "Production requires LOGIN_LOCKOUT_HMAC_KEY with at least 32 bytes "
            "of random secret material."
        )


def login_lockout_enabled(environment: str | None = None) -> bool:
    current_environment = app_environment(environment)
    if current_environment == "production":
        return True
    return os.getenv("LOGIN_LOCKOUT_ENABLED", "false").strip().lower() == "true"


def _validated_origin(value: str, production: bool) -> str:
    if not value or "*" in value:
        raise RuntimeError("CORS_ALLOWED_ORIGINS must contain exact origins.")

    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
        or value != f"{parsed.scheme}://{parsed.netloc}"
    ):
        raise RuntimeError("CORS_ALLOWED_ORIGINS contains an invalid origin.")

    if production and (
        parsed.scheme != "https"
        or parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise RuntimeError(
            "Production CORS origins must use HTTPS and a deployed hostname."
        )

    return value


def cors_origins(
    configured: str | None = None,
    environment: str | None = None,
) -> list[str]:
    production = app_environment(environment) == "production"
    configured = configured if configured is not None else os.getenv("CORS_ALLOWED_ORIGINS")

    if not configured:
        if production:
            raise RuntimeError(
                "CORS_ALLOWED_ORIGINS must be set in production."
            )
        return list(DEVELOPMENT_ORIGINS)

    origins = [value.strip() for value in configured.split(",") if value.strip()]
    if not origins:
        if production:
            raise RuntimeError(
                "CORS_ALLOWED_ORIGINS must be set in production."
            )
        return list(DEVELOPMENT_ORIGINS)

    validated = [_validated_origin(value, production) for value in origins]
    if len(set(validated)) != len(validated):
        raise RuntimeError("CORS_ALLOWED_ORIGINS must not contain duplicates.")
    return validated
