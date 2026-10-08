"""Department-handler dashboard and assigned complaint workflow — Phase 5 redesign."""

from datetime import datetime
from html import escape

import streamlit as st

from frontend.complaint_api import ComplaintAPIError, get_current_user
from frontend.handler_api import (
    HandlerAPIError,
    get_handler_complaints,
    get_handler_departments,
    redirect_handler_complaint,
    update_handler_complaint_status,
)


STATUS_LABELS = {"pending": "Pending", "followed_up": "Followed Up", "processed": "Resolved"}
FILTERS = {"All": None, "Pending": "pending", "Followed Up": "followed_up", "Resolved": "processed"}


def _safe(value, fallback="—"):
    return fallback if value is None or value == "" else escape(str(value))


def _date(value):
    if not value:
        return "—"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.strftime("%b %d, %Y")
    except (TypeError, ValueError):
        return _safe(value)


def _confidence(value):
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{confidence * 100 if 0 <= confidence <= 1 else confidence:.1f}%"


def _status_badge(status):
    key = status if status in STATUS_LABELS else "unknown"
    label = STATUS_LABELS.get(status, "Unknown")
    return f'<span class="fk-status fk-status-{key}">{label}</span>'


def _clear_handler_state():
    for key in ("handler_complaints", "handler_selected_id", "handler_notice", "handler_search", "handler_filter", "handler_departments"):
        st.session_state.pop(key, None)


def _logout():
    _clear_handler_state()
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
    st.session_state.current_page = "landing"
    st.session_state.selected_complaint_id = None
    st.rerun()


def _expire_session():
    _clear_handler_state()
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
    st.session_state.current_page = "login"
    st.session_state.session_expired_notice = True
    st.rerun()


def _api_error(error):
    if error.unauthorized:
        _expire_session()
    st.error(str(error))


def _load_complaints(force=False):
    if not force and isinstance(st.session_state.get("handler_complaints"), list):
        return st.session_state.handler_complaints
    try:
        with st.spinner("Loading assigned complaints..."):
            complaints = get_handler_complaints(st.session_state.access_token)
        st.session_state.handler_complaints = complaints
        return complaints
    except HandlerAPIError as error:
        _api_error(error)
        return None


def _load_departments():
    """Load departments for the redirect dropdown from the handler-safe endpoint."""
    cached = st.session_state.get("handler_departments")
    if isinstance(cached, list):
        return cached
    try:
        departments = get_handler_departments(st.session_state.access_token)
        st.session_state.handler_departments = departments
        return departments
    except HandlerAPIError:
        return None


def _set_page(page):
    st.session_state.current_page = page
    st.rerun()


def _sidebar(profile):
    name = _safe(profile.get("name"), "Department handler")
    initial = str(name)[0].upper() if name and name != "—" else "H"
    role = profile.get("role", "department_handler")
    role_label = "DEPARTMENT HANDLER"

    with st.sidebar:
        st.markdown(
            '<div class="fk-sidebar-brand"><span class="fk-sidebar-mark">F</span>Flatkart</div>',
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div class="fk-sidebar-user">'
            f'<span class="fk-sidebar-avatar">{initial}</span>'
            f'<div><div class="fk-sidebar-uname">{name}</div>'
            f'<span class="fk-sidebar-urole fk-role-{role}">{role_label}</span></div></div>',
            unsafe_allow_html=True,
        )
        st.markdown('<div class="fk-sidebar-label">WORKSPACE</div>', unsafe_allow_html=True)
        for label, page, key in (
            ("⌂  Dashboard", "handler_dashboard", "handler_nav_dashboard"),
            ("▤  Complaints", "handler_complaints", "handler_nav_complaints"),
        ):
            if st.button(label, key=key, type="primary" if st.session_state.current_page == page else "secondary", use_container_width=True):
                _set_page(page)
        st.markdown('<div class="fk-sidebar-divider"></div>', unsafe_allow_html=True)
        if st.button("↪  Logout", key="handler_logout", use_container_width=True):
            _logout()


def _heading(title, description):
    st.markdown(
        f'<div class="fk-page-heading"><h1>{escape(title)}</h1><p>{escape(description)}</p></div>',
        unsafe_allow_html=True,
    )


def _stat(label, value, icon, color_class="total"):
    st.markdown(
        f'<article class="fk-stat-card fk-stat-{color_class}">'
        f'<div class="fk-stat-icon fk-stat-icon-{color_class}" aria-hidden="true">{icon}</div>'
        f'<div class="fk-stat-label">{label}</div>'
        f'<div class="fk-stat-value">{value}</div></article>',
        unsafe_allow_html=True,
    )


def _select_complaint(complaint_id):
    st.session_state.handler_selected_id = complaint_id
    _set_page("handler_detail")


def _complaint_card(item, *, prefix):
    complaint_id = item.get("id")
    preview = str(item.get("complaint_text") or "")
    preview = preview if len(preview) <= 150 else preview[:147].rstrip() + "…"
    with st.container(border=True):
        st.markdown(
            f'<div class="fk-complaint-top"><strong>Complaint #{_safe(complaint_id)}</strong>'
            f'{_status_badge(item.get("status"))}</div><p class="fk-complaint-text">{escape(preview)}</p>',
            unsafe_allow_html=True,
        )
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.caption("Current department")
            st.write(_safe(item.get("current_department")))
        with col2:
            st.caption("Predicted department")
            st.write(_safe(item.get("predicted_department")))
        with col3:
            st.caption("Confidence")
            st.write(_confidence(item.get("confidence")))
        with col4:
            st.caption("Created")
            st.write(_date(item.get("create_at")))
        if item.get("user_name"):
            st.caption(f"Customer: {_safe(item.get('user_name'))}")
        if st.button("View Complaint", key=f"{prefix}_open_{complaint_id}", type="primary", use_container_width=True):
            _select_complaint(complaint_id)


def _empty_state():
    st.markdown(
        '<div class="fk-empty-state"><div class="fk-empty-mark" aria-hidden="true">✓</div>'
        '<h2>No complaints assigned</h2><p>New complaints routed to your department will appear here.</p></div>',
        unsafe_allow_html=True,
    )


def _dashboard(complaints, profile):
    dept_name = ""
    if profile.get("department_id"):
        # Try to find department name from complaints
        for item in (complaints or []):
            if item.get("current_department"):
                dept_name = item.get("current_department")
                break

    heading_subtitle = f"Manage and resolve complaints assigned to your department."
    if dept_name:
        heading_subtitle = f"{dept_name} · Manage and resolve complaints assigned to your department."

    _heading("Department Handler", heading_subtitle)
    if not complaints:
        _empty_state()
        return
    counts = {status: sum(item.get("status") == status for item in complaints) for status in STATUS_LABELS}
    columns = st.columns(4, gap="medium")
    stats = (
        ("Assigned", len(complaints), "▦", "total"),
        ("Pending", counts["pending"], "◷", "pending"),
        ("Followed Up", counts["followed_up"], "↗", "followed"),
        ("Resolved", counts["processed"], "✓", "resolved"),
    )
    for column, (label, value, icon, color) in zip(columns, stats):
        with column:
            _stat(label, value, icon, color)

    st.markdown('<div class="fk-section-title"><h2>Recent Complaints</h2></div>', unsafe_allow_html=True)
    for item in complaints[:5]:
        _complaint_card(item, prefix="handler_recent")


def _complaints_page(complaints):
    _heading("Assigned Complaints", "Review and update complaints routed to your department.")
    if not complaints:
        _empty_state()
        return
    filters = st.columns(4, gap="small")
    selected = st.session_state.get("handler_filter", "All")
    for col, label in zip(filters, FILTERS):
        with col:
            if st.button(label, key=f"handler_filter_{label}", type="primary" if selected == label else "secondary", use_container_width=True):
                st.session_state.handler_filter = label
                st.rerun()
    query = st.text_input("Search complaints", key="handler_search", placeholder="Search by complaint ID or text")
    status_filter = FILTERS.get(st.session_state.get("handler_filter", "All"))
    query = query.strip().lower()
    filtered = [
        item for item in complaints
        if (status_filter is None or item.get("status") == status_filter)
        and (not query or query in str(item.get("id", "")).lower() or query in str(item.get("complaint_text", "")).lower())
    ]
    if not filtered:
        st.markdown(
            '<div class="fk-alert fk-alert-info">No complaints match these filters.</div>',
            unsafe_allow_html=True,
        )
        return
    st.caption(f"{len(filtered)} complaint{'s' if len(filtered) != 1 else ''}")
    for item in filtered:
        _complaint_card(item, prefix="handler_list")


def _perform_status_action(complaint_id, status):
    try:
        with st.spinner("Updating complaint..."):
            update_handler_complaint_status(st.session_state.access_token, complaint_id, status)
            st.session_state.handler_complaints = get_handler_complaints(st.session_state.access_token)
        st.session_state.handler_notice = "Complaint updated successfully."
        st.rerun()
    except HandlerAPIError as error:
        _api_error(error)


def _detail(complaints):
    complaint_id = st.session_state.get("handler_selected_id")
    item = next((row for row in complaints if row.get("id") == complaint_id), None)
    if item is None:
        st.markdown(
            '<div class="fk-alert fk-alert-warning">This complaint is no longer in your assigned list.</div>',
            unsafe_allow_html=True,
        )
        if st.button("← Back to complaints", key="handler_detail_back_missing"):
            _set_page("handler_complaints")
        return

    if st.button("← Back to complaints", key="handler_detail_back"):
        _set_page("handler_complaints")

    # Title row
    st.markdown(
        f'<div class="fk-page-heading"><h1>Complaint #{_safe(item.get("id"))} '
        f'{_status_badge(item.get("status"))}</h1>'
        f'<p>Review the complaint and choose its next status.</p></div>',
        unsafe_allow_html=True,
    )
    if notice := st.session_state.pop("handler_notice", None):
        st.markdown(f'<div class="fk-alert fk-alert-success">✓ {escape(notice)}</div>', unsafe_allow_html=True)

    # Main content
    left, right = st.columns([1.4, 0.8], gap="large")
    with left:
        with st.container(border=True):
            st.markdown('<h3 class="fk-detail-section-title">Complaint</h3>', unsafe_allow_html=True)
            st.markdown(f'<div class="fk-full-complaint">{_safe(item.get("complaint_text"))}</div>', unsafe_allow_html=True)

        # Customer info section
        with st.container(border=True):
            st.markdown('<h3 class="fk-detail-section-title">Customer</h3>', unsafe_allow_html=True)
            c1, c2 = st.columns(2)
            with c1:
                st.caption("Name")
                st.write(_safe(item.get("user_name")))
            with c2:
                st.caption("Email")
                st.write(_safe(item.get("user_email")))

        # AI routing section
        with st.container(border=True):
            st.markdown('<h3 class="fk-detail-section-title">AI Routing</h3>', unsafe_allow_html=True)
            c1, c2 = st.columns(2)
            with c1:
                st.caption("Predicted department")
                st.write(_safe(item.get("predicted_department")))
            with c2:
                st.caption("Current department")
                st.write(_safe(item.get("current_department")))

    with right:
        with st.container(border=True):
            st.markdown('<h3 class="fk-detail-section-title">Complaint Details</h3>', unsafe_allow_html=True)
            st.caption("Status")
            st.markdown(_status_badge(item.get("status")), unsafe_allow_html=True)
            st.write("")
            st.caption("Confidence")
            st.write(_confidence(item.get("confidence")))
            st.write("")
            st.caption("Created")
            st.write(_date(item.get("create_at")))

    # Actions section
    st.markdown('<div class="fk-section-title"><h2>Actions</h2></div>', unsafe_allow_html=True)
    pending_col, followed_col, resolved_col = st.columns(3, gap="small")
    for column, label, status, key in (
        (pending_col, "Keep Pending", "pending", "handler_status_pending"),
        (followed_col, "Mark Followed Up", "followed_up", "handler_status_followed"),
        (resolved_col, "Mark Resolved", "processed", "handler_status_resolved"),
    ):
        with column:
            if st.button(label, key=key, type="primary" if status == "processed" else "secondary", use_container_width=True):
                _perform_status_action(item["id"], status)

    # Redirect panel
    st.markdown(
        '<div class="fk-redirect-panel">'
        '<h3 class="fk-redirect-title">Redirect Complaint</h3>'
        '<p class="fk-redirect-copy">Send this complaint to another department for handling.</p>'
        '</div>',
        unsafe_allow_html=True,
    )

    current_dept = _safe(item.get("current_department"))
    st.markdown(
        f'<p style="margin:.4rem 0 .6rem;font-size:.88rem;color:var(--fk-muted);">'
        f'Currently assigned to: <span class="fk-redirect-current">{current_dept}</span></p>',
        unsafe_allow_html=True,
    )

    departments = _load_departments()
    if departments is None:
        st.markdown(
            '<div class="fk-alert fk-alert-warning">Unable to load departments. Please try again.</div>',
            unsafe_allow_html=True,
        )
        if st.button("Retry loading departments", key="handler_dept_retry"):
            st.session_state.pop("handler_departments", None)
            st.rerun()
    elif not departments:
        st.markdown(
            '<div class="fk-alert fk-alert-info">No departments available for redirect.</div>',
            unsafe_allow_html=True,
        )
    else:
        # Filter out current department
        other_departments = [d for d in departments if d.get("id") != item.get("department_id")]
        if not other_departments:
            st.markdown(
                '<div class="fk-alert fk-alert-info">No other departments available for redirect.</div>',
                unsafe_allow_html=True,
            )
        else:
            dept_map = {d["id"]: d["name"] for d in other_departments}
            selected_dept_id = st.selectbox(
                "Select department",
                options=list(dept_map.keys()),
                format_func=lambda d_id: dept_map[d_id],
                key="handler_redirect_dept",
                label_visibility="collapsed",
            )

            if st.button("Redirect Complaint", key="handler_redirect_btn", type="primary", use_container_width=True):
                try:
                    with st.spinner("Redirecting complaint..."):
                        result = redirect_handler_complaint(
                            st.session_state.access_token,
                            item["id"],
                            selected_dept_id,
                        )
                    # Force reload complaints
                    st.session_state.pop("handler_complaints", None)
                    target_name = dept_map.get(selected_dept_id, "the selected department")

                    email_sent = result.get("email_sent", True)
                    if email_sent:
                        st.session_state.handler_notice = f"Complaint #{item['id']} was redirected to {target_name}."
                    else:
                        st.session_state.handler_notice = f"Complaint #{item['id']} was redirected to {target_name}, but the department notification could not be sent."

                    _set_page("handler_complaints")
                except HandlerAPIError as error:
                    _api_error(error)


def render_handler_dashboard(page):
    try:
        with st.spinner("Loading your account..."):
            profile = get_current_user(st.session_state.access_token)
    except ComplaintAPIError as error:
        if error.unauthorized:
            _expire_session()
        st.error("Unable to load your account. Please try again.")
        return
    if profile.get("role") != "department_handler":
        _clear_handler_state()
        st.session_state.user_role = profile.get("role")
        st.session_state.current_page = "role_placeholder"
        st.info("This page is only available to department handlers.")
        return
    _sidebar(profile)
    complaints = _load_complaints()
    if complaints is None:
        st.error("Unable to load your assigned complaints. Please try again.")
        if st.button("Try again", key="handler_load_retry"):
            _load_complaints(force=True)
            st.rerun()
        return
    if notice := st.session_state.pop("handler_notice", None):
        st.markdown(f'<div class="fk-alert fk-alert-success">✓ {escape(notice)}</div>', unsafe_allow_html=True)
    if page == "handler_complaints":
        _complaints_page(complaints)
    elif page == "handler_detail":
        _detail(complaints)
    else:
        _dashboard(complaints, profile)
