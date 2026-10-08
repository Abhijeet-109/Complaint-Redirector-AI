"""Flatkart visual tokens and Streamlit presentation styles — Phase 5 SaaS redesign."""

DESIGN_TOKENS = {
    "color": {
        "primary": "#1769E8",
        "primary_dark": "#104FB4",
        "accent": "#F7C948",
        "ink": "#14213D",
        "muted": "#52627A",
        "background": "#F5F8FC",
        "surface": "#FFFFFF",
        "border": "#E1E8F0",
        "success": "#138A68",
        "warning": "#A96500",
        "danger": "#B42318",
    },
    "radius": {"card": "18px", "control": "10px", "pill": "999px"},
    "spacing": {"section": "clamp(2.5rem, 6vw, 5rem)", "card": "1.5rem"},
}


APP_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
:root {
  --fk-blue: #1769E8; --fk-blue-dark: #104FB4; --fk-yellow: #F7C948;
  --fk-ink: #14213D; --fk-muted: #52627A; --fk-bg: #F5F8FC;
  --fk-surface: #FFFFFF; --fk-border: #E1E8F0; --fk-green: #138A68;
  --fk-radius-card: 16px; --fk-radius-control: 10px;
}
*, *::before, *::after { font-family: 'Plus Jakarta Sans', sans-serif; }
#MainMenu, footer { visibility: hidden; height: 0; }
header[data-testid="stHeader"] { background:transparent !important; }
.stApp { background: var(--fk-bg); color: var(--fk-ink); }
.block-container { max-width: 1200px; padding: 1rem clamp(1rem, 3vw, 2.25rem) 3rem; }
button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 3px solid #F0B928 !important; outline-offset: 2px !important;
}

/* ---------- INPUTS ---------- */
div[data-testid="stTextInput"] label { color: var(--fk-ink); font-weight: 650; font-size: .94rem; }
div[data-baseweb="input"] { min-height: 46px; border: 1px solid var(--fk-border); border-radius: var(--fk-radius-control); background: white; }
div[data-baseweb="input"]:focus-within { border-color: var(--fk-blue); box-shadow: 0 0 0 3px rgba(23,105,232,.14); }
div[data-baseweb="input"] input { color: var(--fk-ink); font-size: 1rem; }
div[data-testid="stTextArea"] label { color:var(--fk-ink) !important; font-weight:650; }
.stApp [data-testid="stTextArea"] [data-baseweb="textarea"],
.stApp [data-testid="stTextArea"] textarea,
.stApp textarea[data-baseweb="textarea"] {
  background:#FFFFFF !important; background-color:#FFFFFF !important;
  color:#14213D !important; -webkit-text-fill-color:#14213D !important;
  caret-color:#14213D !important;
}
.stApp [data-testid="stTextArea"] [data-baseweb="textarea"] { border:1px solid var(--fk-border) !important; border-radius:var(--fk-radius-control) !important; }
.stApp [data-testid="stTextArea"] [data-baseweb="textarea"]:focus-within { border-color:var(--fk-blue) !important; box-shadow:0 0 0 3px rgba(23,105,232,.14) !important; }
.stApp [data-testid="stTextArea"] textarea::placeholder,
.stApp textarea[data-baseweb="textarea"]::placeholder { color:#758198 !important; -webkit-text-fill-color:#758198 !important; }
div[data-testid="stForm"] { border: 0; padding: 0; background: transparent; }
.st-key-auth_card { padding: clamp(1.3rem,4vw,2rem); background: white; border: 1px solid var(--fk-border); border-radius: var(--fk-radius-card); box-shadow: 0 12px 36px rgba(20,33,61,.07); }

/* ---------- BUTTONS ---------- */
.stApp button {
  min-height: 44px; border-radius: var(--fk-radius-control); font-weight: 700;
  padding: .6rem 1rem; transition: background-color .15s ease, box-shadow .15s ease, transform .1s ease;
  background-color: #FFFFFF !important; border: 1px solid var(--fk-border) !important;
  color: var(--fk-ink) !important;
}
div[data-testid="stButton"] button div, div[data-testid="stFormSubmitButton"] button div {
  color: inherit !important;
}
button[kind="primary"] {
  background-color: var(--fk-blue) !important; border-color: var(--fk-blue) !important;
  color: #FFFFFF !important;
}
button[kind="primary"]:hover {
  background-color: var(--fk-blue-dark) !important; border-color: var(--fk-blue-dark) !important;
  color: #FFFFFF !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(23,105,232,.25) !important;
}
button:not([kind="primary"]):hover {
  background-color: #F0F6FF !important; border-color: #C8DBF5 !important; color: var(--fk-blue-dark) !important;
}
.st-key-header_register button, .st-key-file_complaint button, .st-key-get_started button,
.st-key-register_submit button { background-color:var(--fk-yellow) !important; border-color:var(--fk-yellow) !important; color:#17243B !important; }
.st-key-header_register button div, .st-key-file_complaint button div, .st-key-get_started button div,
.st-key-register_submit button div { color:#17243B !important; }
.st-key-header_register button:hover, .st-key-file_complaint button:hover, .st-key-get_started button:hover,
.st-key-register_submit button:hover { background-color:#EAB52C !important; border-color:#EAB52C !important; color:#17243B !important; }

/* ---------- LANDING & AUTH ---------- */
.fk-header { display:flex; align-items:center; justify-content:space-between; gap:1.25rem; padding:.65rem 0 1rem; border-bottom:1px solid var(--fk-border); margin-bottom:2rem; }
.fk-brand { display:flex; align-items:center; gap:.65rem; color:var(--fk-ink); font-size:1.35rem; font-weight:800; letter-spacing:-.04em; }
.fk-mark { display:grid; place-items:center; width:38px; height:38px; border-radius:11px; color:var(--fk-blue); background:#E9F2FF; }
.fk-nav { display:flex; align-items:center; gap:clamp(.75rem, 2vw, 1.75rem); }
.fk-nav a { color:var(--fk-muted); text-decoration:none; font-size:.9rem; font-weight:600; }
.fk-nav a:hover { color:var(--fk-blue); }
.fk-hero { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr); align-items:center; gap:clamp(2rem, 5vw, 5rem); padding:clamp(2rem, 6vw, 4.75rem) 0 3rem; }
.fk-eyebrow { display:inline-flex; padding:.4rem .75rem; background:#E9F2FF; color:var(--fk-blue-dark); border-radius:999px; font-size:.8rem; font-weight:700; letter-spacing:.02em; }
.fk-hero h1 { margin:.95rem 0 .8rem; color:#10234B; font-size:clamp(2.35rem, 5.3vw, 4.15rem); letter-spacing:-.055em; line-height:1.07; }
.fk-hero p { max-width:610px; color:var(--fk-muted); font-size:clamp(1rem, 1.5vw, 1.16rem); line-height:1.7; }
.fk-visual { background:linear-gradient(145deg,#FFFFFF,#EDF5FF); border:1px solid #DCE9F8; border-radius:24px; padding:clamp(1.3rem,3vw,2rem); box-shadow:0 16px 42px rgba(24,60,110,.08); }
.fk-visual-title { color:var(--fk-muted); font-size:.84rem; font-weight:700; margin-bottom:1rem; }
.fk-routing { display:grid; gap:.75rem; }
.fk-route-card { display:flex; align-items:center; gap:.85rem; padding:.9rem 1rem; background:white; border:1px solid var(--fk-border); border-radius:12px; color:var(--fk-ink); font-weight:650; box-shadow:0 4px 12px rgba(20,33,61,.04); }
.fk-node { display:grid; place-items:center; width:34px; height:34px; border-radius:10px; background:#E9F2FF; color:var(--fk-blue); font-weight:800; }
.fk-route-arrow { text-align:center; color:var(--fk-blue); line-height:.8; font-size:1.25rem; font-weight:800; }
.fk-section { padding:var(--fk-section-space, clamp(2.5rem,6vw,5rem)) 0 0; }
.fk-section-heading { margin:0 0 .55rem; color:#10234B; text-align:center; font-size:clamp(1.65rem,3vw,2.25rem); letter-spacing:-.04em; }
.fk-section-copy { color:var(--fk-muted); text-align:center; margin:0 auto 1.8rem; line-height:1.6; }
.fk-card { height:100%; min-height:190px; background:var(--fk-surface); border:1px solid var(--fk-border); border-radius:var(--fk-radius-card); padding:1.4rem; box-shadow:0 8px 24px rgba(20,33,61,.045); }
.fk-card-icon { display:grid; place-items:center; width:44px; height:44px; border-radius:13px; background:#E9F2FF; color:var(--fk-blue); font-size:1.05rem; font-weight:800; margin-bottom:1.05rem; }
.fk-card h3 { margin:0 0 .55rem; color:var(--fk-ink); font-size:1.08rem; }
.fk-card p { margin:0; color:var(--fk-muted); line-height:1.6; font-size:.94rem; }
.fk-step { display:flex; gap:1rem; align-items:flex-start; padding:.35rem 0; }
.fk-step-num { flex:0 0 42px; height:42px; display:grid; place-items:center; background:#E9F2FF; color:var(--fk-blue); border-radius:50%; font-weight:800; }
.fk-step h3 { margin:.1rem 0 .35rem; color:var(--fk-ink); font-size:1.02rem; }
.fk-step p { margin:0; color:var(--fk-muted); font-size:.92rem; line-height:1.55; }
.fk-cta { display:flex; justify-content:space-between; align-items:center; gap:1.5rem; margin-top:clamp(2.5rem,6vw,4.5rem); padding:clamp(1.3rem,3vw,2rem); border:1px solid #D9E9FF; border-radius:var(--fk-radius-card); background:#EAF3FF; }
.st-key-cta { display:block; margin-top:clamp(2.5rem,6vw,4.5rem); padding:clamp(1.3rem,3vw,2rem); border:1px solid #D9E9FF; border-radius:var(--fk-radius-card); background:#EAF3FF; }
.fk-cta h2 { margin:0 0 .4rem; color:#10234B; font-size:1.4rem; }
.fk-cta p { margin:0; color:var(--fk-muted); line-height:1.55; }
.fk-footer { display:flex; justify-content:space-between; gap:1rem; padding:1.5rem .1rem .2rem; margin-top:2rem; border-top:1px solid var(--fk-border); color:var(--fk-muted); font-size:.87rem; }
.fk-footer strong { color:var(--fk-ink); font-size:1rem; }
.fk-auth-shell { max-width:490px; margin:clamp(1rem,4vw,3.25rem) auto 0; }
.st-key-auth_shell { max-width:490px; margin:clamp(1rem,4vw,3.25rem) auto 0; }
.fk-auth-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:2.3rem; }
.fk-auth-heading { text-align:center; margin-bottom:1.5rem; }
.fk-auth-heading h1 { margin:0 0 .5rem; color:#10234B; font-size:clamp(1.7rem,4vw,2.15rem); letter-spacing:-.04em; }
.fk-auth-heading p { margin:0; color:var(--fk-muted); line-height:1.55; }
.fk-auth-card { padding:clamp(1.3rem,4vw,2rem); background:white; border:1px solid var(--fk-border); border-radius:var(--fk-radius-card); box-shadow:0 12px 36px rgba(20,33,61,.07); }
.fk-auth-switch { text-align:center; color:var(--fk-muted); margin:1.2rem 0 0; font-size:.92rem; }
.fk-auth-foot { color:#687790; text-align:center; font-size:.85rem; margin:1.5rem 0 0; }
.fk-header-rule { height:1px; background:var(--fk-border); margin:0 0 .5rem; }

/* ---------- SIDEBAR ---------- */
section[data-testid="stSidebar"] { background:#FFFFFF; border-right:1px solid var(--fk-border); }
section[data-testid="stSidebar"] > div { padding:1.25rem .8rem; }

/* --- Sidebar collapse / expand ALWAYS visible --- */
[data-testid="stSidebarCollapseButton"] { visibility:visible !important; opacity:1 !important; z-index:999999 !important; }
[data-testid="stSidebarCollapseButton"] button,
button[data-testid="stExpandSidebarButton"] {
  display:inline-grid !important; place-items:center !important;
  width:40px !important; min-width:40px !important; height:40px !important; min-height:40px !important;
  margin:6px !important; padding:0 !important; border-radius:10px !important;
  background:#FFFFFF !important; border:2px solid var(--fk-blue) !important;
  color:var(--fk-blue) !important; box-shadow:0 3px 10px rgba(20,45,85,.15) !important;
  opacity:1 !important; visibility:visible !important; z-index:999999 !important;
}
[data-testid="stSidebarCollapseButton"] button:hover,
button[data-testid="stExpandSidebarButton"]:hover {
  background:#E9F2FF !important; border-color:var(--fk-blue-dark) !important;
  color:var(--fk-blue-dark) !important; box-shadow:0 4px 14px rgba(20,45,85,.22) !important;
}
[data-testid="stSidebarCollapseButton"] button svg,
[data-testid="stSidebarCollapseButton"] button svg *,
button[data-testid="stExpandSidebarButton"] svg,
button[data-testid="stExpandSidebarButton"] svg * {
  color:var(--fk-blue) !important; fill:var(--fk-blue) !important; stroke:var(--fk-blue) !important;
  opacity:1 !important;
}
[data-testid="stSidebarCollapseButton"] button:hover svg,
[data-testid="stSidebarCollapseButton"] button:hover svg *,
button[data-testid="stExpandSidebarButton"]:hover svg,
button[data-testid="stExpandSidebarButton"]:hover svg * {
  color:var(--fk-blue-dark) !important; fill:var(--fk-blue-dark) !important; stroke:var(--fk-blue-dark) !important;
}

/* --- Ensure expand button visible when sidebar is collapsed --- */
.stApp header[data-testid="stHeader"] {
  background: transparent !important;
}
.stApp header[data-testid="stHeader"] button[data-testid="stExpandSidebarButton"] {
  display:inline-grid !important; visibility:visible !important; opacity:1 !important;
  background:#FFFFFF !important; border:2px solid var(--fk-blue) !important;
  color:var(--fk-blue) !important; z-index:999999 !important;
  box-shadow:0 3px 10px rgba(20,45,85,.15) !important;
}
.stApp header[data-testid="stHeader"] [data-testid="stToolbar"] { background:transparent !important; }
.stApp header[data-testid="stHeader"] [data-testid="stToolbar"] button:not([data-testid="stExpandSidebarButton"]) { visibility:hidden !important; }

/* ---------- SIDEBAR BRAND & NAVIGATION ---------- */
.fk-sidebar-brand { display:flex; align-items:center; gap:.65rem; margin:0 0 .5rem; color:var(--fk-ink); font-size:1.28rem; font-weight:800; letter-spacing:-.04em; }
.fk-sidebar-mark { display:grid; place-items:center; width:36px; height:36px; border-radius:11px; background:#E9F2FF; color:var(--fk-blue); font-weight:800; font-size:.95rem; }
.fk-sidebar-user { display:flex; align-items:center; gap:.6rem; padding:.55rem .6rem; margin:.1rem 0 .4rem; background:#F8FAFC; border-radius:10px; border:1px solid #EDF1F6; }
.fk-sidebar-avatar { display:grid; place-items:center; width:32px; height:32px; border-radius:8px; background:var(--fk-blue); color:#fff; font-weight:800; font-size:.82rem; flex-shrink:0; }
.fk-sidebar-uname { color:var(--fk-ink); font-weight:700; font-size:.88rem; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fk-sidebar-urole { font-size:.7rem; font-weight:700; letter-spacing:.04em; padding:.15rem .45rem; border-radius:6px; display:inline-block; margin-top:.15rem; }
.fk-role-user { background:#E9F2FF; color:var(--fk-blue); }
.fk-role-department_handler { background:#FFF3CD; color:#8A5700; }
.fk-role-admin { background:#E5F6F0; color:#116C52; }
.fk-role-super_admin { background:#F0E7FF; color:#6B21A8; }
.fk-sidebar-label { margin:.9rem 0 .4rem; padding:0 .35rem; color:#8C99B0; font-size:.7rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
.fk-sidebar-divider { height:1px; background:#EDF1F6; margin:.8rem 0; }

/* --- Sidebar nav items --- */
section[data-testid="stSidebar"] .stApp button,
section[data-testid="stSidebar"] button {
  min-height:38px !important; font-size:.88rem !important; font-weight:600 !important;
  border-radius:8px !important; text-align:left !important; padding:.45rem .7rem !important;
  justify-content:flex-start !important;
  background:transparent !important; border:none !important; box-shadow:none !important;
  color:var(--fk-muted) !important; transition:all .12s ease !important;
}
section[data-testid="stSidebar"] button:hover {
  background:#F0F6FF !important; color:var(--fk-blue-dark) !important;
}
section[data-testid="stSidebar"] button[kind="primary"] {
  background:var(--fk-blue) !important; color:#FFFFFF !important;
  box-shadow:0 2px 8px rgba(23,105,232,.2) !important;
}
section[data-testid="stSidebar"] button[kind="primary"]:hover {
  background:var(--fk-blue-dark) !important; color:#FFFFFF !important;
}
section[data-testid="stSidebar"] button div {
  color:inherit !important;
}

/* ---------- PAGE HEADING ---------- */
.fk-page-heading { margin:0 0 1.5rem; }
.fk-page-heading h1 { margin:0 0 .35rem; color:#10234B; font-size:clamp(1.7rem,3vw,2.25rem); letter-spacing:-.04em; font-weight:800; }
.fk-page-heading p, .fk-page-intro { margin:0; color:var(--fk-muted); line-height:1.6; font-size:.95rem; }
.fk-dashboard-welcome { margin:.2rem 0 1.5rem; }
.fk-dashboard-welcome h1 { margin:.6rem 0 .35rem; color:#10234B; font-size:clamp(1.8rem,3.2vw,2.4rem); letter-spacing:-.045em; }
.fk-dashboard-welcome p { margin:0; color:var(--fk-muted); font-size:.95rem; }

/* ---------- STAT CARDS ---------- */
.fk-stat-card { min-height:130px; height:100%; padding:1.15rem 1.2rem; background:white; border:1px solid var(--fk-border); border-radius:var(--fk-radius-card); box-shadow:0 4px 16px rgba(20,33,61,.035); position:relative; overflow:hidden; }
.fk-stat-card::before { content:''; position:absolute; top:0; left:0; width:4px; height:100%; border-radius:4px 0 0 4px; }
.fk-stat-card.fk-stat-total::before { background:var(--fk-blue); }
.fk-stat-card.fk-stat-pending::before { background:#F59E0B; }
.fk-stat-card.fk-stat-followed::before { background:#3B82F6; }
.fk-stat-card.fk-stat-resolved::before { background:#10B981; }
.fk-stat-icon { display:grid; place-items:center; width:40px; height:40px; border-radius:12px; font-size:1.05rem; font-weight:800; margin-bottom:.65rem; }
.fk-stat-icon-total { background:#E9F2FF; color:var(--fk-blue); }
.fk-stat-icon-pending { background:#FEF3C7; color:#D97706; }
.fk-stat-icon-followed { background:#DBEAFE; color:#2563EB; }
.fk-stat-icon-resolved { background:#D1FAE5; color:#059669; }
.fk-stat-label { color:var(--fk-muted); font-size:.82rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.fk-stat-value { margin:.3rem 0 .1rem; color:#10234B; font-size:2rem; font-weight:800; letter-spacing:-.04em; line-height:1; }
.fk-stat-note { color:#8C99B0; font-size:.76rem; }

/* Handler & admin stat cards with icon */
.fk-handler-stat, .fk-admin-stat { display:flex; align-items:center; gap:.85rem; min-height:105px; height:100%; padding:1rem; background:#FFFFFF; border:1px solid var(--fk-border); border-radius:var(--fk-radius-card); box-shadow:0 4px 16px rgba(20,33,61,.035); }
.fk-handler-stat-icon, .fk-admin-stat-marker { display:grid; place-items:center; flex:0 0 44px; width:44px; height:44px; border-radius:13px; background:#E9F2FF; color:var(--fk-blue); font-size:1.15rem; font-weight:800; }
.fk-handler-stat .fk-stat-value, .fk-admin-stat .fk-stat-value { margin:.2rem 0 0; font-size:1.75rem; }

/* ---------- SECTION TITLES ---------- */
.fk-section-title { margin:2rem 0 .9rem; }
.fk-section-title h2 { margin:0; color:#10234B; font-size:1.25rem; font-weight:750; letter-spacing:-.02em; }

/* ---------- COMPLAINT CARDS ---------- */
.fk-complaint-top { display:flex; align-items:center; justify-content:space-between; gap:.8rem; margin-bottom:.4rem; color:var(--fk-ink); }
.fk-complaint-text { margin:.15rem 0 .85rem; color:var(--fk-muted); line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.92rem; }

/* ---------- STATUS BADGES ---------- */
.fk-status { display:inline-flex; align-items:center; min-height:26px; padding:.2rem .6rem; border-radius:999px; font-size:.76rem; font-weight:700; white-space:nowrap; letter-spacing:.01em; }
.fk-status-pending { color:#92400E; background:#FEF3C7; }
.fk-status-followed_up { color:#1E40AF; background:#DBEAFE; }
.fk-status-processed { color:#065F46; background:#D1FAE5; }
.fk-status-unknown { color:#52627A; background:#EDF1F6; }

/* ---------- CONTAINERS ---------- */
div[data-testid="stVerticalBlockBorderWrapper"] { border-color:var(--fk-border); border-radius:var(--fk-radius-card); background:#FFFFFF; box-shadow:0 4px 16px rgba(20,33,61,.03); }
.st-key-fk-form-card { padding:clamp(1.2rem,3vw,2rem); border:1px solid var(--fk-border); border-radius:var(--fk-radius-card); background:white; box-shadow:0 8px 24px rgba(20,33,61,.04); }
.fk-form-title { margin:.1rem 0 .35rem; color:#10234B; font-size:1.3rem; font-weight:750; }
.fk-form-copy { margin:0 0 1.1rem; color:var(--fk-muted); line-height:1.6; font-size:.93rem; }

/* ---------- EMPTY STATES ---------- */
.fk-empty-state { max-width:520px; margin:2rem auto 1rem; padding:2.5rem 1.5rem; text-align:center; background:#FFFFFF; border:1px dashed #C9D7E8; border-radius:var(--fk-radius-card); }
.fk-empty-mark { display:grid; place-items:center; width:48px; height:48px; margin:0 auto .85rem; border-radius:14px; color:var(--fk-blue); background:#E9F2FF; font-size:1.35rem; }
.fk-empty-state h2 { margin:.2rem 0 .4rem; color:#10234B; font-size:1.2rem; font-weight:700; }
.fk-empty-state p { margin:0; color:var(--fk-muted); line-height:1.55; font-size:.92rem; }

/* ---------- DETAIL PAGES ---------- */
.fk-selected-note { margin:.2rem 0 .65rem; color:var(--fk-blue-dark); font-size:.86rem; font-weight:700; }
.fk-list-divider { height:1px; margin:1.2rem 0; background:var(--fk-border); }
.fk-detail-section-title { margin:0 0 .7rem; color:#10234B; font-size:1.1rem; font-weight:750; }
.fk-full-complaint { margin:0 0 1.2rem; padding:1rem 1.2rem; border-radius:12px; background:#F8FAFC; color:var(--fk-ink); line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.94rem; border-left:4px solid var(--fk-blue); }
.fk-contact-name { margin:.2rem 0 1rem; color:#10234B; font-size:1.3rem; font-weight:750; }

/* ---------- DEPARTMENT TABLE ---------- */
.fk-dept-table { width:100%; border-collapse:collapse; margin:.5rem 0; }
.fk-dept-table th { text-align:left; padding:.7rem .8rem; font-size:.78rem; font-weight:700; color:#8C99B0; text-transform:uppercase; letter-spacing:.06em; border-bottom:2px solid #EDF1F6; }
.fk-dept-table th:last-child { text-align:right; }
.fk-dept-table td { padding:.65rem .8rem; font-size:.92rem; color:var(--fk-ink); border-bottom:1px solid #F1F5F9; }
.fk-dept-table td:last-child { text-align:right; font-weight:700; color:#10234B; }
.fk-dept-table tr:last-child td { border-bottom:none; }
.fk-dept-table tr:hover td { background:#F8FAFC; }
.fk-dept-bar { display:inline-block; height:6px; border-radius:3px; background:var(--fk-blue); opacity:.55; vertical-align:middle; margin-right:.5rem; }

/* ---------- ADMIN DATA TABLE ---------- */
.fk-data-table { width:100%; border-collapse:collapse; margin:.5rem 0; background:#FFFFFF; border-radius:var(--fk-radius-card); overflow:hidden; }
.fk-data-table th { text-align:left; padding:.7rem .8rem; font-size:.76rem; font-weight:700; color:#8C99B0; text-transform:uppercase; letter-spacing:.06em; background:#F8FAFC; border-bottom:2px solid #EDF1F6; }
.fk-data-table td { padding:.6rem .8rem; font-size:.89rem; color:var(--fk-ink); border-bottom:1px solid #F3F6FA; vertical-align:middle; }
.fk-data-table tr:last-child td { border-bottom:none; }
.fk-data-table tr:hover td { background:#F8FAFC; }

/* ---------- CUSTOM ALERTS ---------- */
.fk-alert { padding:.8rem 1.1rem; border-radius:10px; font-size:.9rem; font-weight:600; margin:.6rem 0; display:flex; align-items:center; gap:.6rem; }
.fk-alert-success { background:#D1FAE5; color:#065F46; border:1px solid #A7F3D0; }
.fk-alert-warning { background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; }
.fk-alert-error { background:#FEE2E2; color:#991B1B; border:1px solid #FECACA; }
.fk-alert-info { background:#DBEAFE; color:#1E40AF; border:1px solid #BFDBFE; }

/* ---------- REDIRECT PANEL ---------- */
.fk-redirect-panel { padding:1.2rem; border-radius:14px; border:1px solid var(--fk-border); background:#FFFFFF; margin-top:1rem; }
.fk-redirect-title { margin:0 0 .3rem; color:#10234B; font-size:1.1rem; font-weight:750; }
.fk-redirect-copy { margin:0 0 .9rem; color:var(--fk-muted); font-size:.88rem; }
.fk-redirect-current { display:inline-flex; padding:.3rem .6rem; background:#F1F5F9; border-radius:8px; font-size:.84rem; font-weight:700; color:var(--fk-ink); margin-bottom:.8rem; }

/* ---------- ROLE PLACEHOLDER ---------- */
.fk-role-placeholder { max-width:670px; margin:clamp(3rem,12vh,8rem) auto 1rem; padding:clamp(1.5rem,5vw,3rem); text-align:center; background:white; border:1px solid var(--fk-border); border-radius:var(--fk-radius-card); box-shadow:0 12px 32px rgba(20,33,61,.06); }
.fk-role-placeholder h1 { margin:1rem 0 .6rem; color:#10234B; font-size:clamp(1.8rem,4vw,2.5rem); }
.fk-role-placeholder p { color:var(--fk-muted); line-height:1.6; }

/* ---------- RESPONSIVE ---------- */
@media (max-width: 760px) {
  .fk-header { align-items:flex-start; flex-wrap:wrap; }
  .fk-nav { width:100%; justify-content:flex-start; gap:1rem; }
  .fk-hero { grid-template-columns:1fr; padding-top:2rem; }
  .fk-cta, .fk-footer { align-items:flex-start; flex-direction:column; }
  .fk-auth-shell { margin-top:.3rem; }
  .fk-stat-card { min-height:110px; padding:1rem; }
  .fk-handler-stat, .fk-admin-stat { min-height:90px; padding:.8rem; }
  .fk-handler-stat-icon, .fk-admin-stat-marker { flex-basis:36px; width:36px; height:36px; }
  .fk-complaint-top { align-items:flex-start; }
  section[data-testid="stSidebar"] { width:min(84vw, 310px) !important; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior:auto !important; transition:none !important; } }
</style>
"""


def apply_styles() -> None:
    import streamlit as st

    st.markdown(APP_CSS, unsafe_allow_html=True)
