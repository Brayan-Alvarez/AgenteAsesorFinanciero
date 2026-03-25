"""
data_processor.py — Builds financial summaries from the DataFrames produced by sheets_loader.py.

Responsibilities:
- Compare actual spending against the annual budget, per category.
- Filter expenses by month and/or person for targeted queries.
- Aggregate monthly totals to show spending trends over time.
- Simulate the impact of a hypothetical purchase on the remaining budget.

All monetary amounts are COP integers (no floats, ever).
"""

import logging
from typing import Optional

import pandas as pd

from data.sheets_loader import SPANISH_MONTHS

logger = logging.getLogger(__name__)


def get_budget_summary(
    budget_df: pd.DataFrame,
    expenses_df: pd.DataFrame,
) -> dict[str, dict]:
    """
    Compare planned budget vs actual spending for each category.

    Merges the annual budget with total expenses aggregated by category.
    Categories that appear in expenses but not in the budget are included
    with planned = 0 (unbudgeted spending).

    Args:
        budget_df: DataFrame with columns ['Categoría', 'Presupuesto'].
                   Each row is one budget category for the full year.
        expenses_df: DataFrame with columns including ['Categoría', 'Monto'].
                     All expenses across all months and people.

    Returns:
        A dict keyed by category name. Each value is a dict with:
            - planned (int):    Budgeted amount in COP.
            - actual (int):     Total spent so far in COP.
            - remaining (int):  planned - actual (negative means over budget).
            - pct_used (float): Percentage of budget consumed, rounded to 1 decimal.

        Example:
            {
                "Alimentación": {
                    "planned": 500_000,
                    "actual": 320_000,
                    "remaining": 180_000,
                    "pct_used": 64.0,
                }
            }

        Returns an empty dict if both DataFrames are empty.
    """
    if budget_df.empty and expenses_df.empty:
        return {}

    # --- Aggregate actual spending by category ---
    if expenses_df.empty:
        actual_by_category: pd.Series = pd.Series(dtype=int)
    else:
        actual_by_category = (
            expenses_df.groupby("Categoría")["Monto"]
            .sum()
            .astype(int)
        )

    # Collect all unique categories from both sources so that unbudgeted
    # categories (present in expenses but absent from budget) are included.
    budget_categories = set(budget_df["Categoría"].tolist()) if not budget_df.empty else set()
    expense_categories = set(actual_by_category.index.tolist())
    all_categories = budget_categories | expense_categories

    # Build an O(1) lookup dict from the budget DataFrame.
    budget_lookup: dict[str, int] = {}
    if not budget_df.empty:
        budget_lookup = dict(
            zip(budget_df["Categoría"], budget_df["Presupuesto"].astype(int))
        )

    result: dict[str, dict] = {}

    for category in sorted(all_categories):
        planned = budget_lookup.get(category, 0)  # 0 if not budgeted
        actual = int(actual_by_category.get(category, 0))
        remaining = planned - actual

        # Avoid division-by-zero: if nothing was planned, pct_used is 100%
        # when there is actual spending (unbudgeted), otherwise 0%.
        if planned == 0:
            pct_used = 100.0 if actual > 0 else 0.0
        else:
            pct_used = round(actual / planned * 100, 1)

        result[category] = {
            "planned": planned,
            "actual": actual,
            "remaining": remaining,
            "pct_used": pct_used,
        }

    logger.info("Budget summary built for %d categories.", len(result))
    return result


def get_expenses_by_month(
    expenses_df: pd.DataFrame,
    month: str,
    person: Optional[str] = None,
) -> pd.DataFrame:
    """
    Filter expenses for a specific month, optionally narrowed to one person.

    Uses the 'Mes' column (added by sheets_loader) which contains the Spanish
    month name (e.g., "Enero", "Febrero") to perform the filter.

    Args:
        expenses_df: Unified expenses DataFrame from sheets_loader.load_expenses().
        month: Spanish month name (e.g., "Enero"). Case-sensitive.
        person: Optional person name to filter by (must match the 'Persona' column).
                If None, expenses for all people in that month are returned.

    Returns:
        Filtered DataFrame with the same schema as expenses_df.
        Returns an empty DataFrame (with correct columns) if no rows match.
    """
    if expenses_df.empty:
        return expenses_df.copy()

    # Filter by the derived 'Mes' column set by sheets_loader.
    mask = expenses_df["Mes"] == month

    if person is not None:
        mask = mask & (expenses_df["Persona"] == person)

    filtered = expenses_df.loc[mask].reset_index(drop=True)

    logger.info(
        "get_expenses_by_month('%s', person=%r): %d rows returned.",
        month,
        person,
        len(filtered),
    )
    return filtered


def get_monthly_trend(expenses_df: pd.DataFrame) -> list[dict]:
    """
    Aggregate total spending per month across all categories and people.

    Months are returned in calendar order (Enero → Diciembre), not in the
    order they happen to appear in the data.

    Args:
        expenses_df: Unified expenses DataFrame from sheets_loader.load_expenses().

    Returns:
        A list of dicts, one per month that has at least one expense row:
            [
                {"month": "Enero",   "total": 1_200_000},
                {"month": "Febrero", "total":   980_000},
                ...
            ]
        Returns an empty list if expenses_df is empty.
    """
    if expenses_df.empty:
        return []

    # Sum Monto by the 'Mes' column and convert to a plain Python dict.
    monthly_totals: dict[str, int] = (
        expenses_df.groupby("Mes")["Monto"]
        .sum()
        .astype(int)
        .to_dict()
    )

    # Re-order by canonical Spanish month order so the trend is chronological.
    # Months not in SPANISH_MONTHS are silently dropped (shouldn't happen with
    # clean data, but this guard prevents confusing output).
    result = [
        {"month": month, "total": monthly_totals[month]}
        for month in SPANISH_MONTHS
        if month in monthly_totals
    ]

    logger.info("Monthly trend built: %d months with data.", len(result))
    return result


def simulate_purchase(
    amount: int,
    category: str,
    budget_df: pd.DataFrame,
    expenses_df: pd.DataFrame,
) -> dict:
    """
    Estimate the financial impact of a hypothetical one-time purchase.

    Checks how much budget remains in the given category and whether the
    purchase would fit within it.

    Args:
        amount: Purchase price in COP (integer, must be > 0).
        category: The spending category the purchase would be charged to.
        budget_df: Annual budget DataFrame (columns: Categoría, Presupuesto).
        expenses_df: All expenses recorded so far.

    Returns:
        A dict with:
            - can_afford (bool):        True if remaining budget >= amount.
            - remaining_after (int):    Remaining budget after the hypothetical
                                        purchase. Negative means over budget.
            - budget_pct_after (float): Percentage of the category budget consumed
                                        after the purchase (rounded to 1 decimal).
                                        100.0 when planned = 0 and amount > 0.
            - warning (str | None):     Human-readable caution message when the
                                        purchase would overshoot the budget or when
                                        the category has no budget allocation.
                                        None if everything looks fine.

        Example (affordable):
            {"can_afford": True,  "remaining_after": 180_000, "budget_pct_after": 96.0, "warning": None}

        Example (over budget):
            {"can_afford": False, "remaining_after": -120_000, "budget_pct_after": 124.0,
             "warning": "This purchase exceeds the 'Tecnología' budget by $120.000 COP."}
    """
    # Reuse get_budget_summary to get current planned vs actual per category.
    summary = get_budget_summary(budget_df, expenses_df)

    if category in summary:
        planned = summary[category]["planned"]
        actual = summary[category]["actual"]
    else:
        # Category not found anywhere — fully unbudgeted, no spend yet.
        planned = 0
        actual = 0

    remaining_after = (planned - actual) - amount

    # Recalculate percentage assuming the purchase is made.
    new_actual = actual + amount
    if planned == 0:
        budget_pct_after = 100.0 if new_actual > 0 else 0.0
    else:
        budget_pct_after = round(new_actual / planned * 100, 1)

    can_afford = remaining_after >= 0

    # Build a warning message for problematic scenarios.
    warning: Optional[str] = None

    if planned == 0:
        # No budget line exists for this category at all.
        formatted = _format_cop(amount)
        warning = (
            f"The category '{category}' has no budget allocated. "
            f"This {formatted} purchase would be fully unbudgeted."
        )
    elif not can_afford:
        # The purchase fits in no remaining budget.
        overshoot = abs(remaining_after)
        warning = (
            f"This purchase exceeds the '{category}' budget by {_format_cop(overshoot)}."
        )

    return {
        "can_afford": can_afford,
        "remaining_after": remaining_after,
        "budget_pct_after": budget_pct_after,
        "warning": warning,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _format_cop(amount: int) -> str:
    """
    Format a COP integer with dot-thousands separator, as is conventional in Colombia.

    Example:
        _format_cop(2_800_000) → "$2.800.000 COP"
    """
    # Python's comma-grouping format, then swap commas for dots.
    return f"${amount:,} COP".replace(",", ".")
