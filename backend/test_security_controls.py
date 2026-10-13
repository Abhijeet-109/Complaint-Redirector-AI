"""Isolated checks for persistent complaint quota calculations."""

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.Database.connection import Base
from backend.Database.models import Complaint, Department, User
from backend.security_controls import complaint_count_for_utc_day


class ComplaintQuotaTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        user = User(name="Test User", email="test@example.com", password="hash", role="user")
        department = Department(name="Support", email="support@example.com")
        self.session.add_all([user, department])
        self.session.commit()
        self.user_id = user.id
        self.department_id = department.id

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _add_complaint(self, created_at):
        self.session.add(
            Complaint(
                user_id=self.user_id,
                predicted_department_id=self.department_id,
                department_id=self.department_id,
                complaint_text="Test complaint",
                status="pending",
                create_at=created_at,
            )
        )

    def test_counts_only_the_current_utc_day_and_includes_midnight(self):
        self._add_complaint(datetime(2026, 10, 12, 23, 59, 59))
        self._add_complaint(datetime(2026, 10, 13, 0, 0, 0))
        self._add_complaint(datetime(2026, 10, 13, 23, 59, 59))
        self._add_complaint(datetime(2026, 10, 14, 0, 0, 0))
        self.session.commit()

        count = complaint_count_for_utc_day(
            self.session,
            self.user_id,
            now=datetime(2026, 10, 13, 15, tzinfo=timezone.utc),
        )
        self.assertEqual(count, 2)

    def test_new_user_starts_with_zero_complaints(self):
        self.assertEqual(
            complaint_count_for_utc_day(
                self.session,
                self.user_id,
                now=datetime(2026, 10, 13, tzinfo=timezone.utc),
            ),
            0,
        )

if __name__ == "__main__":
    unittest.main()
