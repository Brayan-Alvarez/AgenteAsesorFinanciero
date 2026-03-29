"""
main.py — FastAPI application entry point.

Architecture:
    POST /api/chat          → api/routes/chat.py       (LangGraph agent)
    GET  /api/budget        → api/routes/dashboard.py  (budget vs actual)
    GET  /api/expenses      → api/routes/dashboard.py  (monthly expenses)
    GET  /api/trend         → api/routes/dashboard.py  (monthly trend)
    GET  /health            → inline health check

CORS:
    Allows requests from the React dev server (http://localhost:5173) by
    default, and from any URL set in the FRONTEND_ORIGIN environment variable
    (used for the Vercel production URL).

Running locally:
    uvicorn api.main:app --reload --port 8000

    The interactive API docs are then available at:
        http://localhost:8000/docs   (Swagger UI)
        http://localhost:8000/redoc  (ReDoc)
"""

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.chat import router as chat_router
from api.routes.dashboard import router as dashboard_router

# Load .env before anything else so that FRONTEND_ORIGIN and all other
# config variables are available when the app starts.
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AgenteAsesorFinanciero API",
    description=(
        "REST API for the AI financial advisor agent. "
        "Reads budget and expense data from Google Sheets and exposes it "
        "via a conversational chat endpoint and structured dashboard endpoints."
    ),
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------

# Build the list of allowed origins.
# - Always allow the Vite dev server (React default port).
# - Add the production frontend URL from env if set.
_allowed_origins = ["http://localhost:5173"]

_frontend_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
if _frontend_origin:
    _allowed_origins.append(_frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,   # Required if the frontend ever sends cookies / auth headers.
    allow_methods=["*"],      # GET, POST, OPTIONS, etc.
    allow_headers=["*"],      # Content-Type, Authorization, etc.
)

logger.info("CORS enabled for origins: %s", _allowed_origins)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

# All routes are mounted under /api to make it easy to proxy them from
# the frontend dev server without ambiguity.
app.include_router(chat_router, prefix="/api", tags=["chat"])
app.include_router(dashboard_router, prefix="/api", tags=["dashboard"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"], summary="Liveness probe")
async def health() -> dict:
    """Returns 200 OK when the server is up.  Used by deployment platforms."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Dev entry point — allows `python api/main.py` during quick testing
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
