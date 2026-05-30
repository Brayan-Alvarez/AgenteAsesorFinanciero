"""
transactions_db.py — CRUD endpoints for Supabase-backed transactions.

GET    /api/transactions/db?year=&month=&user_id=&category_id=
POST   /api/transactions/db
PUT    /api/transactions/db/{id}
DELETE /api/transactions/db/{id}
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from api.models import TransactionCreate, TransactionUpdate, CategoryMigrationRequest
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/transactions/db")
async def list_transactions(
    year:        Optional[int] = Query(None),
    month:       Optional[int] = Query(None),
    user_id:     Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
):
    try:
        return q.get_transactions(user_id, year, month, category_id)
    except Exception as exc:
        logger.exception("GET /api/transactions/db failed.")
        raise HTTPException(500, "Could not load transactions.") from exc


@router.post("/transactions/db", status_code=201)
async def create_transaction(body: TransactionCreate):
    try:
        return q.create_transaction(
            body.user_id, body.date, body.category_id,
            body.description, body.amount, body.type,
            body.subcategory_id, body.notes,
        )
    except Exception as exc:
        logger.exception("POST /api/transactions/db failed.")
        raise HTTPException(500, "Could not create transaction.") from exc


@router.put("/transactions/db/{transaction_id}")
async def update_transaction(transaction_id: str, body: TransactionUpdate):
    try:
        fields = body.model_dump(exclude_none=True)
        if not fields:
            raise HTTPException(400, "No fields to update.")
        return q.update_transaction(transaction_id, **fields)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PUT /api/transactions/db/%s failed.", transaction_id)
        raise HTTPException(500, "Could not update transaction.") from exc


@router.delete("/transactions/db/{transaction_id}", status_code=204)
async def delete_transaction(transaction_id: str):
    try:
        q.delete_transaction(transaction_id)
    except Exception as exc:
        logger.exception("DELETE /api/transactions/db/%s failed.", transaction_id)
        raise HTTPException(500, "Could not delete transaction.") from exc


@router.post("/transactions/db/migrate-category")
async def migrate_category(body: CategoryMigrationRequest):
    """Bulk-reassign all transactions from a deleted category to an active one."""
    try:
        count = q.migrate_category_transactions(
            body.from_category_id, body.to_category_id, body.to_subcategory_id
        )
        return {"migrated": count}
    except Exception as exc:
        logger.exception("POST /api/transactions/db/migrate-category failed.")
        raise HTTPException(500, "Could not migrate transactions.") from exc
