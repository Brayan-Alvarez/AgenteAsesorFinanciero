"""
tools.py — LangGraph/LangChain tools that give the agent access to financial data.

Each function decorated with @tool becomes callable by the LangGraph agent.
The LLM reads the docstring to decide when and how to call each tool, so
docstrings are written for the model, not just for developers.

Data loading strategy:
    DataFrames are loaded lazily on first use via _get_dataframes(), which
    checks the module-level cache before hitting the Sheets API.  This means
    the first call within a session is slow (~2-4s) but all subsequent calls
    within the TTL window are instant.

Error handling:
    Every tool catches all exceptions and returns a descriptive error string.
    This prevents a Sheets API failure or bad data from crashing the agent graph.
"""

import logging
from typing import Optional

from dotenv import load_dotenv
from langchain_core.tools import tool

import data.cache as cache
from data.data_processor import (
    get_budget_summary as _get_budget_summary,
    get_expenses_by_month as _get_expenses_by_month,
    get_monthly_trend as _get_monthly_trend,
    simulate_purchase as _simulate_purchase,
)
from data.sheets_loader import load_budget_sheet, load_expenses_sheet

# Load .env so tools work when called from the terminal or tests without
# a parent process that already loaded environment variables.
load_dotenv()

logger = logging.getLogger(__name__)

# Cache keys used to store the two DataFrames between tool calls.
_CACHE_KEY_BUDGET   = "budget_df"
_CACHE_KEY_EXPENSES = "expenses_df"


def _get_dataframes():
    """
    Return (budget_df, expenses_df), loading from Sheets only when cache is stale.

    Uses the cache layer so repeated tool calls within a session do not trigger
    additional API requests.  On first call per session this will take ~2-4 seconds.
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
# Tools
# ---------------------------------------------------------------------------

@tool
def get_budget_summary() -> dict:
    """
    Return planned vs actual spending for every budget category for the current year.

    Use this tool when the user asks questions like:
    - "How are we doing with our budget?"
    - "Which categories are we overspending?"
    - "How much have we spent in total?"
    - "What is left in our [category] budget?"

    Returns a dict keyed by category name. Each value contains:
        planned (int):    Annual budget in COP.
        actual (int):     Total spent so far in COP.
        remaining (int):  planned - actual (negative means over budget).
        pct_used (float): Percentage of budget consumed.

    Returns an empty dict if data cannot be loaded.
    Returns an error string if an unexpected failure occurs.
    """
    try:
        budget_df, expenses_df = _get_dataframes()
        return _get_budget_summary(budget_df, expenses_df)
    except Exception as exc:
        logger.exception("get_budget_summary failed.")
        return f"Error loading budget summary: {exc}"


@tool
def get_expenses(month: str, person: Optional[str] = None) -> list[dict]:
    """
    Return aggregated expenses for a given month, optionally filtered to one person.

    Use this tool when the user asks questions like:
    - "What did we spend in January?"
    - "Show me Sofi's expenses for March."
    - "What were our biggest spending categories last month?"

    Args:
        month:  Spanish month name, capitalised (e.g. "Enero", "Febrero", "Marzo").
                Must match the month names used in the Sheets tab headers.
        person: Optional person name exactly as it appears in the Sheets tab headers
                (e.g. "Sofi", "Belmont"). Omit to get combined expenses for both people.

    Returns a list of dicts sorted descending by Monto:
        [{"Categoría": "Restaurantes", "Monto": 706869}, ...]

    Returns an empty list if no expenses match the filters.
    Returns an error string if an unexpected failure occurs.
    """
    try:
        _, expenses_df = _get_dataframes()
        filtered = _get_expenses_by_month(expenses_df, month=month, person=person)

        if filtered.empty:
            return []

        # Aggregate by category and sort largest-first so the LLM sees the
        # most significant spending at the top.
        summary = (
            filtered.groupby("Categoría")["Monto"]
            .sum()
            .astype(int)
            .reset_index()
            .sort_values("Monto", ascending=False)
            .rename(columns={"Monto": "total"})
            .to_dict(orient="records")
        )
        return summary
    except Exception as exc:
        logger.exception("get_expenses failed.")
        return f"Error loading expenses for month='{month}', person='{person}': {exc}"


@tool
def get_monthly_trend() -> list[dict]:
    """
    Return total spending per month in chronological order (January → December).

    Use this tool when the user asks questions like:
    - "How has our spending evolved this year?"
    - "Which month did we spend the most?"
    - "Show me our monthly spending trend."
    - "Are we spending more or less than last month?"

    Returns a list of dicts, one per month that has recorded expenses:
        [{"month": "Enero", "total": 1800000}, {"month": "Febrero", "total": 4800000}, ...]

    Returns an empty list if no expense data is available.
    Returns an error string if an unexpected failure occurs.
    """
    try:
        _, expenses_df = _get_dataframes()
        return _get_monthly_trend(expenses_df)
    except Exception as exc:
        logger.exception("get_monthly_trend failed.")
        return f"Error loading monthly trend: {exc}"


@tool
def simulate_purchase(amount: int, category: str) -> dict:
    """
    Simulate the financial impact of a hypothetical one-time purchase.

    Use this tool when the user asks questions like:
    - "Can I buy a $2.800.000 monitor?"
    - "What would happen if I spent $500.000 on clothes?"
    - "Would buying a new phone break our technology budget?"

    Args:
        amount:   Purchase price in COP as a plain integer — no dots, commas,
                  or currency symbols (e.g. 2800000, not "$2.800.000").
        category: The budget category the purchase would be charged to
                  (e.g. "Tecnología", "Gastos diarios", "Regalos").
                  Must match a category name from the budget.

    Returns a dict with:
        can_afford (bool):        True if remaining budget >= amount.
        remaining_after (int):    Budget left in the category after the purchase.
                                  Negative means over budget.
        budget_pct_after (float): Percentage of the category budget consumed
                                  after the hypothetical purchase.
        warning (str | None):     Human-readable caution message, or None if fine.

    Returns an error string if an unexpected failure occurs.
    """
    try:
        budget_df, expenses_df = _get_dataframes()
        return _simulate_purchase(
            amount=amount,
            category=category,
            budget_df=budget_df,
            expenses_df=expenses_df,
        )
    except Exception as exc:
        logger.exception("simulate_purchase failed.")
        return f"Error simulating purchase of {amount} COP in category '{category}': {exc}"


# Convenience list used by graph.py when binding tools to the LLM.
TOOLS = [get_budget_summary, get_expenses, get_monthly_trend, simulate_purchase]
