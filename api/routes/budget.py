"""
budget.py — Budget CRUD and history endpoints.

GET  /api/budget?year=&month=&user_id=
POST /api/budget          (upsert: create or update)
DELETE /api/budget/{id}
GET  /api/budget/history?category_id=&user_id=
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from api.models import BudgetOut, BudgetUpsert, BudgetHistoryOut
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/budget/supabase", response_model=list[BudgetOut])
async def get_budget_supabase(
    year:    int = Query(...),
    month:   int = Query(...),
    user_id: Optional[str] = Query(None),
):
    """Budget entries from Supabase (replaces the Sheets-based /api/budget)."""
    try:
        return q.get_budget(year, month, user_id)
    except Exception as exc:
        logger.exception("GET /api/budget/supabase failed.")
        raise HTTPException(500, "Could not load budget.") from exc


@router.post("/budget/supabase", response_model=BudgetOut, status_code=201)
async def upsert_budget(body: BudgetUpsert):
    """Create or update a budget entry. Automatically records history."""
    try:
        return q.upsert_budget(
            body.category_id, body.user_id, body.year, body.month,
            body.amount, body.reason,
        )
    except Exception as exc:
        logger.exception("POST /api/budget/supabase failed.")
        raise HTTPException(500, "Could not save budget.") from exc


@router.delete("/budget/supabase/{budget_id}", status_code=204)
async def delete_budget(budget_id: str):
    try:
        q.delete_budget(budget_id)
    except Exception as exc:
        logger.exception("DELETE /api/budget/supabase/%s failed.", budget_id)
        raise HTTPException(500, "Could not delete budget entry.") from exc


@router.get("/budget/history", response_model=list[BudgetHistoryOut])
async def get_budget_history(
    category_id: str = Query(...),
    user_id:     str = Query(...),
):
    try:
        return q.get_budget_history(category_id, user_id)
    except Exception as exc:
        logger.exception("GET /api/budget/history failed.")
        raise HTTPException(500, "Could not load budget history.") from exc
