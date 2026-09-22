import os
import smtplib

from email.message import EmailMessage
from dotenv import load_dotenv


load_dotenv()


DEPARTMENT_EMAILS = {
    "Account & Security": "abhijeetlahade90619@gmail.com",
    "Payments & Refunds": "abhijeetlahade90619@gmail.com",
    "Order & Delivery": "abhijeetlahade90619@gmail.com",
    "Returns & Replacement": "abhijeetlahade90619@gmail.com",
    "Product & Quality": "abhijeetlahade90619@gmail.com",
    "Technical Support": "abhijeetlahade90619@gmail.com",
}


def get_department_email(department):
    return DEPARTMENT_EMAILS.get(department)


def send_complaint_email(complaint, department, confidence):

    receiver = get_department_email(department)

    if receiver is None:
        raise ValueError(
            f"No email configured for department: {department}"
        )

    sender = os.getenv("SMTP_EMAIL")
    password = os.getenv("SMTP_PASSWORD")
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))

    if not sender or not password or not smtp_server:
        raise ValueError(
            "SMTP configuration missing in .env"
        )

    message = EmailMessage()

    message["Subject"] = (
        f"[FlatKart Complaint] {department}"
    )

    message["From"] = sender
    message["To"] = receiver

    # Plain text fallback
    message.set_content(
        f"""New FlatKart Complaint

Department: {department}
Confidence: {confidence * 100:.2f}%

Complaint:
{complaint}

---
FlatKart Complaint Redirector
"""
    )

    # HTML Version
    html_content = f"""
    <html>
      <body style="font-family: 'Plus Jakarta Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <div style="background-color: #ffffff; padding: 30px; border-bottom: 1px solid #f1f5f9; text-align: center;">
            <div style="font-size: 26px; font-weight: 800; color: #111827; letter-spacing: -0.5px;">
              <span style="background: #fbbf24; color: #111827; padding: 6px 12px; border-radius: 10px; margin-right: 8px;">🛒</span> Flatkart
            </div>
            <div style="color: #64748b; font-size: 14px; margin-top: 8px; font-weight: 500;">AI Complaint Assistant Beta</div>
          </div>
          
          <!-- Body -->
          <div style="padding: 35px 40px;">
            <h2 style="color: #111827; font-size: 22px; margin-top: 0; margin-bottom: 25px; font-weight: 700;">New Action Required</h2>
            
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding-bottom: 16px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 45%;">Target Department</td>
                  <td style="padding-bottom: 16px; color: #111827; font-size: 16px; font-weight: 700;">{department}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">AI Confidence</td>
                  <td style="color: #111827; font-size: 16px; font-weight: 700;">
                    <span style="background-color: #ecfdf5; color: #059669; padding: 4px 12px; border-radius: 9999px; font-size: 14px;">{confidence * 100:.2f}%</span>
                  </td>
                </tr>
              </table>
            </div>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Customer Issue</span>
            </div>
            
            <div style="background-color: #ffffff; padding: 20px 24px; color: #334155; font-size: 15px; line-height: 1.6; border-radius: 12px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); border: 1px solid #e2e8f0; border-left-width: 4px; border-left-color: #3b82f6;">
              {complaint}
            </div>
            
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="color: #94a3b8; font-size: 13px; margin: 0; line-height: 1.5;">
              This is an automated routing message.<br>
              &copy; 2026 Flatkart &middot; All rights reserved.
            </p>
          </div>
          
        </div>
      </body>
    </html>
    """
    
    message.add_alternative(html_content, subtype='html')

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(sender, password)
        server.send_message(message)

    return receiver


