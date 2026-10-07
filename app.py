import streamlit as st

from frontend.ui import run_app


st.set_page_config(
    page_title="Flatkart | Complaint Resolution Made Simple",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="expanded",
)

run_app()
