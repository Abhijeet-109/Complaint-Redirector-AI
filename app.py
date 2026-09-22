import sys
import os
import streamlit as st
import requests

API_URL = "http://127.0.0.1:8000/api/v1/process-complaint"

# ============================================================
# PAGE CONFIG
# ============================================================

st.set_page_config(
    page_title="Flatkart | Complaint Assistant",
    page_icon="🛒",
    layout="centered"
)


# ============================================================
# CUSTOM CSS — Clarity Resolution Design System
# ============================================================

st.markdown(
    """
<style>

/* ── Google Font ── */

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap');

/* ── Reset & Global ── */

*, *::before, *::after {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
}

#MainMenu {
    visibility: hidden;
}

footer {
    visibility: hidden;
}

header[data-testid="stHeader"] {
    background: #ffffff !important;
}

.stApp {
    background: #ffffff !important;
}

.block-container {
    padding-top: 1.5rem !important;
    padding-bottom: 2rem !important;
    max-width: 720px !important;
}


/* ── Header Bar ── */

.top-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0 18px 0;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 44px;
}

.brand-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.brand-logo {
    background: #fbbf24;
    color: #111827;
    font-size: 16px;
    font-weight: 800;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.brand-text {
    display: flex;
    flex-direction: column;
}

.brand-name {
    font-size: 20px;
    font-weight: 800;
    color: #111827;
    letter-spacing: -0.5px;
    line-height: 1.2;
}

.brand-tagline {
    color: #64748b;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.3;
}

.beta-badge {
    background: #fef3c7;
    color: #92400e;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
}

.beta-badge svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}


/* ── Hero Section ── */

.hero {
    text-align: center;
    margin-bottom: 32px;
}

.eyebrow {
    display: inline-block;
    color: #2563eb;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
    text-transform: uppercase;
    background: rgba(37, 99, 235, 0.06);
    padding: 5px 14px;
    border-radius: 9999px;
}

.hero-title {
    color: #111827;
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-bottom: 10px;
}

.hero-subtitle {
    color: #64748b;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.6;
    max-width: 480px;
    margin: 0 auto;
}


/* ── Form Container (Streamlit form) ── */

div[data-testid="stForm"] {
    border: 1px solid #e2e8f0 !important;
    border-radius: 20px !important;
    padding: 36px !important;
    background: #ffffff !important;
    box-shadow:
        0 1px 3px 0 rgba(15, 23, 42, 0.04),
        0 8px 24px -4px rgba(15, 23, 42, 0.06) !important;
}


/* ── Input Styling ── */

.stTextInput > label,
.stTextArea > label {
    font-size: 13px !important;
    font-weight: 600 !important;
    color: #374151 !important;
}

div[data-baseweb="input"] {
    border-radius: 12px !important;
    border-color: #e2e8f0 !important;
    background: #374151 !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
}

div[data-baseweb="input"]:focus-within {
    border-color: #fbbf24 !important;
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15) !important;
}
# Text color of form Name and Email 
div[data-baseweb="input"] input {
    font-size: 14px !important;
    color: #ffffff !important;
}

div[data-baseweb="input"] input::placeholder {
    color: #94a3b8 !important;
}

div[data-baseweb="textarea"] {
    border-radius: 12px !important;
    border-color: #e2e8f0 !important;
    background: #374151 !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
}

div[data-baseweb="textarea"]:focus-within {
    border-color: #fbbf24 !important;
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15) !important;
}

div[data-baseweb="textarea"] textarea {
    font-size: 14px !important;
    color: #ffffff !important;
    min-height: 120px !important;
}

div[data-baseweb="textarea"] textarea::placeholder {
    color: #94a3b8 !important;
}


/* ── Form Submit Button ── */

div[data-testid="stForm"] .stButton > button,
div[data-testid="stFormSubmitButton"] > button {
    width: 100% !important;
    height: 50px !important;
    border-radius: 12px !important;
    border: none !important;
    background: #fbbf24 !important;
    color: #111827 !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    letter-spacing: 0.01em !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06) !important;
}

div[data-testid="stForm"] .stButton > button:hover,
div[data-testid="stFormSubmitButton"] > button:hover {
    background: #f59e0b !important;
    color: #111827 !important;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3) !important;
}

div[data-testid="stForm"] .stButton > button:active,
div[data-testid="stFormSubmitButton"] > button:active {
    transform: scale(0.985) !important;
}


/* ── Result Card ── */

.result-card {
    margin-top: 28px;
    padding: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    background: #ffffff;
    box-shadow:
        0 1px 3px 0 rgba(15, 23, 42, 0.04),
        0 8px 24px -4px rgba(15, 23, 42, 0.06);
    animation: slideUp 0.4s ease-out;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.result-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid #f1f5f9;
}

.result-check {
    width: 42px;
    height: 42px;
    background: #ecfdf5;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.result-check svg {
    width: 24px;
    height: 24px;
    color: #059669;
}

.result-title {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    letter-spacing: -0.01em;
    line-height: 1.3;
}

.result-title-sub {
    font-size: 13px;
    font-weight: 400;
    color: #64748b;
    margin-top: 2px;
}

.result-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
}

.result-item {
    padding: 16px;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
}

.result-label {
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 6px;
}

.result-value {
    color: #111827;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
    word-break: break-word;
}


/* ── Responsive ── */

@media (max-width: 640px) {
    .result-grid {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .hero-title {
        font-size: 30px;
    }

    div[data-testid="stForm"] {
        padding: 24px !important;
        border-radius: 16px !important;
    }

    .result-card {
        padding: 24px;
        border-radius: 16px;
    }

    .top-header {
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
    }
}


/* ── Security Note ── */

.security-note {
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 400;
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.security-note svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
}


/* ── Footer ── */

.site-footer {
    border-top: 1px solid #f1f5f9;
    margin-top: 52px;
    padding: 20px 0 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 400;
}

.footer-links {
    display: flex;
    gap: 20px;
}

.footer-links a {
    color: #94a3b8;
    text-decoration: none;
    transition: color 0.15s ease;
}

.footer-links a:hover {
    color: #64748b;
}

@media (max-width: 640px) {
    .site-footer {
        flex-direction: column;
        gap: 10px;
        text-align: center;
    }
}


/* ── Streamlit Alert & Spinner Overrides ── */

div[data-testid="stAlert"] {
    border-radius: 12px !important;
}

/* Success alert custom */
div.stAlert [data-testid="stAlertContentSuccess"] {
    font-weight: 500 !important;
}

/* Spinner fix for light background */
div[data-testid="stSpinner"] {
    color: #111827 !important;
}

div[data-testid="stSpinner"] svg circle {
    stroke: #fbbf24 !important;
}

</style>
""",
    unsafe_allow_html=True
)


# ============================================================
# HEADER
# ============================================================

st.markdown(
    """
<div class="top-header">
    <div class="brand-group">
        <div class="brand-logo">🛒</div>
        <div class="brand-text">
            <div class="brand-name">Flatkart</div>
            <div class="brand-tagline">Shop More. Worry Less.</div>
        </div>
    </div>
    <div class="beta-badge">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/>
        </svg>
        AI Complaint Assistant&nbsp;&nbsp;Beta
    </div>
</div>
""",
    unsafe_allow_html=True
)


# ============================================================
# HERO
# ============================================================

st.markdown(
    """
<div class="hero">
    <div class="eyebrow">
        WE'RE HERE TO HELP
    </div>
    <div class="hero-title">
        Raise a Complaint
    </div>
    <div class="hero-subtitle">
        Tell us your issue, and our AI will route it to the right department.
    </div>
</div>
""",
    unsafe_allow_html=True
)


# ============================================================
# FORM (using st.form for card containment)
# ============================================================

with st.form("complaint_form"):

    # Form card header
    st.markdown(
        """
<div style="margin-bottom: 20px;">
    <div style="font-size: 20px; font-weight: 700; color: #111827; letter-spacing: -0.005em; margin-bottom: 4px;">
        Complaint Details
    </div>
    <div style="font-size: 14px; font-weight: 400; color: #64748b;">
        Please provide the following information.
    </div>
</div>
""",
        unsafe_allow_html=True
    )

    name = st.text_input(
        "Your Name",
        placeholder="Enter your name"
    )

    email = st.text_input(
        "Email Address",
        placeholder="Enter your email address"
    )

    complaint = st.text_area(
        "Your Complaint",
        placeholder="Describe your issue here...",
        height=140
    )

    submitted = st.form_submit_button(
        "✈  Submit Complaint"
    )


# ============================================================
# PROCESS COMPLAINT
# ============================================================

if submitted:

    # ── Validation ──

    if not name.strip():
        st.error("⚠️  Please enter your name.")

    elif not email.strip():
        st.error("⚠️  Please enter your email address.")

    elif "@" not in email or "." not in email:
        st.error("⚠️  Please enter a valid email address.")

    elif not complaint.strip():
        st.error("⚠️  Please describe your complaint.")

    else:

        try:

            with st.spinner("Analyzing your complaint..."):

                # Send request to FastAPI backend
                try:
                    response = requests.post(
                        API_URL,
                        json={
                            "name": name,
                            "email": email,
                            "complaint": complaint
                        },
                        timeout=10
                    )
                    response.raise_for_status()
                    result = response.json()
                    
                    if not result.get("success"):
                        raise Exception("API returned unsuccessful response")
                        
                    department = result.get("department", "Unknown")
                    confidence = result.get("confidence", 0.0)
                    receiver = result.get("receiver", "Unknown")
                    
                except requests.exceptions.RequestException as e:
                    st.error("Cannot connect to the backend server. Please try again later.")
                    st.stop()
                except Exception as e:
                    st.error("An error occurred while processing the response from the server.")
                    st.stop()


            # =================================================
            # RESULT CARD
            # =================================================

            st.markdown(
                f"""
<div class="result-card">
    <div class="result-header">
        <div class="result-check">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd"/>
            </svg>
        </div>
        <div>
            <div class="result-title">Complaint Successfully Processed</div>
            <div class="result-title-sub">Your complaint has been analyzed and forwarded.
            <br> 
            Our team will contact you ASAP.</div>
        </div>
    </div>
    <div class="result-grid">
        <div class="result-item">
            <div class="result-label">Department</div>
            <div class="result-value">{department}</div>
        </div>
        <div class="result-item">
            <div class="result-label">AI Confidence</div>
            <div class="result-value">{confidence * 100:.2f}%</div>
        </div>
        <div class="result-item">
            <div class="result-label">Forwarded To</div>
            <div class="result-value">{receiver}</div>
        </div>
    </div>
</div>
""",
                unsafe_allow_html=True
            )

            st.success(
                "Your complaint has been successfully routed to the relevant team."
            )

        except Exception:

            st.error(
                "We encountered an issue while processing your complaint. "
                "Please try again later or contact support."
            )


# ============================================================
# SECURITY NOTE
# ============================================================

st.markdown(
    """
<div class="security-note">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clip-rule="evenodd"/>
    </svg>
    Your information is secure and will only be used to resolve your complaint.
</div>
""",
    unsafe_allow_html=True
)


# ============================================================
# FOOTER
# ============================================================

st.markdown(
    """
<div class="site-footer">
    <div>&copy; 2026 Flatkart &middot; All rights reserved.</div>
    <div class="footer-links">
        <a href="#">Privacy Policy</a>
        <a href="#">Terms of Service</a>
        <a href="#">Contact Support</a>
    </div>
</div>
""",
    unsafe_allow_html=True
)