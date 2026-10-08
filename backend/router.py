import logging
import os
import smtplib

from email.message import EmailMessage
from dotenv import load_dotenv


load_dotenv()

logger = logging.getLogger("flatkart.email")


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


def _smtp_config():
    """Return (sender, password, server, port) or raise ValueError."""
    sender = os.getenv("SMTP_EMAIL")
    password = os.getenv("SMTP_PASSWORD")
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))

    if not sender or not password or not smtp_server:
        raise ValueError("SMTP configuration missing in .env")

    return sender, password, smtp_server, smtp_port


def _send_message(message, sender, password, smtp_server, smtp_port):
    """Open SMTP connection and send the message."""
    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(sender, password)
        server.send_message(message)


def send_complaint_email(
    complaint,
    department,
    confidence,
    receiver=None,
    *,
    user_name=None,
    user_email=None,
    complaint_id=None,
):
    """Send a complaint notification email.

    If *receiver* is supplied, it is used directly (database workflow).
    If *receiver* is not supplied, the hardcoded DEPARTMENT_EMAILS dictionary
    is used for backward compatibility with the legacy endpoint.
    """

    if receiver is None:
        receiver = get_department_email(department)

    if receiver is None:
        raise ValueError(
            f"No email configured for department: {department}"
        )

    sender, password, smtp_server, smtp_port = _smtp_config()

    message = EmailMessage()

    message["Subject"] = (
        f"[FlatKart Complaint] {department}"
    )

    message["From"] = sender
    message["To"] = receiver

    # Build customer info for plain text
    customer_section = ""
    if user_name or user_email:
        customer_section = "\nCustomer Information:\n"
        if user_name:
            customer_section += f"  Name: {user_name}\n"
        if user_email:
            customer_section += f"  Email: {user_email}\n"

    complaint_id_line = f"Complaint ID: #{complaint_id}\n" if complaint_id else ""

    # Plain text fallback
    message.set_content(
        f"""New FlatKart Complaint

{complaint_id_line}Department: {department}
Confidence: {confidence * 100:.2f}%
{customer_section}
Complaint:
{complaint}

---
FlatKart Complaint Redirector
"""
    )

    # Build customer HTML section
    customer_html = ""
    if user_name or user_email:
        customer_rows = ""
        if user_name:
            customer_rows += f"""
                <tr>
                  <td style="padding-bottom: 12px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 45%;">Customer Name</td>
                  <td style="padding-bottom: 12px; color: #111827; font-size: 15px; font-weight: 600;">{user_name}</td>
                </tr>"""
        if user_email:
            customer_rows += f"""
                <tr>
                  <td style="padding-bottom: 12px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 45%;">Customer Email</td>
                  <td style="padding-bottom: 12px; color: #111827; font-size: 15px; font-weight: 600;">{user_email}</td>
                </tr>"""
        customer_html = f"""
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
              <table style="width: 100%; border-collapse: collapse;">
                {customer_rows}
              </table>
            </div>"""

    complaint_id_html = f"""
                <tr>
                  <td style="padding-bottom: 16px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 45%;">Complaint ID</td>
                  <td style="padding-bottom: 16px; color: #111827; font-size: 16px; font-weight: 700;">#{complaint_id}</td>
                </tr>""" if complaint_id else ""

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
            <div style="color: #64748b; font-size: 14px; margin-top: 8px; font-weight: 500;">New Complaint Notification</div>
          </div>
          
          <!-- Body -->
          <div style="padding: 35px 40px;">
            <h2 style="color: #111827; font-size: 22px; margin-top: 0; margin-bottom: 25px; font-weight: 700;">New Action Required</h2>
            
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
              <table style="width: 100%; border-collapse: collapse;">
                {complaint_id_html}
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

            {customer_html}
            
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

    _send_message(message, sender, password, smtp_server, smtp_port)

    return receiver


def send_redirect_email(
    complaint_text,
    complaint_id,
    previous_department,
    new_department,
    predicted_department,
    confidence,
    receiver,
    status="pending",
):
    """Send a complaint-redirected notification to the target department."""

    if not receiver:
        raise ValueError("No email address for the target department")

    sender, password, smtp_server, smtp_port = _smtp_config()

    message = EmailMessage()
    message["Subject"] = f"[FlatKart] Complaint #{complaint_id} Redirected — {new_department}"
    message["From"] = sender
    message["To"] = receiver

    conf_display = f"{float(confidence) * 100:.2f}%" if confidence else "—"

    message.set_content(
        f"""Complaint Redirected

Complaint #{complaint_id} has been redirected.

Previous Department: {previous_department}
New Department: {new_department}

AI Prediction: {predicted_department}
AI Confidence: {conf_display}

Status: {status}

Reason: Department handler redirected the complaint for further handling.

Complaint:
{complaint_text}

---
FlatKart Complaint Redirector
"""
    )

    html_content = f"""
    <html>
      <body style="font-family: 'Plus Jakarta Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
          
          <div style="background-color: #ffffff; padding: 30px; border-bottom: 1px solid #f1f5f9; text-align: center;">
            <div style="font-size: 26px; font-weight: 800; color: #111827; letter-spacing: -0.5px;">
              <span style="background: #fbbf24; color: #111827; padding: 6px 12px; border-radius: 10px; margin-right: 8px;">🛒</span> Flatkart
            </div>
            <div style="color: #64748b; font-size: 14px; margin-top: 8px; font-weight: 500;">Complaint Redirected</div>
          </div>
          
          <div style="padding: 35px 40px;">
            <h2 style="color: #111827; font-size: 22px; margin-top: 0; margin-bottom: 25px; font-weight: 700;">Complaint #{complaint_id} has been redirected</h2>
            
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding-bottom: 16px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 45%;">Previous Department</td>
                  <td style="padding-bottom: 16px; color: #111827; font-size: 15px; font-weight: 600;">{previous_department}</td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">New Department</td>
                  <td style="padding-bottom: 16px; color: #111827; font-size: 15px; font-weight: 700;">
                    <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 9999px; font-size: 14px;">{new_department}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">AI Prediction</td>
                  <td style="padding-bottom: 16px; color: #111827; font-size: 15px; font-weight: 600;">{predicted_department}</td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">AI Confidence</td>
                  <td style="padding-bottom: 16px; color: #111827; font-size: 15px; font-weight: 600;">
                    <span style="background-color: #ecfdf5; color: #059669; padding: 4px 12px; border-radius: 9999px; font-size: 14px;">{conf_display}</span>
                  </td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Status</td>
                  <td style="color: #111827; font-size: 15px; font-weight: 600;">{status}</td>
                </tr>
              </table>
            </div>

            <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; color: #92400e; font-size: 14px;">
              <strong>Reason:</strong> Department handler redirected the complaint for further handling.
            </div>
            
            <div style="margin-bottom: 12px;">
              <span style="color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Customer Issue</span>
            </div>
            
            <div style="background-color: #ffffff; padding: 20px 24px; color: #334155; font-size: 15px; line-height: 1.6; border-radius: 12px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); border: 1px solid #e2e8f0; border-left-width: 4px; border-left-color: #f59e0b;">
              {complaint_text}
            </div>
          </div>
          
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

    message.add_alternative(html_content, subtype="html")

    _send_message(message, sender, password, smtp_server, smtp_port)

    return receiver
