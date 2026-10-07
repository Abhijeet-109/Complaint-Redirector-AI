from backend.Database.connection import SessionLocal
from backend.Database.models import Department


DEPARTMENTS = [
    {
        "name": "Account & Security",
        "email": "abhijeetlahade90619@gmail.com"
    },
    {
        "name": "Payments & Refunds",
        "email": "abhijeetlahade90619@gmail.com"
    },
    {
        "name": "Order & Delivery",
        "email": "abhijeetlahade90619@gmail.com"
    },
    {
        "name": "Returns & Replacement",
        "email": "abhijeetlahade90619@gmail.com"
    },
    {
        "name": "Product & Quality",
        "email": "abhijeetlahade90619@gmail.com"
    },
    {
        "name": "Technical Support",
        "email": "abhijeetlahade90619@gmail.com"
    }
]


db = SessionLocal()

try:

    for department_data in DEPARTMENTS:

        existing_department = db.query(Department).filter(
            Department.name == department_data["name"]
        ).first()

        if existing_department:
            print(
                f"Already exists: {department_data['name']}"
            )
            continue

        department = Department(
            name=department_data["name"],
            email=department_data["email"]
        )

        db.add(department)

    db.commit()

    print("Departments seeded successfully.")

finally:

    db.close()