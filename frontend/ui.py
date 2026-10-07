"""Page composition and session navigation for the Phase 1 Streamlit UI."""

import streamlit as st

from frontend.auth_api import (
    AuthAPIError,
    login_user,
    register_user,
    role_from_token,
    validate_email,
)
from frontend.styles import apply_styles
from frontend.dashboard import render_role_placeholder, render_user_dashboard


def _go(page: str) -> None:
    st.session_state.current_page = page
    st.rerun()


def _brand() -> None:
    st.markdown(
        """
<div class="fk-brand" aria-label="Flatkart home">
  <span class="fk-mark" aria-hidden="true">
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 7.5h5.5v5.5H5zM13.5 7.5H19v5.5h-5.5zM9.25 16.5h5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="12" cy="16.5" r="1.5" fill="#F7C948"/>
    </svg>
  </span><span>Flatkart</span>
</div>
""",
        unsafe_allow_html=True,
    )


def render_header() -> None:
    brand, links, login, register = st.columns([1.35, 3.2, 1, 1.1], vertical_alignment="center")
    with brand:
        _brand()
    with links:
        st.markdown(
            '<nav class="fk-nav" aria-label="Main navigation"><a href="#top">Home</a>'
            '<a href="#how-it-works">How It Works</a><a href="#help">Help</a></nav>',
            unsafe_allow_html=True,
        )
    with login:
        if st.button("Login", key="header_login", use_container_width=True):
            _go("login")
    with register:
        if st.button("Register", key="header_register", type="primary", use_container_width=True):
            _go("register")
    st.markdown('<div class="fk-header-rule"></div><div id="top"></div>', unsafe_allow_html=True)


def render_footer() -> None:
    st.markdown(
        """
<footer class="fk-footer" id="contact">
  <div><strong>Flatkart</strong><br>AI-powered complaint routing and resolution.</div>
  <div><a href="#top">Home</a><span aria-hidden="true">&nbsp; · &nbsp;</span><a href="#help">Help</a></div>
</footer>
""",
        unsafe_allow_html=True,
    )


def _feature_card(icon: str, title: str, copy: str) -> None:
    st.markdown(
        f'<article class="fk-card"><div class="fk-card-icon" aria-hidden="true">{icon}</div>'
        f"<h3>{title}</h3><p>{copy}</p></article>",
        unsafe_allow_html=True,
    )


def _routing_visual() -> None:
    st.markdown(
        """
<div class="fk-visual" role="img" aria-label="A complaint is reviewed and directed to the right department">
  <div class="fk-visual-title">One clear path to the right team</div>
  <div class="fk-route-card"><span class="fk-node">1</span><span>Your issue, in your words</span></div>
  <div class="fk-route-arrow" aria-hidden="true">↓</div>
  <div class="fk-route-card"><span class="fk-node">AI</span><span>Relevant department found</span></div>
  <div class="fk-route-arrow" aria-hidden="true">↓</div>
  <div class="fk-route-card"><span class="fk-node">✓</span><span>Updates through resolution</span></div>
</div>
""",
        unsafe_allow_html=True,
    )


def render_landing_page() -> None:
    render_header()

    copy, visual = st.columns([1.15, 0.85], gap="large", vertical_alignment="center")
    with copy:
        st.markdown(
            '<section class="fk-hero-copy"><span class="fk-eyebrow">A simpler way to get help</span>'
            "<h1>Complaint Resolution Made Simple</h1>"
            "<p>Tell us your problem. Our AI routes your complaint to the right department so you can get help faster.</p></section>",
            unsafe_allow_html=True,
        )
        primary, secondary = st.columns([1.45, 1], gap="small")
        with primary:
            if st.button("File a Complaint", key="file_complaint", type="primary", use_container_width=True):
                if st.session_state.logged_in:
                    st.info("Complaint submission will be available in a later phase.")
                else:
                    _go("login")
        with secondary:
            if st.button("Login", key="hero_login", use_container_width=True):
                _go("login")
    with visual:
        _routing_visual()

    st.markdown('<section class="fk-section" aria-label="Flatkart features">', unsafe_allow_html=True)
    st.markdown('<h2 class="fk-section-heading">Support that feels straightforward</h2>', unsafe_allow_html=True)
    st.markdown('<p class="fk-section-copy">The right help, with a clearer path from start to finish.</p>', unsafe_allow_html=True)
    feature_columns = st.columns(3, gap="medium")
    features = [
        ("↗", "AI-Powered Routing", "Your complaint is automatically analyzed and routed to the most relevant department."),
        ("◷", "Track Your Complaint", "Keep track of your complaint status from submission to resolution."),
        ("@", "Direct Department Contact", "Find the contact email for the department handling your complaint."),
    ]
    for column, (icon, title, description) in zip(feature_columns, features):
        with column:
            _feature_card(icon, title, description)
    st.markdown("</section>", unsafe_allow_html=True)

    st.markdown('<section class="fk-section" id="how-it-works">', unsafe_allow_html=True)
    st.markdown('<h2 class="fk-section-heading">How it works</h2>', unsafe_allow_html=True)
    st.markdown('<p class="fk-section-copy">Getting help is simple and takes just a few steps.</p>', unsafe_allow_html=True)
    steps = st.columns(3, gap="large")
    step_content = [
        ("01", "Submit Your Complaint", "Tell us what’s wrong in a few simple words."),
        ("02", "AI Finds the Right Department", "Our AI analyzes your complaint and routes it to the most relevant department."),
        ("03", "Track the Resolution", "Follow your complaint status and get updates until it’s resolved."),
    ]
    for column, (number, title, description) in zip(steps, step_content):
        with column:
            st.markdown(
                f'<article class="fk-step"><div class="fk-step-num">{number}</div><div>'
                f"<h3>{title}</h3><p>{description}</p></div></article>",
                unsafe_allow_html=True,
            )
    st.markdown("</section>", unsafe_allow_html=True)

    st.markdown('<div id="help"></div>', unsafe_allow_html=True)
    with st.container(key="cta"):
        cta_copy, action = st.columns([3, 1.2], gap="medium", vertical_alignment="center")
        with cta_copy:
            st.markdown('<h2 style="margin:0 0 .4rem;color:#10234B;font-size:1.4rem">Need help with an issue?</h2>'
                        '<p style="margin:0;color:#52627A;line-height:1.55">Submit your complaint and let our system route it to the right team.</p>',
                        unsafe_allow_html=True)
        with action:
            if st.button("Get Started", key="get_started", type="primary", use_container_width=True):
                _go("register" if not st.session_state.logged_in else "login")
    render_footer()


def _render_auth_header() -> None:
    left, right = st.columns([1.3, 1], vertical_alignment="center")
    with left:
        _brand()
    with right:
        if st.button("←  Back to Home", key="auth_home", use_container_width=False):
            _go("landing")


def _render_auth_switch(message: str, label: str, page: str, key: str) -> None:
    first, action = st.columns([1.5, 1])
    with first:
        st.markdown(f'<p class="fk-auth-switch">{message}</p>', unsafe_allow_html=True)
    with action:
        if st.button(label, key=key, use_container_width=True):
            _go(page)


def render_login_page() -> None:
    shell = st.container(key="auth_shell")
    with shell:
        _render_auth_header()
        st.markdown(
            '<div class="fk-auth-heading"><h1>Welcome back</h1>'
            '<p>Login to continue to Flatkart.</p></div>',
            unsafe_allow_html=True,
        )
        with st.container(key="auth_card"):
            if st.session_state.logged_in:
                st.success("You’re signed in to Flatkart.")
                if st.session_state.user_role:
                    st.caption(f"Account role: {st.session_state.user_role}")
                st.info("Your complaint workspace will be available in a later phase.")
                if st.button("Sign out", key="sign_out", use_container_width=True):
                    _clear_auth_state()
                    st.rerun()
            else:
                if st.session_state.pop("session_expired_notice", False):
                    st.warning("Your session has expired. Please login again.")
                if st.session_state.pop("registration_notice", False):
                    st.success("Your account is ready. Login to continue.")
                with st.form("login_form"):
                    email = st.text_input("Email", key="login_email_input", placeholder="you@example.com")
                    password = st.text_input("Password", type="password", key="login_password_input", placeholder="Enter your password")
                    submitted = st.form_submit_button("Login", type="primary", use_container_width=True)

                if submitted:
                    if not email.strip():
                        st.error("Enter your email address.")
                    elif not validate_email(email):
                        st.error("Enter a valid email address.")
                    elif not password:
                        st.error("Enter your password.")
                    else:
                        try:
                            with st.spinner("Signing you in…"):
                                result = login_user(email, password)
                            token = result.get("access_token")
                            if not isinstance(token, str) or not token:
                                raise AuthAPIError("We couldn’t sign you in. Please try again.")
                            st.session_state.access_token = token
                            st.session_state.token_type = result.get("token_type", "bearer")
                            st.session_state.user_role = role_from_token(token)
                            st.session_state.logged_in = True
                            st.rerun()
                        except AuthAPIError as exc:
                            st.error(str(exc))

                _render_auth_switch("Don’t have an account?", "Register", "register", "login_to_register")
        if not st.session_state.logged_in:
            st.markdown('<p class="fk-auth-foot">Your account is protected by secure sign-in.</p>', unsafe_allow_html=True)


def render_register_page() -> None:
    shell = st.container(key="auth_shell")
    with shell:
        _render_auth_header()
        st.markdown(
            '<div class="fk-auth-heading"><h1>Create your Flatkart account</h1>'
            '<p>Get faster, smarter support for all your concerns.</p></div>',
            unsafe_allow_html=True,
        )
        with st.container(key="auth_card"):
            with st.form("register_form"):
                name = st.text_input("Name", placeholder="Enter your full name")
                email = st.text_input("Email", placeholder="you@example.com")
                password = st.text_input("Password", type="password", placeholder="Create a password")
                submitted = st.form_submit_button("Register", key="register_submit", type="primary", use_container_width=True)

            if submitted:
                if not name.strip():
                    st.error("Enter your name.")
                elif not email.strip():
                    st.error("Enter your email address.")
                elif not validate_email(email):
                    st.error("Enter a valid email address.")
                elif not password:
                    st.error("Create a password to continue.")
                else:
                    try:
                        with st.spinner("Creating your account…"):
                            register_user(name, email, password)
                        st.session_state.login_email_input = email.strip()
                        st.session_state.registration_notice = True
                        _go("login")
                    except AuthAPIError as exc:
                        st.error(str(exc))

            _render_auth_switch("Already have an account?", "Login", "login", "register_to_login")
        st.markdown('<p class="fk-auth-foot">Your information is used to create your Flatkart account.</p>', unsafe_allow_html=True)


def _clear_auth_state() -> None:
    st.session_state.access_token = None
    st.session_state.token_type = None
    st.session_state.user_role = None
    st.session_state.logged_in = False
    st.session_state.user_info = None
    st.session_state.complaints_cache = None
    st.session_state.selected_complaint_id = None
    st.session_state.submission_result = None
    st.session_state.submission_detail = None
    st.session_state.contact_cache = {}
    st.session_state.pop("history_status_filter", None)
    st.session_state.pop("contact_complaint_select", None)
    st.session_state.pop("login_password_input", None)
    for key in ("handler_complaints", "handler_selected_id", "handler_notice", "handler_search", "handler_filter"):
        st.session_state.pop(key, None)
    st.session_state.current_page = "landing"


def run_app() -> None:
    apply_styles()
    st.session_state.setdefault("current_page", "landing")
    st.session_state.setdefault("access_token", None)
    st.session_state.setdefault("token_type", None)
    st.session_state.setdefault("logged_in", False)
    st.session_state.setdefault("user_role", None)
    st.session_state.setdefault("user_info", None)
    st.session_state.setdefault("complaints_cache", None)
    st.session_state.setdefault("selected_complaint_id", None)
    st.session_state.setdefault("submission_result", None)
    st.session_state.setdefault("submission_detail", None)
    st.session_state.setdefault("contact_cache", {})

    page = st.session_state.current_page
    if st.session_state.logged_in:
        if st.session_state.user_role == "user":
            if page in {"landing", "login", "register", "role_placeholder"}:
                page = "dashboard"
                st.session_state.current_page = page
            render_user_dashboard(page)
        elif st.session_state.user_role == "department_handler":
            from frontend.handler_dashboard import render_handler_dashboard

            if page in {"landing", "login", "register", "role_placeholder"}:
                page = "handler_dashboard"
                st.session_state.current_page = page
            if page not in {"handler_dashboard", "handler_complaints", "handler_detail"}:
                page = "handler_dashboard"
                st.session_state.current_page = page
            render_handler_dashboard(page)
        else:
            if page != "role_placeholder":
                st.session_state.current_page = "role_placeholder"
            st.markdown(
                '<style>section[data-testid="stSidebar"], header[data-testid="stHeader"] { display:none !important; }</style>',
                unsafe_allow_html=True,
            )
            render_role_placeholder()
        return

    if page in {
        "dashboard", "file_complaint", "track_complaint", "complaint_history",
        "complaint_detail", "department_contact", "role_placeholder",
    }:
        page = "landing"
        st.session_state.current_page = page

    st.markdown(
        '<style>section[data-testid="stSidebar"], header[data-testid="stHeader"] { display:none !important; }</style>',
        unsafe_allow_html=True,
    )
    if page == "register":
        render_register_page()
    elif page == "login":
        render_login_page()
    else:
        render_landing_page()
