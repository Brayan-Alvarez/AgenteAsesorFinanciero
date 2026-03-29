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
    provider = os.getenv("LLM_PROVIDER", "ollama")

    if provider == "ollama":
        return ChatOllama(
            model=os.getenv("OLLAMA_MODEL", "llama3.2"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=os.getenv("GEMINI_API_KEY"),
        )
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: '{provider}'. Use 'ollama' or 'gemini'.")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    llm = get_llm()
    response = llm.invoke("Say 'LLM connection successful' and nothing else.")
    print(response.content)
