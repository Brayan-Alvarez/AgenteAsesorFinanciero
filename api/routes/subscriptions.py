"""
subscriptions.py — CRUD + auto-processing for recurring subscriptions.

GET    /api/subscriptions
POST   /api/subscriptions
POST   /api/subscriptions/process  → idempotent, creates pending transactions
PUT    /api/subscriptions/{id}
DELETE /api/subscriptions/{id}     → soft delete (end_date + is_active=False)
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.models import SubscriptionCreate, SubscriptionUpdate
from db import queries

router = APIRouter()


@router.get("/subscriptions")
async def list_subscriptions(
    user_id:          Optional[str] = Query(None),
    include_inactive: bool          = Query(False),
) -> list:
    return queries.get_subscriptions(user_id=user_id, include_inactive=include_inactive)


@router.post("/subscriptions", status_code=201)
async def create_subscription_route(body: SubscriptionCreate) -> dict:
    return queries.create_subscription(
        name           = body.name,
        amount         = body.amount,
        billing_day    = body.billing_day,
        category_id    = body.category_id,    # None → backend auto-assigns "Suscripciones"
        subcategory_id = body.subcategory_id,
        icon           = body.icon,
        color          = body.color,
        user_id        = body.user_id,
        start_date     = body.start_date,
        notes          = body.notes,
    )


# NOTE: define /process before /{id} so FastAPI doesn't swallow it as a path param.
@router.post("/subscriptions/process")
async def process_subscriptions(
    year:  int = Query(..., description="Year to process (e.g. 2026)"),
    month: int = Query(..., ge=1, le=12, description="Month 1–12"),
) -> dict:
    """Idempotent endpoint that creates expense transactions for all subscriptions
    whose billing_day has arrived this month and that don't have a transaction yet."""
    created = queries.process_pending_subscriptions(year, month)
    return {"created": created}


@router.put("/subscriptions/{subscription_id}")
async def update_subscription_route(subscription_id: str, body: SubscriptionUpdate) -> dict:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    return queries.update_subscription(subscription_id, **fields)


@router.delete("/subscriptions/{subscription_id}")
async def cancel_subscription_route(subscription_id: str) -> dict:
    """Soft-delete: sets is_active=False and end_date=today.
    Historical budget accuracy is preserved because the end_date lets
    process_pending_subscriptions still bill the month the subscription was cancelled."""
    return queries.cancel_subscription(subscription_id)
