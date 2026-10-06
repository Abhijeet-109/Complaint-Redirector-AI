from backend.predictor import predict_department
from backend.router import get_department_email


complaint = "I was charged twice for the same order."


# 1. Predict department
department, confidence = predict_department(complaint)


# 2. Find department email
email = get_department_email(department)


print("\n" + "=" * 50)
print("FLATKART COMPLAINT PIPELINE")
print("=" * 50)

print("\nComplaint:")
print(complaint)

print("\nPredicted Department:")
print(department)

print("\nConfidence:")
print(f"{confidence * 100:.2f}%")

print("\nRouted Email:")
print(email)

print("\n" + "=" * 50)
