"""
chat.py — Streamlit chat component connected to the LangGraph agent.

Responsibilities:
- Render the chat message history stored in st.session_state.
- Accept new user input via st.chat_input.
- Invoke the LangGraph graph and stream the assistant's response token by token.
- Display tool calls (if any) as collapsible expanders for transparency.
"""

import streamlit as st


def render_chat(graph) -> None:
    """
    Render the full chat interface: message history + input box.

    Args:
        graph: A compiled LangGraph app (returned by agent.graph.build_graph()).
               Called with .stream() to get incremental response chunks.
    """
    pass  # TODO: implement in Phase 3
