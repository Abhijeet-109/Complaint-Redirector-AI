import sys
import os

BACKEND_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "backend"
    )
)

sys.path.insert(0, BACKEND_DIR)

from fastapi import FastAPI
from api.routes.classifier import router as classifier_router
from api.routes.email import router as email_router
from api.routes.complaint import router as complaint_router
from api.routes.auth import router as auth_router
#temp







# Fast API application 

app = FastAPI( 
    title="Flatkart Complaint Redirector API",
    description="API for complaint classification and routing",
    version="1.0.0"
)




app.include_router(
    classifier_router
)

app.include_router(email_router)
app.include_router(complaint_router)


app.include_router(auth_router)
