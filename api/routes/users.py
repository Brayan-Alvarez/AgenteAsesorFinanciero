"""users.py — Read-only endpoint for Supabase users."""

import logging
from fastapi import APIRouter, HTTPException
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/users")
async def list_users():
    try:
        return q.get_users()
    except Exception as exc:
        logger.exception("GET /api/users failed.")
        raise HTTPException(500, "Could not load users.") from exc
