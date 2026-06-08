"""
debts.py — CRUD endpoints for debts and debt payments.

GET    /api/debts?user_id=
POST   /api/debts
PUT    /api/debts/{id}
DELETE /api/debts/{id}
POST   /api/debts/process?year=&month=   → idempotent auto-installment generator
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
            name                     = body.name,
            total_amount             = body.total_amount,
            user_id                  = body.user_id,
            description              = body.description,
            color                    = body.color,
            due_date                 = body.due_date,
            installment_amount       = body.installment_amount,
            installment_amount_2     = body.installment_amount_2,
            annual_rate              = body.annual_rate,
            payment_day              = body.payment_day,
            payment_day_2            = body.payment_day_2,
            auto_pay                 = body.auto_pay,
            historical_capital_paid  = body.historical_capital_paid,
            historical_interest_paid = body.historical_interest_paid,
        )
        return q.get_debt(debt["id"])
    except Exception as exc:
        logger.exception("POST /api/debts failed.")
        # Expose detail in dev so we can diagnose DB errors without Railway logs
        raise HTTPException(500, f"Could not create debt: {type(exc).__name__}: {exc}") from exc


# NOTE: /debts/process must be registered before /debts/{debt_id} to avoid
# FastAPI treating "process" as a path parameter.
@router.post("/debts/process")
async def process_debt_installments(
    year:  int = Query(...),
    month: int = Query(..., ge=1, le=12),
) -> dict:
    """Idempotent: creates auto-pay installment transactions for all eligible debts."""
    try:
        created = q.process_pending_debt_installments(year, month)
        return {"created": created}
    except Exception as exc:
        logger.exception("POST /api/debts/process failed.")
        raise HTTPException(500, "Could not process debt installments.") from exc


@router.put("/debts/{debt_id}", response_model=DebtOut)
async def update_debt(debt_id: str, body: DebtUpdate):
    try:
        fields = body.model_dump(exclude_none=True)
        if not fields:
            raise HTTPException(400, "No fields to update.")
        return q.update_debt(debt_id, **fields)
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
            debt_id         = debt_id,
            amount          = body.amount,
            date            = body.date,
            paid_by         = body.paid_by,
            description     = body.description,
            notes           = body.notes,
            capital_amount  = body.capital_amount,
            interest_amount = body.interest_amount,
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
