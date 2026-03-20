"""
llm_factory.py — Returns the correct LangChain LLM based on the LLM_PROVIDER env var.

Usage (everywhere in the codebase):
    from agent.llm_factory import get_llm
    llm = get_llm()

NEVER instantiate ChatOllama or ChatGoogleGenerativeAI directly outside this file.
Centralizing LLM creation here means we can swap providers by changing one env var.

Supported providers:
    "ollama"  — Local Ollama server (default). Good for development without API costs.
    "gemini"  — Google Gemini Flash via Google AI Studio. Used for cloud/prod.
"""

import os
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI


def get_llm() -> ChatOllama | ChatGoogleGenerativeAI:
    """
    Instantiate and return the LLM configured by the LLM_PROVIDER env var.

    Reads configuration from environment variables (loaded via .env or st.secrets).
    See .env.example for all relevant variable names.

    Returns:
        A LangChain chat model instance ready to be used in the agent graph.

    Raises:
        ValueError: If LLM_PROVIDER is set to an unrecognized value.
        KeyError: If required env vars for the chosen provider are missing.
    """
    pass  # TODO: implement in Phase 2
