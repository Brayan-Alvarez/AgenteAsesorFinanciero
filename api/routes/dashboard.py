"""
dashboard.py — Read-only data endpoints for the React dashboard.

Endpoints:
    GET /api/budget          — Planned vs actual for every budget category.
    GET /api/expenses        — Aggregated expenses for a month (+ optional person).
    GET /api/trend           — Month-by-month spending totals in calendar order.

Data loading strategy (same as agent/tools.py):
    DataFrames are pulled from the TTL cache on every request.  The cache is
    shared across the whole process, so the first call after a cold start loads
    from Google Sheets (~2-4 s) and all subsequent calls within the TTL window
    are instant.
"""

import logging
from typing import Optional

import data.cache as cache
from data.data_processor import (
    get_budget_summary as _get_budget_summary,
    get_expenses_by_month as _get_expenses_by_month,
    get_monthly_trend as _get_monthly_trend,
)
from data.sheets_loader import load_budget_sheet, load_expenses_sheet
from fastapi import APIRouter, HTTPException, Query

from api.models import (
    BudgetCategory,
    BudgetResponse,
    ExpenseItem,
    ExpensesResponse,
    MonthTotal,
    TrendResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache keys — must match agent/tools.py so both the agent and the API share
# the same cached DataFrames and avoid redundant Sheets API calls.
_CACHE_KEY_BUDGET   = "budget_df"
_CACHE_KEY_EXPENSES = "expenses_df"


def _get_dataframes():
    """
    Return (budget_df, expenses_df), loading from Sheets only when cache is stale.

    Mirrors the same helper in agent/tools.py so the API and the agent share
    the same in-memory cache without either having to import the other.
    """
    budget_df   = cache.get(_CACHE_KEY_BUDGET)
    expenses_df = cache.get(_CACHE_KEY_EXPENSES)

    if budget_df is None:
        logger.info("Cache miss — loading budget from Google Sheets.")
        budget_df = load_budget_sheet()
        cache.set(_CACHE_KEY_BUDGET, budget_df)

    if expenses_df is None:
        logger.info("Cache miss — loading expenses from Google Sheets.")
        expenses_df = load_expenses_sheet()
        cache.set(_CACHE_KEY_EXPENSES, expenses_df)

    return budget_df, expenses_df


# ---------------------------------------------------------------------------
# GET /api/budget
# ---------------------------------------------------------------------------

@router.get("/budget", response_model=BudgetResponse, summary="Annual budget vs actual spending per category")
async def budget() -> BudgetResponse:
    """
    Return planned vs actual spending for every budget category.

    Useful for rendering a bar chart that shows how each category is tracking
    against the annual budget.
    """
    try:
        budget_df, expenses_df = _get_dataframes()
        summary = _get_budget_summary(budget_df, expenses_df)
    except Exception as exc:
        logger.exception("GET /api/budget failed.")
        raise HTTPException(status_code=500, detail="Could not load budget data.") from exc

    categories = [
        BudgetCategory(name=name, **data)
        for name, data in summary.items()
    ]
    return BudgetResponse(categories=categories)


# ---------------------------------------------------------------------------
# GET /api/expenses
# ---------------------------------------------------------------------------

@router.get("/expenses", response_model=ExpensesResponse, summary="Aggregated expenses for a month")
async def expenses(
    month: str = Query(..., description="Spanish month name, e.g. 'Marzo'."),
    person: Optional[str] = Query(None, description="Person name to filter by. Omit for combined."),
) -> ExpensesResponse:
    """
    Return spending aggregated by category for the given month.

    Pass `person` to narrow results to a single person; omit it to get
    combined expenses for both people.  Results are sorted largest-first so
    the biggest spending categories appear at the top.
    """
    try:
        _, expenses_df = _get_dataframes()
        filtered = _get_expenses_by_month(expenses_df, month=month, person=person)
    except Exception as exc:
        logger.exception("GET /api/expenses failed for month=%r person=%r.", month, person)
        raise HTTPException(status_code=500, detail="Could not load expense data.") from exc

    if filtered.empty:
        items: list[ExpenseItem] = []
    else:
        # Aggregate by category and sort descending so the largest items come first.
        agg = (
            filtered.groupby("Categoría")["Monto"]
            .sum()
            .astype(int)
            .reset_index()
            .sort_values("Monto", ascending=False)
        )
        items = [
            ExpenseItem(category=row["Categoría"], total=int(row["Monto"]))
            for _, row in agg.iterrows()
        ]

    return ExpensesResponse(month=month, person=person, items=items)


# ---------------------------------------------------------------------------
# GET /api/trend
# ---------------------------------------------------------------------------

@router.get("/trend", response_model=TrendResponse, summary="Month-by-month spending totals")
async def trend() -> TrendResponse:
    """
    Return total spending per month in calendar order (Enero → Diciembre).

    Only months that have at least one expense row are included.  Useful for
    rendering a line chart of spending evolution throughout the year.
    """
    try:
        _, expenses_df = _get_dataframes()
        monthly_data = _get_monthly_trend(expenses_df)
    except Exception as exc:
        logger.exception("GET /api/trend failed.")
        raise HTTPException(status_code=500, detail="Could not load trend data.") from exc

    return TrendResponse(trend=[MonthTotal(**item) for item in monthly_data])
