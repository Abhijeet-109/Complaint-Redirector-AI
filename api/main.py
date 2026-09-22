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





# Fast API application 

app = FastAPI( 
    title="Flatkart Complaint Redirector API",
    description="API for complaint classification and routing",
    version="1.0.0"
)

#Request Schema 

# class ComplaintRequest(BaseModel):
#     complaint:str


# Prediction API 

# @app.post("/predict")
# def predict(request: ComplaintRequest):

    # department, confidence = predict_department(
    #     request.complaint
    # )

    # return {
    #     'department': department,
    #     "confidence": confidence
    # }


# class DeptRequest(BaseModel):
#     department: str


# #API for Department Email IDs

# @app.post("/deparment-email")
# def department_email(request: DeptRequest):

#     email = get_department_email(
#         request.department
#     )


#     if email is None:
#         return{
#             "success": False,
#             "department": request.department,
#             "email": None
#         }


#     return {
#         "success": True,
#         "department": request.department,
#         "email": email
#     }


# #API for Process omplaints

# class ComplainProccessRequest(BaseModel):
#     name: str
#     email: str
#     complaint: str



# @app.post("/process-complaint")
# def process_complaint(request: ComplainProccessRequest):


#     department, confidence = predict_department(
#         request.complaint
#     )

#     reciver = send_complaint_email(
#         complaint= request.complaint,
#         department= department,
#         confidence= confidence
#     )

#     return{
#         "success": True,
#         "department": department,
#         "confidence": confidence,
#         "reciver": reciver
#     }



app.include_router(
    classifier_router
)

app.include_router(email_router)
app.include_router(complaint_router)