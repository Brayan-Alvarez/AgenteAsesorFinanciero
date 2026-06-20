"""
primas.py — Primas / bonuses CRUD + idempotent processing.

GET  /api/primas?user_id=          → list active primas (optionally filtered)
POST /api/primas                   → create a prima
PUT  /api/primas/{id}              → update amount / month / description
DELETE /api/primas/{id}            → soft-delete
POST /api/primas/process?year=&month= → create income transactions for primas in that month
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.models import PrimaCreate, PrimaOut, PrimaUpdate
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/primas", response_model=list[PrimaOut])
async def list_primas(user_id: Optional[str] = Query(None)):
    try:
        return q.get_primas(user_id)
    except Exception as exc:
        logger.exception("GET /api/primas failed.")
        raise HTTPException(500, "Could not load primas.") from exc


@router.post("/primas", response_model=PrimaOut, status_code=201)
async def create_prima(body: PrimaCreate):
    try:
        return q.create_prima(body.user_id, body.month, body.amount, body.description, body.salary_pct)
    except Exception as exc:
        logger.exception("POST /api/primas failed.")
        raise HTTPException(500, "Could not create prima.") from exc


@router.put("/primas/{prima_id}", response_model=PrimaOut)
async def update_prima(prima_id: str, body: PrimaUpdate):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(400, "No fields to update.")
    try:
        return q.update_prima(prima_id, **fields)
    except Exception as exc:
        logger.exception("PUT /api/primas/%s failed.", prima_id)
        raise HTTPException(500, "Could not update prima.") from exc


@router.delete("/primas/{prima_id}", status_code=204)
async def delete_prima(prima_id: str):
    try:
        q.delete_prima(prima_id)
    except Exception as exc:
        logger.exception("DELETE /api/primas/%s failed.", prima_id)
        raise HTTPException(500, "Could not delete prima.") from exc


@router.post("/primas/process")
async def process_primas(
    year:  int = Query(...),
    month: int = Query(..., ge=1, le=12),
) -> dict:
    """Idempotent: create income transactions for primas in the given month."""
    try:
        created = q.process_pending_primas(year, month)
        return {"created": created}
    except Exception as exc:
        logger.exception("POST /api/primas/process failed.")
        raise HTTPException(500, f"Could not process primas: {exc}") from exc
