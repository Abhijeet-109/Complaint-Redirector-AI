import os

from backend.Database.connection import SessionLocal
from backend.Database.models import User
from backend.auth.security import hash_password


super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", "").strip().lower()
super_admin_password = os.getenv("SUPER_ADMIN_PASSWORD", "")
if not super_admin_email or not super_admin_password:
    raise SystemExit(
        "Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD before provisioning."
    )


db = SessionLocal()

try:

    existing_user = db.query(User).filter(
        User.email.ilike(super_admin_email)
    ).first()

    if existing_user:
        if existing_user.role != "super_admin":
            raise SystemExit(
                "The configured account already exists with another role; "
                "review it through the approved account-management process."
            )

        print("Super Admin already exists.")

    else:

        super_admin = User(
            name=os.getenv("SUPER_ADMIN_NAME", "").strip() or "Super Admin",
            email=super_admin_email,
            password=hash_password(super_admin_password),
            role="super_admin",
            department_id=None
        )

        db.add(super_admin)
        db.commit()

        print("Super Admin created successfully.")

finally:

    db.close()
