"""
debts.py — CRUD endpoints for debts and debt payments.

GET    /api/debts?user_id=
POST   /api/debts
PUT    /api/debts/{id}
DELETE /api/debts/{id}
POST   /api/debts/{id}/payments
DELETE /api/debt-payments/{id}
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from api.models import DebtCreate, DebtOut, DebtPaymentCreate, DebtUpdate
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/debts", response_model=list[DebtOut])
async def list_debts(user_id: Optional[str] = Query(None)):
    try:
        return q.get_debts(user_id)
    except Exception as exc:
        logger.exception("GET /api/debts failed.")
        raise HTTPException(500, "Could not load debts.") from exc


@router.post("/debts", response_model=DebtOut, status_code=201)
async def create_debt(body: DebtCreate):
    try:
        debt = q.create_debt(
            body.name, body.total_amount, body.user_id,
            body.description, body.color, body.due_date, body.interest_rate,
        )
        # Return full object with pending_amount
        return q.get_debt(debt["id"])
    except Exception as exc:
        logger.exception("POST /api/debts failed.")
        raise HTTPException(500, "Could not create debt.") from exc


@router.put("/debts/{debt_id}", response_model=DebtOut)
async def update_debt(debt_id: str, body: DebtUpdate):
    try:
        fields = body.model_dump(exclude_none=True)
        if not fields:
            raise HTTPException(400, "No fields to update.")
        q.update_debt(debt_id, **fields)
        return q.get_debt(debt_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PUT /api/debts/%s failed.", debt_id)
        raise HTTPException(500, "Could not update debt.") from exc


@router.delete("/debts/{debt_id}", status_code=204)
async def delete_debt(debt_id: str):
    try:
        q.delete_debt(debt_id)
    except Exception as exc:
        logger.exception("DELETE /api/debts/%s failed.", debt_id)
        raise HTTPException(500, "Could not delete debt.") from exc


@router.post("/debts/{debt_id}/payments", status_code=201)
async def add_payment(debt_id: str, body: DebtPaymentCreate):
    try:
        return q.create_debt_payment(
            debt_id, body.amount, body.date,
            body.paid_by, body.description, body.notes,
        )
    except Exception as exc:
        logger.exception("POST /api/debts/%s/payments failed.", debt_id)
        raise HTTPException(500, "Could not add payment.") from exc


@router.delete("/debt-payments/{payment_id}", status_code=204)
async def delete_payment(payment_id: str):
    try:
        q.delete_debt_payment(payment_id)
    except Exception as exc:
        logger.exception("DELETE /api/debt-payments/%s failed.", payment_id)
        raise HTTPException(500, "Could not delete payment.") from exc
