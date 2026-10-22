import logging
from contextlib import asynccontextmanager

# Configure root logging once, before importing application modules that log.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
for root_handler in root_logger.handlers:
    if root_handler.level > logging.INFO:
        root_handler.setLevel(logging.INFO)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from backend.api.routes.auth import router as auth_router
from backend.api.routes.admin import router as admin_router
from backend.api.routes.classifier import router as classifier_router
from backend.api.routes.complaint import router as complaint_router
from backend.api.routes.email import router as email_router
from backend.api.routes.test_auth import router as test_auth_router
from backend.api.routes.department import handler_router as handler_department_router
from backend.api.routes.department import router as department_router
from backend.api.routes.chatbot import router as chatbot_router
from backend.api.routes.documents import router as documents_router
from fastapi.openapi.utils import get_openapi
from backend.api.routes.redirection_analytics import (
    router as redirection_analytics_router,
)
from backend.Database.connection import engine
from backend.Database.models import ChatbotTelemetry, LoginThrottle
from backend.api.routes.drive import router as drive_router
from backend.security_config import app_environment, cors_origins

logger = logging.getLogger("flatkart.startup")
APP_ENV = app_environment()


@asynccontextmanager
async def lifespan(_app):
    if APP_ENV == "production":
        if not LoginThrottle.__table__.exists(engine):
            raise RuntimeError(
                "The login lockout table must exist before production startup."
            )

    # Create only the telemetry table when absent; preserve all existing data.
    try:
        ChatbotTelemetry.__table__.create(bind=engine, checkfirst=True)
    except SQLAlchemyError as exc:
        logger.error("Could not initialize chatbot telemetry storage (%s)", type(exc).__name__)
    yield




app = FastAPI(
    title="Flatkart Complaint Redirector API",
    description="API for complaint classification and routing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(environment=APP_ENV),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
)

app.include_router(classifier_router)
app.include_router(email_router)
app.include_router(complaint_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(department_router)
app.include_router(handler_department_router)
if APP_ENV != "production":
    app.include_router(test_auth_router)
app.include_router(chatbot_router)
app.include_router(documents_router)
app.include_router(redirection_analytics_router)
app.include_router(drive_router)

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        openapi_version="3.0.3",
    )

    upload_schema = schema["components"]["schemas"].get(
        "Body_upload_documents_documents_upload_post"
    )

    if upload_schema:
        upload_schema["properties"]["files"] = {
            "type": "array",
            "items": {
                "type": "string",
                "format": "binary",
            },
            "description": "Select PDF or DOCX files",
        }

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi
