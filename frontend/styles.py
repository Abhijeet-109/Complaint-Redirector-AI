"""Flatkart visual tokens and Streamlit presentation styles."""

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
  --fk-radius-card: 18px; --fk-radius-control: 10px;
}
*, *::before, *::after { font-family: 'Plus Jakarta Sans', sans-serif; }
#MainMenu, footer, header[data-testid="stHeader"] { visibility: hidden; height: 0; }
.stApp { background: var(--fk-bg); color: var(--fk-ink); }
.block-container { max-width: 1200px; padding: 1rem clamp(1rem, 3vw, 2.25rem) 3rem; }
button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 3px solid #F0B928 !important; outline-offset: 2px !important;
}
div[data-testid="stTextInput"] label { color: var(--fk-ink); font-weight: 650; font-size: .94rem; }
div[data-baseweb="input"] { min-height: 46px; border: 1px solid var(--fk-border); border-radius: var(--fk-radius-control); background: white; }
div[data-baseweb="input"]:focus-within { border-color: var(--fk-blue); box-shadow: 0 0 0 3px rgba(23,105,232,.14); }
div[data-baseweb="input"] input { color: var(--fk-ink); font-size: 1rem; }
div[data-testid="stForm"] { border: 0; padding: 0; background: transparent; }
.st-key-auth_card { padding: clamp(1.3rem,4vw,2rem); background: white; border: 1px solid var(--fk-border); border-radius: var(--fk-radius-card); box-shadow: 0 12px 36px rgba(20,33,61,.07); }
.stApp button {
  min-height: 46px; border-radius: var(--fk-radius-control); font-weight: 700;
  padding: .65rem 1.1rem; transition: background-color .15s ease, box-shadow .15s ease;
  background-color: #FFFFFF !important; border: 1px solid var(--fk-blue) !important;
  color: var(--fk-blue) !important;
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
  color: #FFFFFF !important;
}
button:not([kind="primary"]):hover {
  background-color: #EAF3FF !important; color: var(--fk-blue-dark) !important;
}
.st-key-header_register button, .st-key-file_complaint button, .st-key-get_started button,
.st-key-register_submit button { background-color:var(--fk-yellow) !important; border-color:var(--fk-yellow) !important; color:#17243B !important; }
.st-key-header_register button div, .st-key-file_complaint button div, .st-key-get_started button div,
.st-key-register_submit button div { color:#17243B !important; }
.st-key-header_register button:hover, .st-key-file_complaint button:hover, .st-key-get_started button:hover,
.st-key-register_submit button:hover { background-color:#EAB52C !important; border-color:#EAB52C !important; color:#17243B !important; }
.fk-header { display:flex; align-items:center; justify-content:space-between; gap:1.25rem; padding:.65rem 0 1rem; border-bottom:1px solid var(--fk-border); margin-bottom:2rem; }
.fk-brand { display:flex; align-items:center; gap:.65rem; color:var(--fk-ink); font-size:1.35rem; font-weight:800; letter-spacing:-.04em; }
.fk-mark { display:grid; place-items:center; width:38px; height:38px; border-radius:11px; color:var(--fk-blue); background:#E9F2FF; }
.fk-nav { display:flex; align-items:center; gap:clamp(.75rem, 2vw, 1.75rem); }
.fk-nav a { color:var(--fk-muted); text-decoration:none; font-size:.9rem; font-weight:600; }
.fk-nav a:hover { color:var(--fk-blue); }
.fk-hero { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr); align-items:center; gap:clamp(2rem, 5vw, 5rem); padding:clamp(2rem, 6vw, 4.75rem) 0 3rem; }
.fk-eyebrow { display:inline-flex; padding:.45rem .8rem; background:#E9F2FF; color:var(--fk-blue-dark); border-radius:var(--fk-radius-pill); font-size:.82rem; font-weight:700; }
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
@media (max-width: 760px) {
  .fk-header { align-items:flex-start; flex-wrap:wrap; }
  .fk-nav { width:100%; justify-content:flex-start; gap:1rem; }
  .fk-hero { grid-template-columns:1fr; padding-top:2rem; }
  .fk-cta, .fk-footer { align-items:flex-start; flex-direction:column; }
  .fk-auth-shell { margin-top:.3rem; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior:auto !important; transition:none !important; } }
</style>
"""


def apply_styles() -> None:
    import streamlit as st

    st.markdown(APP_CSS, unsafe_allow_html=True)
