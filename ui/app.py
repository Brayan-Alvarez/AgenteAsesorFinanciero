"""
app.py — Streamlit entry point for the AgenteAsesorFinanciero UI.

Run with:
    streamlit run ui/app.py

Responsibilities:
- Load environment variables (via python-dotenv locally, st.secrets on Streamlit Cloud).
- Initialize Streamlit session state (conversation history, financial context).
- Load financial data from Google Sheets once per session (using the cache layer).
- Render the sidebar (configuration, refresh button) and main area (chat + dashboard tabs).
- Pass user messages to the LangGraph agent and display streamed responses.
"""

import streamlit as st


def main() -> None:
    """
    Streamlit app entry point.

    Sets page config, initializes session state, loads data on first run,
    and renders the two main tabs: Chat and Dashboard.
    """
    pass  # TODO: implement in Phase 3


if __name__ == "__main__":
    main()
