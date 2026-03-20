"""
tools.py — LangGraph/LangChain tools that give the agent access to financial data.

Each function decorated with @tool becomes callable by the LangGraph agent.
Tools must handle missing or empty data gracefully — return empty results,
never raise exceptions to the agent (exceptions break the graph execution).

Available tools:
    get_budget_summary    — Planned vs actual spend for each category (current year).
    get_expenses          — Filtered expense aggregation by month and/or person.
    get_monthly_trend     — Month-by-month total spending evolution.
    simulate_purchase     — Impact analysis for a hypothetical one-time purchase.

All tools load data via the cache layer (data/cache.py) to avoid repeated
Sheets API calls within a single session.
"""

from langchain_core.tools import tool


@tool
def get_budget_summary() -> dict:
    """
    Return planned vs actual spend for each budget category for the current year.

    No inputs required — always operates on the full annual budget.

    Returns a dict keyed by category with keys:
        presupuesto (int), gastado (int), restante (int), porcentaje (float).
    Returns an empty dict if data cannot be loaded.
    """
    pass  # TODO: implement in Phase 2


@tool
def get_expenses(month: str | None = None, person: str | None = None) -> dict:
    """
    Return aggregated expenses filtered by month and/or person.

    Args:
        month: Spanish month name, e.g. "Enero", "Febrero". None = all months.
        person: Person name as it appears in the Sheets tabs. None = all people.

    Returns a list of dicts with keys: Categoría (str), Monto (int).
    Sorted descending by Monto. Returns an empty list if no data matches.
    """
    pass  # TODO: implement in Phase 2


@tool
def get_monthly_trend() -> list[dict]:
    """
    Return total spending per month, sorted chronologically.

    No inputs required.

    Returns a list of dicts: [{"mes": "Enero", "total": 3500000}, ...].
    Returns an empty list if no expense data is available.
    """
    pass  # TODO: implement in Phase 2


@tool
def simulate_purchase(amount: int, category: str | None = None) -> dict:
    """
    Simulate the financial impact of a one-time purchase.

    Args:
        amount: Purchase price in COP (integer, no decimals or currency symbols).
        category: Optional budget category to deduct from (e.g., "Tecnología").
                  If None, the impact is shown against the overall remaining budget.

    Returns a dict with keys:
        amount (int), can_afford (bool), remaining_after (int),
        category_impact (dict), message (str).
    """
    pass  # TODO: implement in Phase 2
