"""Admin and super-admin dashboards using Flatkart's existing API and styles."""

from collections import Counter
from datetime import datetime
from html import escape

import streamlit as st

from frontend.admin_api import (
    AdminAPIError,
    create_department,
    create_user,
    delete_user,
    get_admin_complaints,
    get_admin_departments,
    get_admin_users,
    update_user,
)
from frontend.auth_api import validate_email
from frontend.complaint_api import ComplaintAPIError, get_current_user


STATUS_LABELS = {"pending": "Pending", "followed_up": "Followed Up", "processed": "Resolved"}
ADMIN_PAGES = {"admin_dashboard", "super_admin_dashboard", "admin_users", "admin_handlers", "admin_departments", "admin_complaints", "admin_complaint_detail", "admin_admins"}
ADMIN_STATE_KEYS = (
    "admin_users_cache", "admin_departments_cache", "admin_complaints_cache",
    "admin_user_form", "admin_user_view", "admin_user_delete", "admin_complaint_id",
    "admin_notice", "admin_search", "admin_status_filter", "admin_department_filter",
)


def _safe(value, fallback="—"):
    return fallback if value is None or value == "" else escape(str(value))


def _status_label(status):
    return STATUS_LABELS.get(status, str(status or "Unknown").replace("_", " ").title())


def _status_badge(status):
    status = str(status or "")
    key = status if status in STATUS_LABELS else "unknown"
    return f'<span class="fk-status fk-status-{key}">{escape(_status_label(status))}</span>'


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
        score = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{score * 100 if 0 <= score <= 1 else score:.1f}%"


def _clear_admin_state():
    for key in ADMIN_STATE_KEYS:
        st.session_state.pop(key, None)
    for key in list(st.session_state.keys()):
        if key.startswith(("admin_", "users_", "handlers_", "admins_", "department_")):
            st.session_state.pop(key, None)


def _logout(*, expired=False, rerun=True):
    # Clear widget-backed state at the start of the next run, before widgets are built.
    st.session_state.admin_cleanup_pending = True
    for key, value in {
        "access_token": None,
        "token_type": None,
        "user_role": None,
        "logged_in": False,
        "user_info": None,
        "complaints_cache": None,
        "selected_complaint_id": None,
        "submission_result": None,
        "submission_detail": None,
        "contact_cache": {},
        "current_page": "login" if expired else "landing",
    }.items():
        st.session_state[key] = value
    if expired:
        st.session_state.session_expired_notice = True
    if rerun:
        st.rerun()


def _handle_api_error(error):
    if error.unauthorized:
        _logout(expired=True)
    st.error(str(error))


def _load_data(cache_key, loader, loading_text):
    cached = st.session_state.get(cache_key)
    if isinstance(cached, list):
        return cached
    try:
        with st.spinner(loading_text):
            data = loader(st.session_state.access_token)
        st.session_state[cache_key] = data
        return data
    except AdminAPIError as error:
        _handle_api_error(error)
        if st.button("Try again", key=f"{cache_key}_retry"):
            st.session_state.pop(cache_key, None)
            st.rerun()
        return None


def _refresh_data(*keys):
    for key in keys or ("admin_users_cache", "admin_departments_cache", "admin_complaints_cache"):
        st.session_state.pop(key, None)


def _heading(title, subtitle):
    st.markdown(
        f'<div class="fk-page-heading"><h1>{escape(title)}</h1><p>{escape(subtitle)}</p></div>',
        unsafe_allow_html=True,
    )


def _show_notice():
    if notice := st.session_state.pop("admin_notice", None):
        st.success(notice)


def _sidebar(profile, role):
    navigation = [
        ("⌂  Dashboard", "admin_dashboard", "admin_nav_dashboard"),
        ("♙  Manage Users", "admin_users", "admin_nav_users"),
        ("▣  Department Handlers", "admin_handlers", "admin_nav_handlers"),
        ("▦  Departments", "admin_departments", "admin_nav_departments"),
        ("▤  Complaints", "admin_complaints", "admin_nav_complaints"),
    ]
    if role == "super_admin":
        navigation.append(("♛  Manage Admins", "admin_admins", "admin_nav_admins"))
    with st.sidebar:
        st.markdown('<div class="fk-sidebar-brand"><span class="fk-sidebar-mark">F</span>Flatkart</div>', unsafe_allow_html=True)
        st.caption(f"Signed in as {_safe(profile.get('name'), 'Administrator')}")
        st.markdown('<div class="fk-sidebar-label">ADMINISTRATION</div>', unsafe_allow_html=True)
        for label, page, key in navigation:
            if st.button(label, key=key, type="primary" if st.session_state.current_page == page else "secondary", width="stretch"):
                st.session_state.current_page = page
                st.rerun()
        st.markdown('<div class="fk-sidebar-divider"></div>', unsafe_allow_html=True)
        st.button("↪  Logout", key="admin_logout", width="stretch", on_click=lambda: _logout(rerun=False))


def _metric(label, value, marker):
    st.markdown(
        f'<article class="fk-admin-stat"><div class="fk-admin-stat-marker" aria-hidden="true">{marker}</div>'
        f'<div><div class="fk-stat-label">{escape(label)}</div><div class="fk-stat-value">{value}</div></div></article>',
        unsafe_allow_html=True,
    )


def _render_metrics(complaints):
    values = {
        "pending": sum(row.get("status") == "pending" for row in complaints),
        "followed_up": sum(row.get("status") == "followed_up" for row in complaints),
        "processed": sum(row.get("status") == "processed" for row in complaints),
    }
    items = [
        ("Total Complaints", len(complaints), "▤"),
        ("Pending", values["pending"], "◷"),
        ("Followed Up", values["followed_up"], "↗"),
        ("Resolved", values["processed"], "✓"),
    ]
    columns = st.columns(4, gap="medium")
    for column, (label, value, marker) in zip(columns, items):
        with column:
            _metric(label, value, marker)


def _department_counts(complaints, departments):
    counts = Counter(row.get("current_department") for row in complaints if row.get("current_department"))
    return [
        {"Department": department.get("name", ""), "Total": counts.get(department.get("name"), 0)}
        for department in departments
    ]


def _department_overview(complaints, departments):
    st.markdown('<div class="fk-section-title"><h2>Complaints by Department</h2></div>', unsafe_allow_html=True)
    if not departments:
        st.info("No departments have been created yet.")
        return
    st.dataframe(_department_counts(complaints, departments), hide_index=True, width="stretch")


def _complaint_row(item, key_prefix):
    complaint_id = item.get("id")
    text = str(item.get("complaint_text") or "")
    preview = text if len(text) <= 135 else text[:132].rstrip() + "…"
    with st.container(border=True):
        st.markdown(
            f'<div class="fk-complaint-top"><strong>Complaint #{_safe(complaint_id)}</strong>{_status_badge(item.get("status"))}</div>'
            f'<p class="fk-complaint-text">{escape(preview)}</p>',
            unsafe_allow_html=True,
        )
        a, b, c = st.columns(3)
        with a:
            st.caption("Current department")
            st.write(_safe(item.get("current_department")))
        with b:
            st.caption("Confidence")
            st.write(_confidence(item.get("confidence")))
        with c:
            st.caption("Created")
            st.write(_date(item.get("create_at")))
        if st.button("View complaint", key=f"{key_prefix}_{complaint_id}"):
            st.session_state.admin_complaint_id = complaint_id
            st.session_state.current_page = "admin_complaint_detail"
            st.rerun()


def _recent_complaints(complaints):
    st.markdown('<div class="fk-section-title"><h2>Recent Complaints</h2></div>', unsafe_allow_html=True)
    if not complaints:
        _empty("No complaints found.")
        return
    for row in complaints[:5]:
        _complaint_row(row, "admin_recent")
    if st.button("View All Complaints", key="admin_view_all_complaints", type="primary"):
        st.session_state.current_page = "admin_complaints"
        st.rerun()


def _admin_home(complaints, departments):
    _heading("Admin Dashboard", "Monitor complaints, users and department activity.")
    if complaints is None or departments is None:
        return
    _render_metrics(complaints)
    _department_overview(complaints, departments)
    _recent_complaints(complaints)


def _super_admin_home(complaints, departments, users):
    _heading("Super Admin Dashboard", "System-wide overview of complaints, users and administration.")
    if complaints is None or departments is None or users is None:
        return
    roles = Counter(row.get("role") for row in users)
    st.markdown('<div class="fk-section-title"><h2>System Account Overview</h2></div>', unsafe_allow_html=True)
    columns = st.columns(4, gap="medium")
    for column, (label, value, marker) in zip(columns, (
        ("Total Complaints", len(complaints), "▤"),
        ("Total Users", roles["user"], "♙"),
        ("Department Handlers", roles["department_handler"], "♟"),
        ("Administrators", roles["admin"], "♛"),
    )):
        with column:
            _metric(label, value, marker)
    st.markdown('<div class="fk-section-title"><h2>Complaint Overview</h2></div>', unsafe_allow_html=True)
    _render_metrics(complaints)
    _department_overview(complaints, departments)
    st.markdown('<div class="fk-section-title"><h2>Administrative Overview</h2></div>', unsafe_allow_html=True)
    admin_counts = [
        {"Category": "Users", "Total": roles["user"]},
        {"Category": "Department Handlers", "Total": roles["department_handler"]},
        {"Category": "Administrators", "Total": roles["admin"]},
        {"Category": "Departments", "Total": len(departments)},
    ]
    st.dataframe(admin_counts, hide_index=True, width="stretch")
    _recent_complaints(complaints)


def _empty(message):
    st.markdown(
        f'<div class="fk-empty-state"><div class="fk-empty-mark" aria-hidden="true">＋</div>'
        f'<h2>{escape(message)}</h2><p>Records will appear here as they are added.</p></div>',
        unsafe_allow_html=True,
    )
def _department_map(departments):
    return {row.get("id"): row.get("name", "") for row in departments}


def _render_table(rows, columns, *, empty):
    if not rows:
        _empty(empty)
        return False
    st.dataframe(rows, hide_index=True, width="stretch", column_order=columns)
    return True


def _user_options(rows):
    return {row.get("id"): row for row in rows}


def _action_bar(rows, key_prefix, *, edit=True, delete=True):
    by_id = _user_options(rows)
    if not by_id:
        return None
    ids = list(by_id)
    revision_key = f"{key_prefix}_selection_revision"
    revision = st.session_state.get(revision_key, 0)
    selected_id = st.selectbox(
        "Select a record for actions",
        ids,
        format_func=lambda user_id: f"{by_id[user_id].get('name', 'Account')} · #{user_id}",
        key=f"{key_prefix}_selected_{revision}",
    )
    view, edit_col, delete_col = st.columns([1, 1, 1])
    with view:
        if st.button("View", key=f"{key_prefix}_view", width="stretch"):
            st.session_state.admin_user_view = selected_id
    if edit:
        with edit_col:
            if st.button("Edit", key=f"{key_prefix}_edit", width="stretch"):
                st.session_state.admin_user_form = ("edit", selected_id, key_prefix)
                st.session_state.admin_form_revision = st.session_state.get("admin_form_revision", 0) + 1
                st.rerun()
    if delete:
        with delete_col:
            if st.button("Delete", key=f"{key_prefix}_delete", width="stretch"):
                st.session_state.admin_user_delete = (selected_id, key_prefix)
    return by_id[selected_id]


def _view_account(row, departments):
    if not row or st.session_state.get("admin_user_view") != row.get("id"):
        return
    st.markdown('<div class="fk-section-title"><h2>Account details</h2></div>', unsafe_allow_html=True)
    department_name = departments.get(row.get("department_id"), "—")
    info = [
        {"Field": "ID", "Value": row.get("id")},
        {"Field": "Name", "Value": row.get("name")},
        {"Field": "Email", "Value": row.get("email")},
        {"Field": "Role", "Value": row.get("role")},
        {"Field": "Department", "Value": department_name},
    ]
    st.dataframe(info, hide_index=True, width="stretch")


def _close_form():
    st.session_state.pop("admin_user_form", None)
    st.session_state.admin_form_revision = st.session_state.get("admin_form_revision", 0) + 1
    st.rerun()


def _account_form(mode, row, role, departments):
    is_create = mode == "create"
    title = "Create account" if is_create else "Edit account"
    st.markdown(f'<div class="fk-section-title"><h2>{title}</h2></div>', unsafe_allow_html=True)
    if role == "department_handler" and not departments:
        st.info("Unable to load departments. Try again before creating or editing a handler.")
        if st.button("Cancel", key="admin_form_cancel_empty"):
            _close_form()
        return

    revision = st.session_state.get("admin_form_revision", 0)
    form_id = f"{role}_{mode}_{row.get('id') if row else 'new'}_{revision}"
    with st.container(border=True):
        with st.form(f"admin_account_form_{form_id}"):
            name = st.text_input("Name", value=row.get("name", "") if row else "", key=f"admin_form_name_{form_id}")
            email = st.text_input("Email", value=row.get("email", "") if row else "", key=f"admin_form_email_{form_id}")
            password = st.text_input("Password" if is_create else "New password (optional)", type="password", key=f"admin_form_password_{form_id}")
            department_id = None
            if role == "user":
                st.selectbox("Role", ["user"], disabled=True, key=f"admin_form_role_{form_id}")
            elif role == "department_handler":
                dept_by_id = _department_map(departments)
                ids = list(dept_by_id)
                current = row.get("department_id") if row else None
                index = ids.index(current) if current in ids else 0
                department_id = st.selectbox(
                    "Department", ids, index=index,
                    format_func=lambda dept_id: dept_by_id[dept_id],
                    key=f"admin_form_department_{form_id}",
                )
            submitted = st.form_submit_button("Create" if is_create else "Save changes", type="primary", width="stretch")
        cancel, _ = st.columns([1, 4])
        with cancel:
            cancelled = st.button("Cancel", key=f"admin_form_cancel_{form_id}")

    if cancelled:
        _close_form()
    if not submitted:
        return
    if not name.strip():
        st.error("Enter a name.")
        return
    if not validate_email(email):
        st.error("Enter a valid email address.")
        return
    if is_create and not password:
        st.error("Enter a password.")
        return
    if role == "department_handler" and department_id is None:
        st.error("Select a department for this handler.")
        return

    payload = {"name": name.strip(), "email": email.strip()}
    if password:
        payload["password"] = password
    if is_create:
        payload["role"] = role
    if role == "department_handler":
        payload["department_id"] = department_id
    try:
        with st.spinner("Creating account..." if is_create else "Updating account..."):
            if is_create:
                create_user(st.session_state.access_token, payload)
            else:
                update_user(st.session_state.access_token, row["id"], payload)
        _refresh_data("admin_users_cache")
        st.session_state.pop("admin_user_form", None)
        st.session_state.admin_notice = (
            "Department handler created successfully." if is_create and role == "department_handler"
            else "Administrator created successfully." if is_create and role == "admin"
            else "Account created successfully." if is_create
            else "Account updated successfully."
        )
        st.session_state.admin_form_revision = revision + 1
        st.rerun()
    except AdminAPIError as error:
        _handle_api_error(error)


def _delete_confirmation(row, key_prefix):
    selection = st.session_state.get("admin_user_delete")
    if not row or not selection or selection[0] != row.get("id"):
        return
    st.warning("Are you sure you want to delete this account?")
    cancel, confirm = st.columns(2)
    with cancel:
        if st.button("Cancel", key=f"{key_prefix}_delete_cancel"):
            st.session_state.pop("admin_user_delete", None)
            st.rerun()
    with confirm:
        if st.button("Delete", key=f"{key_prefix}_delete_confirm", type="primary"):
            try:
                with st.spinner("Deleting account..."):
                    delete_user(st.session_state.access_token, row["id"])
                _refresh_data("admin_users_cache")
                st.session_state.pop("admin_user_delete", None)
                revision_key = f"{key_prefix}_selection_revision"
                st.session_state[revision_key] = st.session_state.get(revision_key, 0) + 1
                st.session_state.pop("admin_user_view", None)
                st.session_state.admin_notice = "Account deleted successfully."
                st.rerun()
            except AdminAPIError as error:
                _handle_api_error(error)


def _account_page(role, title, subtitle, cache, *, create_label, empty):
    all_users = _load_data("admin_users_cache", get_admin_users, "Loading users...")
    departments = (
        _load_data("admin_departments_cache", get_admin_departments, "Loading departments...")
        if role == "department_handler" else []
    )
    _heading(title, subtitle)
    _show_notice()
    if all_users is None or departments is None:
        return
    rows = [row for row in all_users if row.get("role") == role]
    names = _department_map(departments)
    table_rows = [
        {"ID": row.get("id"), "Name": row.get("name"), "Email": row.get("email"), "Role": row.get("role"), "Department": names.get(row.get("department_id"), "—")}
        for row in rows
    ]
    _render_table(table_rows, ["ID", "Name", "Email", "Role", "Department"], empty=empty)
    add_col, refresh_col = st.columns([1, 5])
    with add_col:
        if st.button(create_label, key=f"{cache}_create", type="primary"):
            st.session_state.admin_user_form = ("create", None, cache)
            st.session_state.admin_form_revision = st.session_state.get("admin_form_revision", 0) + 1
            st.rerun()
    with refresh_col:
        if st.button("Refresh list", key=f"{cache}_refresh"):
            _refresh_data("admin_users_cache", "admin_departments_cache")
            st.rerun()
    selected = _action_bar(rows, cache)
    _view_account(selected, names)
    _delete_confirmation(selected, cache)

    form = st.session_state.get("admin_user_form")
    if form and form[2] == cache:
        form_row = next((item for item in rows if item.get("id") == form[1]), None)
        if form[0] == "create" or form_row:
            _account_form(form[0], form_row, role, departments)


def _users_page():
    _account_page(
        "user", "Manage Users", "Create and maintain Flatkart user accounts.",
        "users", create_label="+ Create User", empty="No users found.",
    )


def _handlers_page():
    _account_page(
        "department_handler", "Department Handlers", "Manage the teams that resolve department complaints.",
        "handlers", create_label="+ Create Handler", empty="No department handlers have been created yet.",
    )


def _admins_page():
    _account_page(
        "admin", "Manage Administrators", "Create and maintain administrator accounts.",
        "admins", create_label="+ Create Admin", empty="No administrators found.",
    )


def _department_page():
    departments = _load_data("admin_departments_cache", get_admin_departments, "Loading departments...")
    _heading("Departments", "View departments and add a department when your teams grow.")
    _show_notice()
    if departments is None:
        return
    rows = [{"ID": row.get("id"), "Department Name": row.get("name"), "Email": row.get("email")} for row in departments]
    _render_table(rows, ["ID", "Department Name", "Email"], empty="No departments have been created yet.")
    create_col, refresh_col = st.columns([1, 5])
    with create_col:
        if st.button("+ Create Department", key="department_create", type="primary"):
            st.session_state.department_form_revision = st.session_state.get("department_form_revision", 0) + 1
            st.session_state.admin_show_department_form = True
    with refresh_col:
        if st.button("Refresh list", key="department_refresh"):
            _refresh_data("admin_departments_cache")
            st.rerun()
    if departments:
        ids = [row["id"] for row in departments]
        selected_id = st.selectbox("View department", ids, format_func=lambda value: next(row["name"] for row in departments if row["id"] == value), key="admin_department_selected")
        department = next(row for row in departments if row["id"] == selected_id)
        with st.container(border=True):
            st.markdown(f'<h3 class="fk-detail-section-title">{_safe(department.get("name"))}</h3>', unsafe_allow_html=True)
            st.caption(f"Department ID · {department.get('id')}")
            st.write(_safe(department.get("email")))
    if st.session_state.get("admin_show_department_form"):
        form_revision = st.session_state.get("department_form_revision", 0)
        with st.container(border=True):
            with st.form(f"admin_department_create_form_{form_revision}"):
                name = st.text_input("Department Name", key=f"department_form_name_{form_revision}")
                email = st.text_input("Department Email", key=f"department_form_email_{form_revision}")
                submitted = st.form_submit_button("Create Department", type="primary")
            cancel, _ = st.columns([1, 4])
            with cancel:
                cancelled = st.button("Cancel", key=f"department_form_cancel_{form_revision}")
        if cancelled:
            st.session_state.admin_show_department_form = False
            st.session_state.department_form_revision = form_revision + 1
            st.rerun()
        if submitted:
            if not name.strip():
                st.error("Enter a department name.")
            elif not validate_email(email):
                st.error("Enter a valid department email.")
            else:
                try:
                    with st.spinner("Creating department..."):
                        create_department(st.session_state.access_token, {"name": name.strip(), "email": email.strip()})
                    _refresh_data("admin_departments_cache")
                    st.session_state.admin_show_department_form = False
                    st.session_state.department_form_revision = form_revision + 1
                    st.session_state.admin_notice = "Department created successfully."
                    st.rerun()
                except AdminAPIError as error:
                    _handle_api_error(error)


def _complaint_table_row(row):
    text = str(row.get("complaint_text") or "")
    preview = text if len(text) < 100 else text[:97].rstrip() + "…"
    return {
        "Complaint ID": row.get("id"),
        "Complaint": preview,
        "Predicted Department": row.get("predicted_department"),
        "Current Department": row.get("current_department"),
        "Status": _status_label(row.get("status")),
        "Confidence": _confidence(row.get("confidence")),
        "Created": _date(row.get("create_at")),
    }


def _complaints_page():
    complaints = _load_data("admin_complaints_cache", get_admin_complaints, "Loading complaints...")
    departments = _load_data("admin_departments_cache", get_admin_departments, "Loading departments...")
    _heading("All Complaints", "Search and review complaints across every department.")
    _show_notice()
    if complaints is None or departments is None:
        return
    if not complaints:
        _empty("No complaints found.")
        return
    department_names = [row.get("name") for row in departments if row.get("name")]
    status_col, department_col = st.columns(2)
    with status_col:
        status_choice = st.selectbox("Status", ["All", "Pending", "Followed Up", "Resolved"], key="admin_status_filter")
    with department_col:
        department_choice = st.selectbox("Department", ["All", *department_names], key="admin_department_filter")
    query = st.text_input("Search by complaint ID or text", key="admin_search", placeholder="Enter an ID or a few words")
    status_value = {label: key for key, label in STATUS_LABELS.items()}
    filtered = [
        row for row in complaints
        if (status_choice == "All" or row.get("status") == status_value[status_choice])
        and (department_choice == "All" or row.get("current_department") == department_choice)
        and (not query.strip() or query.strip().lower() in str(row.get("id", "")).lower() or query.strip().lower() in str(row.get("complaint_text", "")).lower())
    ]
    if not filtered:
        _empty("No complaints found.")
        return
    st.caption(f"{len(filtered)} complaint{'s' if len(filtered) != 1 else ''}")
    _render_table([_complaint_table_row(row) for row in filtered], ["Complaint ID", "Complaint", "Predicted Department", "Current Department", "Status", "Confidence", "Created"], empty="No complaints found.")
    by_id = {row.get("id"): row for row in filtered}
    selected_id = st.selectbox("Select a complaint", list(by_id), format_func=lambda value: f"Complaint #{value}", key="admin_complaint_selected")
    if st.button("View details", key="admin_complaint_view", type="primary"):
        st.session_state.admin_complaint_id = selected_id
        st.session_state.current_page = "admin_complaint_detail"
        st.rerun()


def _complaint_detail(complaints):
    complaint_id = st.session_state.get("admin_complaint_id")
    row = next((item for item in complaints if item.get("id") == complaint_id), None)
    if st.button("← Back to all complaints", key="admin_complaint_back"):
        st.session_state.current_page = "admin_complaints"
        st.rerun()
    if row is None:
        _empty("No complaints found.")
        return
    _heading(f"Complaint #{row.get('id')}", "Review the complaint, its AI prediction and current status.")
    left, right = st.columns([1.4, .8], gap="large")
    with left:
        with st.container(border=True):
            st.markdown('<h3 class="fk-detail-section-title">Complaint</h3>', unsafe_allow_html=True)
            st.markdown(f'<div class="fk-full-complaint">{_safe(row.get("complaint_text"))}</div>', unsafe_allow_html=True)
            st.markdown('<h3 class="fk-detail-section-title">AI Prediction</h3>', unsafe_allow_html=True)
            first, second = st.columns(2)
            with first:
                st.caption("Predicted Department")
                st.write(_safe(row.get("predicted_department")))
            with second:
                st.caption("Current Department")
                st.write(_safe(row.get("current_department")))
            if row.get("predicted_department_id") != row.get("department_id"):
                st.info("Currently routed to another department.")
    with right:
        with st.container(border=True):
            st.markdown('<h3 class="fk-detail-section-title">Status</h3>', unsafe_allow_html=True)
            st.markdown(_status_badge(row.get("status")), unsafe_allow_html=True)
            st.caption("Confidence")
            st.write(_confidence(row.get("confidence")))
            st.caption("Created")
            st.write(_date(row.get("create_at")))


def render_admin_dashboard(page):
    try:
        with st.spinner("Loading your account..."):
            profile = get_current_user(st.session_state.access_token)
    except ComplaintAPIError as error:
        if error.unauthorized:
            _logout(expired=True)
        st.error("Unable to load your account. Please try again.")
        return

    role = profile.get("role")
    if role not in {"admin", "super_admin"}:
        _clear_admin_state()
        st.session_state.user_role = role
        st.session_state.current_page = "landing"
        st.rerun()
    if st.session_state.get("user_role") != role:
        _clear_admin_state()
    st.session_state.user_role = role
    if role == "admin" and page == "admin_admins":
        page = "admin_dashboard"
        st.session_state.current_page = page
    _sidebar(profile, role)

    if page in {"admin_dashboard", "super_admin_dashboard"}:
        complaints = _load_data("admin_complaints_cache", get_admin_complaints, "Loading dashboard...")
        departments = _load_data("admin_departments_cache", get_admin_departments, "Loading dashboard...")
        if role == "super_admin":
            users = _load_data("admin_users_cache", get_admin_users, "Loading dashboard...")
            _show_notice()
            _super_admin_home(complaints, departments, users)
        else:
            _show_notice()
            _admin_home(complaints, departments)
    elif page == "admin_users":
        _users_page()
    elif page == "admin_handlers":
        _handlers_page()
    elif page == "admin_departments":
        _department_page()
    elif page == "admin_complaints":
        _complaints_page()
    elif page == "admin_complaint_detail":
        complaints = _load_data("admin_complaints_cache", get_admin_complaints, "Loading complaints...")
        if complaints is not None:
            _complaint_detail(complaints)
    elif page == "admin_admins" and role == "super_admin":
        _admins_page()
