"""
summary.py — Supabase-backed aggregate endpoints for the Dashboard.

These replace the legacy Sheets-based /api/budget, /api/expenses, /api/trend
endpoints once Supabase has the full transaction history.

GET /api/summary/budget?year=&month=&user_id=   → planned vs actual per category
GET /api/summary/trend?year=&user_id=            → monthly spending totals
GET /api/summary/expenses?year=&month=&user_id= → spending by category
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()

SPANISH_MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


@router.get("/summary/budget")
async def budget_summary(
    year:    int           = Query(...),
    month:   int           = Query(...),
    user_id: Optional[str] = Query(None),
):
    """
    Planned vs actual spending per category for the given month.

    - planned: sum of budget rows for the month (all users, or filtered by user_id)
    - actual:  sum of expense transactions for the month
    - Returns all categories that have either a budget or transactions.
    """
    try:
        budget_rows = q.get_budget(year, month, user_id)
        txn_rows    = q.get_transactions(user_id=user_id, year=year, month=month)

        planned: dict[str, dict] = {}
        for row in budget_rows:
            cat  = row.get("categories") or {}
            name = cat.get("name", "?")
            if name not in planned:
                planned[name] = {"planned": 0, "color": cat.get("color", "#94a3b8"),
                                 "icon": cat.get("icon", "📦")}
            planned[name]["planned"] += row["amount"]

        actual: dict[str, int] = {}
        cat_meta: dict[str, dict] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat  = txn.get("categories") or {}
            name = cat.get("name", "?")
            actual[name] = actual.get(name, 0) + txn["amount"]
            if name not in cat_meta:
                cat_meta[name] = {"color": cat.get("color", "#94a3b8"),
                                  "icon":  cat.get("icon", "📦")}

        all_cats = set(planned) | set(actual)
        result = []
        for cat_name in sorted(all_cats):
            p    = planned.get(cat_name, {}).get("planned", 0)
            a    = actual.get(cat_name, 0)
            meta = planned.get(cat_name) or cat_meta.get(cat_name, {})
            result.append({
                "name":      cat_name,
                "planned":   p,
                "actual":    a,
                "remaining": p - a,
                "pct_used":  round(a / p * 100, 1) if p > 0 else 0.0,
                "color":     meta.get("color", "#94a3b8"),
                "icon":      meta.get("icon", "📦"),
            })

        return {"categories": result, "year": year, "month": month}

    except Exception as exc:
        logger.exception("GET /api/summary/budget failed.")
        raise HTTPException(500, "Could not compute budget summary.") from exc


@router.get("/summary/trend")
async def trend_summary(
    year:    int           = Query(...),
    user_id: Optional[str] = Query(None),
):
    """
    Total expense spending per month for the year, in calendar order.
    """
    try:
        txn_rows = q.get_transactions(user_id=user_id, year=year)

        totals: dict[int, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            month_num = int(txn["date"][5:7])
            totals[month_num] = totals.get(month_num, 0) + txn["amount"]

        trend = [
            {"month": SPANISH_MONTHS[m - 1], "total": totals[m]}
            for m in sorted(totals)
        ]
        return {"trend": trend, "year": year}

    except Exception as exc:
        logger.exception("GET /api/summary/trend failed.")
        raise HTTPException(500, "Could not compute trend.") from exc


@router.get("/summary/expenses")
async def expenses_summary(
    year:    int           = Query(...),
    month:   int           = Query(...),
    user_id: Optional[str] = Query(None),
):
    """
    Spending by category for the given month, sorted largest-first.
    """
    try:
        txn_rows = q.get_transactions(user_id=user_id, year=year, month=month)

        totals: dict[str, dict] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat  = txn.get("categories") or {}
            name = cat.get("name", "?")
            if name not in totals:
                totals[name] = {"total": 0, "color": cat.get("color", "#94a3b8"),
                                "icon": cat.get("icon", "📦")}
            totals[name]["total"] += txn["amount"]

        items = sorted(
            [{"category": k, **v} for k, v in totals.items()],
            key=lambda x: x["total"],
            reverse=True,
        )
        month_name = SPANISH_MONTHS[month - 1] if 1 <= month <= 12 else str(month)
        return {"month": month_name, "year": year, "items": items}

    except Exception as exc:
        logger.exception("GET /api/summary/expenses failed.")
        raise HTTPException(500, "Could not compute expenses summary.") from exc
