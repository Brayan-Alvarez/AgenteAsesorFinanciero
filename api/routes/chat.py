"""
chat.py — POST /api/chat endpoint.

Receives a plain-text message from the frontend, passes it through the
LangGraph agent, and returns the agent's text reply.

The agent internally decides which tools to call (budget summary, expenses,
purchase simulation, etc.) and streams its reasoning through the ReAct loop.
The endpoint waits for the final answer and returns it as a single response.
"""

import logging

from fastapi import APIRouter, HTTPException

from agent.graph import run_agent
from api.models import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse, summary="Send a message to the financial advisor agent")
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Run one conversation turn through the LangGraph agent.

    The agent will:
    1. Inspect the user's message.
    2. Call financial tools as needed (budget summary, expenses, etc.).
    3. Return a natural-language reply in the same language as the user's message.

    Each request is independent — the agent does not retain memory between calls.
    """
    logger.info("POST /api/chat — message length: %d chars", len(request.message))

    try:
        reply = run_agent(request.message)
    except Exception as exc:
        # Log the full traceback server-side; return a generic message to the client
        # so internal details (file paths, API keys) are never leaked.
        logger.exception("run_agent raised an unexpected error.")
        raise HTTPException(status_code=500, detail="The agent encountered an error. Please try again.") from exc

    return ChatResponse(reply=reply)
