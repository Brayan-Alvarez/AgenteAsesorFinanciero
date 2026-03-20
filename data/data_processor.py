"""
data_processor.py — Builds aggregated summaries from raw expense and budget DataFrames.

Responsibilities:
- Summarize expenses by category, month, and person.
- Compare actual spend against planned budget.
- Produce month-by-month spending trend data.
- All monetary values stay as COP integers (no floats).

All functions receive DataFrames produced by sheets_loader.py and return
plain Python dicts or DataFrames that the agent tools can consume directly.
"""

import pandas as pd


def get_budget_summary(
    budget_df: pd.DataFrame,
    expenses_df: pd.DataFrame,
) -> dict[str, dict]:
    """
    Compare planned budget vs actual spend for each category.

    Args:
        budget_df: Annual budget DataFrame with columns ['Categoría', 'Presupuesto'].
        expenses_df: Full expenses DataFrame produced by sheets_loader.load_expenses().

    Returns:
        Dict keyed by category name. Each value is a dict with:
            {
                "presupuesto": int,   # Planned amount for the year (COP)
                "gastado": int,       # Total spent so far (COP)
                "restante": int,      # presupuesto - gastado
                "porcentaje": float,  # gastado / presupuesto * 100
            }
        Returns an empty dict if either DataFrame is empty.
    """
    pass  # TODO: implement in Phase 1


def get_expenses_summary(
    expenses_df: pd.DataFrame,
    month: str | None = None,
    person: str | None = None,
) -> pd.DataFrame:
    """
    Filter and aggregate expenses by category for a given month and/or person.

    Args:
        expenses_df: Full expenses DataFrame.
        month: Spanish month name to filter by (e.g., "Enero"). None = all months.
        person: Person name to filter by. None = all people.

    Returns:
        DataFrame with columns ['Categoría', 'Monto'] aggregated by sum,
        sorted descending by Monto.
        Returns an empty DataFrame if no matching rows are found.
    """
    pass  # TODO: implement in Phase 1


def get_monthly_trend(expenses_df: pd.DataFrame) -> list[dict]:
    """
    Calculate total spending per month across all categories and people.

    Args:
        expenses_df: Full expenses DataFrame.

    Returns:
        List of dicts, one per month, sorted chronologically:
            [{"mes": "Enero", "total": 3500000}, ...]
        Returns an empty list if the DataFrame is empty.
    """
    pass  # TODO: implement in Phase 1


def simulate_purchase(
    amount: int,
    budget_summary: dict[str, dict],
    category: str | None = None,
) -> dict:
    """
    Simulate the financial impact of a one-time purchase.

    Calculates how the purchase would affect remaining budget — overall and
    optionally within a specific category.

    Args:
        amount: Purchase amount in COP (integer, no decimals).
        budget_summary: Output of get_budget_summary().
        category: Optional category to deduct from. If None, shows overall impact.

    Returns:
        Dict with:
            {
                "amount": int,              # The purchase amount
                "can_afford": bool,         # True if remaining budget >= amount
                "remaining_after": int,     # Overall remaining budget after purchase
                "category_impact": dict,    # Per-category breakdown (if category given)
                "message": str,             # Human-readable summary
            }
    """
    pass  # TODO: implement in Phase 1
