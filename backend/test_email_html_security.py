"""Security checks for user-controlled values in complaint notification HTML."""

import unittest
from unittest.mock import patch

from backend import router


class ComplaintEmailHtmlSecurityTests(unittest.TestCase):
    def test_user_content_is_escaped_in_html_alternative(self):
        captured = {}

        def capture_message(message, *_smtp_args):
            captured["message"] = message

        with patch.object(router, "_smtp_config", return_value=("sender@example.com", "secret", "smtp.example.com", 587)), \
                patch.object(router, "_send_message", side_effect=capture_message):
            router.send_complaint_email(
                complaint="<script>alert('x')</script> & issue",
                department="<img src=x onerror=alert(1)>",
                confidence=0.5,
                receiver="support@example.com",
                user_name="<svg onload=alert(1)>",
                user_email='customer@example.com"><script>',
            )

        html_part = captured["message"].get_body(preferencelist=("html",))
        html = html_part.get_content()
        self.assertNotIn("<script>alert", html)
        self.assertNotIn("<img src=x", html)
        self.assertNotIn("<svg onload", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("&lt;img src=x", html)


if __name__ == "__main__":
    unittest.main()
