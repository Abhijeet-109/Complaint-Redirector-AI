"""Normal-user dashboard pages — Phase 5 SaaS redesign."""

from datetime import datetime
from html import escape

import streamlit as st

from frontend.complaint_api import (
    ComplaintAPIError,
    get_current_user,
    get_department_contact,
    get_my_complaints,
    submit_complaint,
)


STATUS_LABELS = {
    "pending": "Pending",
    "followed_up": "Followed Up",
    "processed": "Processed",
}


def _go(page: str) -> None:
    st.session_state.current_page = page
    st.rerun()


def _clear_session(*, expired: bool = False) -> None:
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
    st.session_state.current_page = "login" if expired else "landing"
    st.session_state.pop("history_status_filter", None)
    st.session_state.pop("contact_complaint_select", None)
    st.session_state.pop("login_password_input", None)
    if expired:
        st.session_state.session_expired_notice = True


def _show_api_error(error: ComplaintAPIError) -> None:
    if error.unauthorized:
        _clear_session(expired=True)
        st.rerun()
    st.error(str(error))


def _safe_text(value, fallback: str = "—") -> str:
    if value is None or value == "":
        return fallback
    return escape(str(value))


def _status_label(status: str) -> str:
    return STATUS_LABELS.get(status, status.replace("_", " ").title() if status else "Unknown")


def _status_badge(status: str) -> str:
    safe_status = escape(status or "unknown")
    style_key = status if status in STATUS_LABELS else "unknown"
    return f'<span class="fk-status fk-status-{style_key}">{escape(_status_label(status))}</span>'


def _format_date(value) -> str:
    if not value:
        return "—"
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return date.strftime("%b %d, %Y")
    except (TypeError, ValueError):
        return escape(str(value))


def _confidence(value) -> str:
    try:
        probability = float(value)
    except (TypeError, ValueError):
        return "—"
    percent = probability * 100 if 0 <= probability <= 1 else probability
    return f"{percent:.2f}%"


def _get_profile() -> dict | None:
    if st.session_state.get("user_info"):
        return st.session_state.user_info
    try:
        with st.spinner("Loading your account…"):
            profile = get_current_user(st.session_state.access_token)
        st.session_state.user_info = profile
        return profile
    except ComplaintAPIError as error:
        _show_api_error(error)
        return None


def _get_complaints() -> list[dict] | None:
    try:
        with st.spinner("Loading your complaints…"):
            complaints = get_my_complaints(st.session_state.access_token)
            if complaints:
                total = len(complaints)
                for i, c in enumerate(complaints):
                    c['display_id'] = total - i
            return complaints
    except ComplaintAPIError as error:
        _show_api_error(error)
        return None


def _sidebar(profile: dict) -> None:
    name = _safe_text(profile.get("name"), "Flatkart user")
    initial = str(name)[0].upper() if name and name != "—" else "U"
    role = profile.get("role", "user")

    with st.sidebar:
        st.markdown(
            '<div class="fk-sidebar-brand"><span class="fk-sidebar-mark">F</span>Flatkart</div>',
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div class="fk-sidebar-user">'
            f'<span class="fk-sidebar-avatar">{initial}</span>'
            f'<div><div class="fk-sidebar-uname">{name}</div>'
            f'<span class="fk-sidebar-urole fk-role-{role}">USER</span></div></div>',
            unsafe_allow_html=True,
        )
        st.markdown('<div class="fk-sidebar-label">YOUR ACCOUNT</div>', unsafe_allow_html=True)
        navigation = [
            ("⌂  Home", "dashboard", "user_nav_home"),
            ("＋  File Complaint", "file_complaint", "user_nav_file"),
            ("◷  Track Complaint", "track_complaint", "user_nav_track"),
            ("▤  Complaint History", "complaint_history", "user_nav_history"),
            ("@  Department Contact", "department_contact", "user_nav_contact"),
        ]
        for label, page, key in navigation:
            if st.button(
                label,
                key=key,
                type="primary" if st.session_state.current_page == page else "secondary",
                use_container_width=True,
            ):
                _go(page)
        st.markdown('<div class="fk-sidebar-divider"></div>', unsafe_allow_html=True)
        if st.button("↪  Logout", key="user_logout", use_container_width=True):
            _clear_session()
            st.rerun()


def _page_heading(title: str, subtitle: str) -> None:
    st.markdown(
        f'<div class="fk-page-heading"><h1>{escape(title)}</h1>'
        f'<p>{escape(subtitle)}</p></div>',
        unsafe_allow_html=True,
    )


def _empty_state(*, title: str = "No complaints yet", copy: str = "Your submitted complaints will appear here.") -> None:
    st.markdown(
        f'<div class="fk-empty-state"><div class="fk-empty-mark" aria-hidden="true">＋</div>'
        f'<h2>{escape(title)}</h2><p>{escape(copy)}</p></div>',
        unsafe_allow_html=True,
    )
    if st.button("File Your First Complaint", type="primary", key="empty_file_complaint"):
        _go("file_complaint")


def _complaint_card(complaint: dict, *, key_prefix: str) -> None:
    complaint_id = complaint.get("id")
    display_id = complaint.get("display_id", complaint_id)
    with st.container(border=True):
        st.markdown(
            f'<div class="fk-complaint-top"><strong>Complaint #{_safe_text(display_id)}</strong>'
            f'{_status_badge(str(complaint.get("status", "")))}</div>',
            unsafe_allow_html=True,
        )
        text = str(complaint.get("complaint_text") or "")
        summary = text if len(text) <= 180 else f"{text[:177].rstrip()}…"
        st.markdown(f'<p class="fk-complaint-text">{escape(summary)}</p>', unsafe_allow_html=True)
        left, middle, right = st.columns(3)
        with left:
            st.caption("Current department")
            st.write(_safe_text(complaint.get("current_department")))
        with middle:
            st.caption("AI confidence")
            st.write(_confidence(complaint.get("confidence")))
        with right:
            st.caption("Created")
            st.write(_format_date(complaint.get("create_at")))
        if st.button("View Details", key=f"{key_prefix}_details_{complaint_id}", type="primary", use_container_width=True):
            st.session_state.selected_complaint_id = complaint_id
            _go("complaint_detail")


def _stat_card(label: str, value: int, note: str, color_class: str = "total", icon: str = "▦") -> None:
    st.markdown(
        f'<article class="fk-stat-card fk-stat-{color_class}">'
        f'<div class="fk-stat-icon fk-stat-icon-{color_class}" aria-hidden="true">{icon}</div>'
        f'<div class="fk-stat-label">{escape(label)}</div>'
        f'<div class="fk-stat-value">{value}</div>'
        f'<div class="fk-stat-note">{escape(note)}</div></article>',
        unsafe_allow_html=True,
    )


def _render_home(profile: dict) -> None:
    complaints = _get_complaints()
    name = profile.get("name") or "there"
    st.markdown(
        f'<div class="fk-dashboard-welcome"><div class="fk-eyebrow">YOUR FLATKART DASHBOARD</div>'
        f'<h1>Welcome back, {escape(str(name))} <span aria-hidden="true">👋</span></h1>'
        "<p>Here's an overview of your complaints.</p></div>",
        unsafe_allow_html=True,
    )
    if complaints is None:
        return

    status_counts = {
        "pending": sum(item.get("status") == "pending" for item in complaints),
        "followed_up": sum(item.get("status") == "followed_up" for item in complaints),
        "processed": sum(item.get("status") == "processed" for item in complaints),
    }
    columns = st.columns(4, gap="medium")
    stats = [
        ("Total Complaints", len(complaints), "All submitted complaints", "total", "▦"),
        ("Pending", status_counts["pending"], "Awaiting an update", "pending", "◷"),
        ("Followed Up", status_counts["followed_up"], "In progress", "followed", "↗"),
        ("Processed", status_counts["processed"], "Marked processed", "resolved", "✓"),
    ]
    for column, (label, value, note, color, icon) in zip(columns, stats):
        with column:
            _stat_card(label, value, note, color, icon)

    st.markdown('<div class="fk-section-title"><h2>Recent Complaints</h2></div>', unsafe_allow_html=True)
    if not complaints:
        _empty_state()
        return
    for index, complaint in enumerate(complaints[:3]):
        _complaint_card(complaint, key_prefix=f"recent_{index}")
    if len(complaints) > 3 and st.button("View complaint history", key="home_history_link"):
        _go("complaint_history")


def _render_file_complaint() -> None:
    _page_heading("File a Complaint", "Tell us what happened and we'll find the right team.")
    with st.container(key="fk-form-card"):
        st.markdown('<h2 class="fk-form-title">Complaint details</h2>', unsafe_allow_html=True)
        st.markdown('<p class="fk-form-copy">Describe your issue in your own words. Your account details are added securely.</p>', unsafe_allow_html=True)
        with st.form("complaint_submit_form"):
            complaint_text = st.text_area(
                "Describe your issue",
                placeholder="Tell us what happened…",
                height=190,
                max_chars=10000,
            )
            submitted = st.form_submit_button(
                "Submit Complaint", type="primary", use_container_width=True
            )

        if submitted:
            if not complaint_text.strip():
                st.error("Please describe your issue before submitting.")
            else:
                try:
                    with st.spinner("Analyzing your complaint…"):
                        result = submit_complaint(
                            st.session_state.access_token, complaint_text
                        )
                    st.session_state.submission_result = result
                    st.session_state.complaints_cache = None
                    st.session_state.submission_detail = None
                    try:
                        current_items = get_my_complaints(st.session_state.access_token)
                        if current_items:
                            total = len(current_items)
                            for i, c in enumerate(current_items):
                                c['display_id'] = total - i
                        st.session_state.complaints_cache = current_items
                        st.session_state.submission_detail = next(
                            (item for item in current_items if item.get("id") == result.get("id")),
                            None,
                        )
                    except ComplaintAPIError as error:
                        if error.unauthorized:
                            _show_api_error(error)
                    st.rerun()
                except ComplaintAPIError as error:
                    _show_api_error(error)

        result = st.session_state.get("submission_result")
        if result:
            detail = st.session_state.get("submission_detail") or {}
            display_id = detail.get("display_id", result.get("id"))
            st.markdown(
                '<div class="fk-alert fk-alert-success">✓ Complaint submitted successfully!</div>',
                unsafe_allow_html=True,
            )
            with st.container(border=True):
                st.markdown(f'<h3 style="margin:0 0 .6rem;color:#10234B;">Complaint #{_safe_text(display_id)}</h3>', unsafe_allow_html=True)
                c1, c2, c3 = st.columns(3)
                with c1:
                    st.caption("Department")
                    st.write(_safe_text(detail.get("current_department")))
                with c2:
                    st.caption("AI Confidence")
                    st.write(_confidence(result.get("confidence")))
                with c3:
                    st.caption("Status")
                    st.markdown(_status_badge(str(result.get("status", ""))), unsafe_allow_html=True)
            if st.button("View Complaint", type="primary", key="view_new_complaint"):
                st.session_state.selected_complaint_id = result.get("id")
                _go("track_complaint")


def _render_track() -> None:
    _page_heading("Track Complaint", "See the latest status and routing details for your complaints.")
    complaints = _get_complaints()
    if complaints is None:
        return
    if not complaints:
        _empty_state()
        return
    selected_id = st.session_state.get("selected_complaint_id")
    if selected_id:
        selected = next((item for item in complaints if item.get("id") == selected_id), None)
        if selected:
            st.markdown('<div class="fk-selected-note">Your selected complaint</div>', unsafe_allow_html=True)
            _complaint_card(selected, key_prefix="selected_track")
            st.markdown('<div class="fk-list-divider"></div>', unsafe_allow_html=True)
    for index, complaint in enumerate(complaints):
        if complaint.get("id") != selected_id:
            _complaint_card(complaint, key_prefix=f"track_{index}")


def _render_history() -> None:
    _page_heading("Complaint History", "Review and filter the complaints you've submitted.")
    complaints = _get_complaints()
    if complaints is None:
        return
    if not complaints:
        _empty_state()
        return

    filter_label = st.selectbox(
        "Filter complaints",
        ["All", "Pending", "Followed Up", "Processed"],
        key="history_status_filter",
    )
    query = st.text_input("Search by complaint ID or text", placeholder="Search your complaints…")
    status_for_label = {label: key for key, label in STATUS_LABELS.items()}
    filtered = complaints
    if filter_label != "All":
        filtered = [item for item in filtered if item.get("status") == status_for_label[filter_label]]
    if query.strip():
        term = query.strip().lower().lstrip("#")
        filtered = [
            item for item in filtered
            if term in str(item.get("id", "")).lower()
            or term in str(item.get("complaint_text", "")).lower()
        ]
    if not filtered:
        _empty_state(title="No matching complaints", copy="Try another status or search term.")
        return
    st.caption(f"{len(filtered)} complaint{'s' if len(filtered) != 1 else ''}")
    for index, complaint in enumerate(filtered):
        _complaint_card(complaint, key_prefix=f"history_{index}")


def _selected_complaint(complaints: list[dict]) -> dict | None:
    selected_id = st.session_state.get("selected_complaint_id")
    return next((item for item in complaints if item.get("id") == selected_id), None)


def _render_detail() -> None:
    complaints = _get_complaints()
    if complaints is None:
        return
    complaint = _selected_complaint(complaints)
    if complaint is None:
        st.markdown(
            '<div class="fk-alert fk-alert-info">Choose a complaint from Track Complaint or Complaint History to view its details.</div>',
            unsafe_allow_html=True,
        )
        if st.button("Back to Track Complaint", key="detail_back_to_track"):
            _go("track_complaint")
        return

    complaint_id = complaint.get("id")
    display_id = complaint.get("display_id", complaint_id)

    if st.button("← Back to Track Complaint", key="detail_back_track"):
        _go("track_complaint")

    st.markdown(
        f'<div class="fk-page-heading"><h1>Complaint #{_safe_text(display_id)} '
        f'{_status_badge(str(complaint.get("status", "")))}</h1>'
        f'<p>Your complaint details and current routing information.</p></div>',
        unsafe_allow_html=True,
    )

    left, right = st.columns([1.4, 0.8], gap="large")
    with left:
        with st.container(border=True):
            st.markdown('<h2 class="fk-detail-section-title">Complaint</h2>', unsafe_allow_html=True)
            st.markdown(f'<div class="fk-full-complaint">{escape(str(complaint.get("complaint_text") or ""))}</div>', unsafe_allow_html=True)

        with st.container(border=True):
            st.markdown('<h2 class="fk-detail-section-title">AI Classification</h2>', unsafe_allow_html=True)
            c1, c2 = st.columns(2)
            with c1:
                st.caption("Predicted Department")
                st.write(_safe_text(complaint.get("predicted_department")))
            with c2:
                st.caption("Current Department")
                st.write(_safe_text(complaint.get("current_department")))

    with right:
        with st.container(border=True):
            st.markdown('<h2 class="fk-detail-section-title">Details</h2>', unsafe_allow_html=True)
            st.caption("Status")
            st.markdown(_status_badge(str(complaint.get("status", ""))), unsafe_allow_html=True)
            st.write("")
            st.caption("AI Confidence")
            st.write(_confidence(complaint.get("confidence")))
            st.write("")
            st.caption("Created")
            st.write(_format_date(complaint.get("create_at")))

    if st.button("Get Department Contact", type="primary", key="detail_department_contact"):
        st.session_state.selected_complaint_id = complaint_id
        _go("department_contact")


def _render_contact() -> None:
    _page_heading("Department Contact", "Find the right contact for a specific complaint.")
    st.markdown(
        '<p class="fk-page-intro">This is the contact email for the department currently handling your complaint.</p>',
        unsafe_allow_html=True,
    )
    complaints = _get_complaints()
    if complaints is None:
        return
    if not complaints:
        _empty_state()
        return

    selected_id = st.selectbox(
        "Select a complaint",
        options=[item.get("id") for item in complaints],
        index=next(
            (index for index, item in enumerate(complaints)
             if item.get("id") == st.session_state.get("selected_complaint_id")),
            0,
        ),
        format_func=lambda cid: f"Complaint #{next((c.get('display_id', cid) for c in complaints if c.get('id') == cid), cid)}",
        key="contact_complaint_select",
    )
    complaint = next((item for item in complaints if item.get("id") == selected_id), {})
    display_id = complaint.get("display_id", selected_id)
    cache = st.session_state.setdefault("contact_cache", {})
    contact = cache.get(selected_id)
    if contact is None:
        try:
            with st.spinner("Loading department contact…"):
                contact = get_department_contact(
                    st.session_state.access_token, selected_id
                )
            cache[selected_id] = contact
        except ComplaintAPIError as error:
            _show_api_error(error)
            return

    with st.container(border=True):
        st.caption(f"For complaint #{display_id} · {_status_label(str(complaint.get('status', '')))}")
        st.markdown(f'<div class="fk-contact-name">{_safe_text(contact.get("department"))}</div>', unsafe_allow_html=True)
        st.caption("Contact email")
        st.code(str(contact.get("email") or ""), language=None)


def render_user_dashboard(page: str) -> None:
    profile = _get_profile()
    if profile is None:
        return
    if profile.get("role") != "user":
        st.session_state.user_role = profile.get("role")
        _go("role_placeholder")

    _sidebar(profile)
    renderers = {
        "dashboard": lambda: _render_home(profile),
        "file_complaint": _render_file_complaint,
        "track_complaint": _render_track,
        "complaint_history": _render_history,
        "complaint_detail": _render_detail,
        "department_contact": _render_contact,
    }
    renderers.get(page, lambda: _render_home(profile))()


def render_role_placeholder() -> None:
    st.markdown(
        '<div class="fk-role-placeholder"><div class="fk-eyebrow">FLATKART ACCOUNT</div>'
        '<h1>Your workspace is coming soon</h1>'
        '<p>This account is signed in. Its role-specific workspace will be available in a later phase.</p></div>',
        unsafe_allow_html=True,
    )
    if st.button("Logout", key="role_logout", type="primary"):
        _clear_session()
        st.rerun()
