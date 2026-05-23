"""
tools.py — LangGraph/LangChain tools that give the agent access to financial data.

Data source: Supabase (via db/queries.py).
All tools cache their results for 5 minutes to avoid redundant DB calls.
Every tool catches exceptions and returns a descriptive error string so a
single failure never crashes the agent graph.
"""

import logging
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from langchain_core.tools import tool

import data.cache as cache
import db.queries as q

load_dotenv()

logger = logging.getLogger(__name__)

_CACHE_CATEGORIES   = "supabase_categories"
_CACHE_BUDGET       = "supabase_budget_summary"
_CACHE_TREND        = "supabase_trend"

SPANISH_MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _current_year() -> int:
    return date.today().year


def _current_month() -> int:
    return date.today().month


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_categories() -> dict[str, dict]:
    """Return {category_id: {name, icon, color}} from cache or Supabase."""
    cats = cache.get(_CACHE_CATEGORIES)
    if cats is None:
        raw = q.get_categories()
        cats = {c["id"]: c for c in raw}
        cache.set(_CACHE_CATEGORIES, cats)
    return cats


def _month_number(month_name: str) -> Optional[int]:
    """Convert Spanish month name to 1-12, or None if unrecognized."""
    try:
        return SPANISH_MONTHS.index(month_name.strip().capitalize()) + 1
    except ValueError:
        return None


# ── Tools ──────────────────────────────────────────────────────────────────────

@tool
def get_budget_summary(month: Optional[int] = None) -> dict:
    """
    Return planned vs actual spending for every budget category.

    Use this tool when the user asks:
    - "How are we doing with our budget?"
    - "Which categories are we overspending?"
    - "How much have we spent in total this month?"
    - "What is left in our [category] budget?"

    Args:
        month: Month number (1-12). Defaults to the current month.

    Returns a dict keyed by category name. Each value contains:
        planned (int):    Budgeted amount in COP for the month (sum of all users).
        actual (int):     Amount spent so far in COP.
        remaining (int):  planned - actual (negative = over budget).
        pct_used (float): Percentage of budget consumed.

    Returns an empty dict if no data is found.
    Returns an error string if an unexpected failure occurs.
    """
    try:
        year  = _current_year()
        month = month or _current_month()

        # Load budget rows (all users for the month)
        budget_rows = q.get_budget(year, month)
        # Load transactions for the month (all users)
        txn_rows    = q.get_transactions(year=year, month=month)
        categories  = _get_categories()

        # Aggregate budget per category (sum all users)
        planned: dict[str, int] = {}
        for row in budget_rows:
            cat_name = row.get("categories", {}).get("name") or categories.get(row["category_id"], {}).get("name", "?")
            planned[cat_name] = planned.get(cat_name, 0) + row["amount"]

        # Aggregate actual spend per category
        actual: dict[str, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = txn.get("categories", {}).get("name") or categories.get(txn["category_id"], {}).get("name", "?")
            actual[cat_name] = actual.get(cat_name, 0) + txn["amount"]

        # Build summary (union of planned + actual categories)
        all_cats = set(planned) | set(actual)
        result = {}
        for cat in sorted(all_cats):
            p = planned.get(cat, 0)
            a = actual.get(cat, 0)
            result[cat] = {
                "planned":   p,
                "actual":    a,
                "remaining": p - a,
                "pct_used":  round((a / p * 100), 1) if p > 0 else 0.0,
            }
        return result

    except Exception as exc:
        logger.exception("get_budget_summary failed.")
        return f"Error loading budget summary: {exc}"


@tool
def get_expenses(month: str, person: Optional[str] = None) -> list[dict]:
    """
    Return aggregated expenses by category for a given month.

    Use this tool when the user asks:
    - "What did we spend in January?"
    - "Show me Sofi's expenses for March."
    - "What were our biggest spending categories last month?"

    Args:
        month:  Spanish month name, capitalised (e.g. "Enero", "Febrero").
        person: Optional person name (e.g. "Sofi", "Belmont"). Omit for combined.

    Returns a list sorted descending by total:
        [{"Categoría": "Restaurantes", "total": 706869}, ...]

    Returns an empty list if no expenses match.
    Returns an error string on failure.
    """
    try:
        month_num = _month_number(month)
        if month_num is None:
            return f"Unrecognized month name: '{month}'. Use Spanish names like 'Enero'."

        year  = _current_year()
        users = q.get_users()

        # Resolve person name → user_id
        user_id = None
        if person:
            matched = [u for u in users if u["name"].lower() == person.lower()]
            if not matched:
                return f"Person '{person}' not found. Available: {[u['name'] for u in users]}"
            user_id = matched[0]["id"]

        txn_rows  = q.get_transactions(user_id=user_id, year=year, month=month_num)
        cats      = _get_categories()

        totals: dict[str, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = txn.get("categories", {}).get("name") or cats.get(txn["category_id"], {}).get("name", "?")
            totals[cat_name] = totals.get(cat_name, 0) + txn["amount"]

        return sorted(
            [{"Categoría": k, "total": v} for k, v in totals.items()],
            key=lambda x: x["total"],
            reverse=True,
        )

    except Exception as exc:
        logger.exception("get_expenses failed.")
        return f"Error loading expenses for month='{month}', person='{person}': {exc}"


@tool
def get_monthly_trend() -> list[dict]:
    """
    Return total spending per month in chronological order (Enero → current month).

    Use this tool when the user asks:
    - "How has our spending evolved this year?"
    - "Which month did we spend the most?"
    - "Show me our monthly spending trend."

    Returns:
        [{"month": "Enero", "total": 1800000}, {"month": "Febrero", "total": 4800000}, ...]

    Returns an empty list if no data is available.
    Returns an error string on failure.
    """
    try:
        year     = _current_year()
        txn_rows = q.get_transactions(year=year)

        totals: dict[int, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            month_num = int(txn["date"][5:7])
            totals[month_num] = totals.get(month_num, 0) + txn["amount"]

        return [
            {"month": SPANISH_MONTHS[m - 1], "total": totals[m]}
            for m in sorted(totals)
        ]

    except Exception as exc:
        logger.exception("get_monthly_trend failed.")
        return f"Error loading monthly trend: {exc}"


@tool
def simulate_purchase(amount: int, category: str) -> dict:
    """
    Simulate the financial impact of a hypothetical one-time purchase.

    Use this tool when the user asks:
    - "Can I buy a $2.800.000 monitor?"
    - "What would happen if I spent $500.000 on clothes?"
    - "Would buying a new phone break our budget?"

    Args:
        amount:   Purchase price in COP as a plain integer (e.g. 2800000).
        category: Budget category name in Spanish (e.g. "Tecnología", "Restaurantes").

    Returns a dict with:
        can_afford (bool):        True if remaining budget >= amount.
        remaining_after (int):    Budget left after the purchase (negative = over).
        budget_pct_after (float): Percentage consumed after the purchase.
        warning (str | None):     Caution message, or None if fine.

    Returns an error string on failure.
    """
    try:
        year  = _current_year()
        month = _current_month()

        budget_rows = q.get_budget(year, month)
        txn_rows    = q.get_transactions(year=year, month=month)
        cats        = _get_categories()

        # Find category (case-insensitive)
        cat_lower = category.lower()
        planned = 0
        for row in budget_rows:
            cat_name = row.get("categories", {}).get("name") or cats.get(row["category_id"], {}).get("name", "")
            if cat_name.lower() == cat_lower:
                planned += row["amount"]

        actual = 0
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = txn.get("categories", {}).get("name") or cats.get(txn["category_id"], {}).get("name", "")
            if cat_name.lower() == cat_lower:
                actual += txn["amount"]

        remaining       = planned - actual
        remaining_after = remaining - amount
        pct_after       = round(((actual + amount) / planned * 100), 1) if planned > 0 else 0.0

        warning = None
        if planned == 0:
            warning = f"No budget defined for category '{category}' this month."
        elif remaining_after < 0:
            warning = f"This purchase would exceed the {category} budget by ${abs(remaining_after):,} COP."
        elif pct_after > 85:
            warning = f"This purchase would consume {pct_after}% of the {category} budget."

        return {
            "can_afford":        remaining_after >= 0,
            "remaining_before":  remaining,
            "remaining_after":   remaining_after,
            "budget_pct_after":  pct_after,
            "warning":           warning,
        }

    except Exception as exc:
        logger.exception("simulate_purchase failed.")
        return f"Error simulating purchase of {amount} COP in '{category}': {exc}"


@tool
def get_debt_summary() -> list[dict]:
    """
    Return a summary of all active debts and their pending balances.

    Use this tool when the user asks:
    - "How much do we owe in total?"
    - "What is the balance on the Visa card?"
    - "Show me all our debts."
    - "Which debts are still active?"

    Returns a list of dicts:
        [{"name": "Tarjeta Visa", "total": 3000000, "pending": 1450000,
          "paid": 1550000, "pct_paid": 51.7, "status": "active"}, ...]

    Returns an empty list if there are no debts.
    Returns an error string on failure.
    """
    try:
        debts = q.get_debts()
        result = []
        for d in debts:
            paid    = d["total_amount"] - d["pending_amount"]
            pct     = round(paid / d["total_amount"] * 100, 1) if d["total_amount"] > 0 else 0.0
            result.append({
                "name":     d["name"],
                "total":    d["total_amount"],
                "pending":  d["pending_amount"],
                "paid":     paid,
                "pct_paid": pct,
                "status":   d["status"],
                "owner":    d.get("users", {}).get("name") if d.get("users") else "Compartida",
            })
        return result

    except Exception as exc:
        logger.exception("get_debt_summary failed.")
        return f"Error loading debts: {exc}"


# Convenience list used by graph.py when binding tools to the LLM.
TOOLS = [get_budget_summary, get_expenses, get_monthly_trend, simulate_purchase, get_debt_summary]
