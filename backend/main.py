import logging
from contextlib import asynccontextmanager

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
from backend.Database.models import ChatbotTelemetry
from backend.api.routes.drive import router as drive_router

logger = logging.getLogger("flatkart.startup")


@asynccontextmanager
async def lifespan(_app):
    # Create only the telemetry table when absent; preserve all existing data.
    try:
        ChatbotTelemetry.__table__.create(bind=engine, checkfirst=True)
    except SQLAlchemyError:
        logger.exception("Could not initialize the chatbot telemetry table")
    yield




app = FastAPI(
    title="Flatkart Complaint Redirector API",
    description="API for complaint classification and routing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8501",
        "http://127.0.0.1:8501",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(classifier_router)
app.include_router(email_router)
app.include_router(complaint_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(department_router)
app.include_router(handler_department_router)
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
