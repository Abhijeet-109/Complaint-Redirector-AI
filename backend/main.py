from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.auth import router as auth_router
from backend.api.routes.admin import router as admin_router
from backend.api.routes.classifier import router as classifier_router
from backend.api.routes.complaint import router as complaint_router
from backend.api.routes.email import router as email_router
from backend.api.routes.test_auth import router as test_auth_router
from backend.api.routes.department import router as department_router


app = FastAPI(
    title="Flatkart Complaint Redirector API",
    description="API for complaint classification and routing",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8501",
        "http://127.0.0.1:8501",
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
app.include_router(test_auth_router)
