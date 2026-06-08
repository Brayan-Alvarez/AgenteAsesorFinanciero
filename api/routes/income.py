"""
income.py — Income CRUD and history.

GET  /api/income?year=&month=&user_id=      → effective income for the month (carry-forward)
POST /api/income                            → upsert (create or update) + record history
GET  /api/income/history?user_id=           → full audit log for a user
POST /api/income/generate?year=&month=      → create income transactions for a month (idempotent)
POST /api/income/seed-history               → create income transactions for all historical months
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.models import IncomeOut, IncomeUpsert, IncomeHistoryOut
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/income", response_model=list[IncomeOut])
async def get_income(
    year:    int           = Query(...),
    month:   int           = Query(...),
    user_id: Optional[str] = Query(None),
):
    """Effective income for every user for the given month.
    Uses carry-forward: if income was configured in March and you query May,
    March's value is returned for May."""
    try:
        return q.get_income(year, month, user_id)
    except Exception as exc:
        logger.exception("GET /api/income failed.")
        raise HTTPException(500, "Could not load income.") from exc


@router.post("/income", response_model=IncomeOut, status_code=201)
async def upsert_income(body: IncomeUpsert):
    """Create or update a user's income entry for a specific month.
    Records the change in income_history for audit/trend purposes."""
    try:
        return q.upsert_income(body.user_id, body.year, body.month, body.amount, body.notes)
    except Exception as exc:
        logger.exception("POST /api/income failed.")
        raise HTTPException(500, "Could not save income.") from exc


@router.get("/income/history", response_model=list[IncomeHistoryOut])
async def get_income_history(user_id: str = Query(...)):
    try:
        return q.get_income_history(user_id)
    except Exception as exc:
        logger.exception("GET /api/income/history failed.")
        raise HTTPException(500, "Could not load income history.") from exc


@router.post("/income/generate")
async def generate_income_tx(
    year:  int = Query(...),
    month: int = Query(..., ge=1, le=12),
) -> dict:
    """Idempotent: create income transactions for a specific month if missing."""
    try:
        created = q.generate_income_transactions(year, month)
        return {"created": created}
    except Exception as exc:
        logger.exception("POST /api/income/generate failed.")
        raise HTTPException(500, f"Could not generate income transactions: {exc}") from exc


@router.post("/income/seed-history")
async def seed_income_history() -> dict:
    """One-time seed: generate income transactions for all historical months.
    Safe to call multiple times — idempotent per user+month."""
    try:
        created = q.seed_income_transactions_history()
        return {"created": created}
    except Exception as exc:
        logger.exception("POST /api/income/seed-history failed.")
        raise HTTPException(500, f"Could not seed income history: {exc}") from exc
