"""
test_processor.py — Unit tests for data/data_processor.py.

All fixtures are small hardcoded DataFrames — no mocks, no API calls.

Coverage:
- get_budget_summary(): correct planned/actual/remaining/pct_used per category.
- get_budget_summary(): includes unbudgeted categories (planned=0, pct_used=100).
- get_budget_summary(): handles empty DataFrames without raising.
- simulate_purchase(): can_afford=True when purchase fits in remaining budget.
- simulate_purchase(): can_afford=False with a warning when purchase exceeds budget.
- simulate_purchase(): warning for unbudgeted categories.
- simulate_purchase(): correct budget_pct_after calculation.
- simulate_purchase(): handles empty DataFrames without raising.
- get_monthly_trend(): returns months in calendar order, not insertion order.
- get_monthly_trend(): totals sum all expenses for each month.
- get_monthly_trend(): returns empty list for empty input.
- get_expenses_by_month(): filters rows by Mes column.
- get_expenses_by_month(): filters by both Mes and Persona when person is given.
- get_expenses_by_month(): returns empty DataFrame when no rows match.
- get_expenses_by_month(): handles empty input DataFrame without raising.
"""

import pandas as pd
import pytest

from data.data_processor import (
    get_budget_summary,
    get_expenses_by_month,
    get_monthly_trend,
    simulate_purchase,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def budget_df() -> pd.DataFrame:
    """Annual budget for three categories."""
    return pd.DataFrame({
        "Categoría":  ["Alimentación", "Transporte", "Tecnología"],
        "Presupuesto": [500_000,        200_000,       1_000_000],
    })


@pytest.fixture
def expenses_df() -> pd.DataFrame:
    """
    Four expense rows across two months and two people.

    Enero:   Juan → Alimentación $150k,  Ana → Transporte $30k  (total $180k)
    Febrero: Juan → Alimentación $80k,   Ana → Tecnología $400k (total $480k)

    Category totals (all time):
        Alimentación → 230_000  (150k + 80k)
        Transporte   →  30_000
        Tecnología   → 400_000
    """
    return pd.DataFrame({
        "Fecha": pd.to_datetime(
            ["2024-01-15", "2024-01-20", "2024-02-05", "2024-02-10"]
        ),
        "Categoría":   ["Alimentación", "Transporte", "Alimentación", "Tecnología"],
        "Descripción": ["Supermercado", "Taxi",        "Frutas",       "Auriculares"],
        "Monto":       [150_000,         30_000,         80_000,        400_000],
        "Observaciones": ["",            "Uber",          "",            ""],
        "Persona": ["Juan", "Ana",  "Juan", "Ana"],
        "Mes":     ["Enero", "Enero", "Febrero", "Febrero"],
    })


# ---------------------------------------------------------------------------
# Tests for get_budget_summary
# ---------------------------------------------------------------------------

def test_get_budget_summary_includes_all_categories(
    budget_df: pd.DataFrame, expenses_df: pd.DataFrame
) -> None:
    """Result must contain every category from both budget and expenses DataFrames."""
    result = get_budget_summary(budget_df, expenses_df)

    assert "Alimentación" in result
    assert "Transporte"   in result
    assert "Tecnología"   in result


def test_get_budget_summary_correct_values(
    budget_df: pd.DataFrame, expenses_df: pd.DataFrame
) -> None:
    """planned / actual / remaining / pct_used must all be computed correctly."""
    result = get_budget_summary(budget_df, expenses_df)

    alim = result["Alimentación"]
    assert alim["planned"]   == 500_000
    assert alim["actual"]    == 230_000        # 150k (Enero) + 80k (Febrero)
    assert alim["remaining"] == 270_000        # 500k - 230k
    assert alim["pct_used"]  == pytest.approx(46.0, abs=0.1)

    transp = result["Transporte"]
    assert transp["planned"]   == 200_000
    assert transp["actual"]    ==  30_000
    assert transp["remaining"] == 170_000
    assert transp["pct_used"]  == pytest.approx(15.0, abs=0.1)

    tech = result["Tecnología"]
    assert tech["planned"]   == 1_000_000
    assert tech["actual"]    ==   400_000
    assert tech["remaining"] ==   600_000
    assert tech["pct_used"]  == pytest.approx(40.0, abs=0.1)


def test_get_budget_summary_unbudgeted_category() -> None:
    """
    A category that appears only in expenses (not in budget) must get
    planned=0, pct_used=100.0, and a negative remaining equal to actual spend.
    """
    budget_df   = pd.DataFrame({"Categoría": ["Alimentación"], "Presupuesto": [500_000]})
    expenses_df = pd.DataFrame({"Categoría": ["Salud"],        "Monto":       [50_000]})

    result = get_budget_summary(budget_df, expenses_df)

    salud = result["Salud"]
    assert salud["planned"]   == 0
    assert salud["actual"]    == 50_000
    assert salud["remaining"] == -50_000
    assert salud["pct_used"]  == 100.0


def test_get_budget_summary_both_empty_returns_empty_dict() -> None:
    """Both DataFrames empty → empty dict, no exception."""
    assert get_budget_summary(pd.DataFrame(), pd.DataFrame()) == {}


def test_get_budget_summary_no_expenses(budget_df: pd.DataFrame) -> None:
    """With no expenses, actual=0 and remaining=planned for every category."""
    # Pass an empty DataFrame that still has the required column names.
    empty_expenses = pd.DataFrame(columns=["Categoría", "Monto"])
    result = get_budget_summary(budget_df, empty_expenses)

    for category in ["Alimentación", "Transporte", "Tecnología"]:
        assert result[category]["actual"]    == 0
        assert result[category]["remaining"] == result[category]["planned"]
        assert result[category]["pct_used"]  == 0.0


# ---------------------------------------------------------------------------
# Tests for simulate_purchase
# ---------------------------------------------------------------------------

def test_simulate_purchase_can_afford(
    budget_df: pd.DataFrame, expenses_df: pd.DataFrame
) -> None:
    """A purchase within remaining budget → can_afford=True, no warning."""
    # Alimentación remaining = 270_000; purchase = 100_000 → fits.
    result = simulate_purchase(100_000, "Alimentación", budget_df, expenses_df)

    assert result["can_afford"] is True
    assert result["remaining_after"] == 170_000   # 270k - 100k
    assert result["warning"] is None


def test_simulate_purchase_cannot_afford(
    budget_df: pd.DataFrame, expenses_df: pd.DataFrame
) -> None:
    """A purchase exceeding remaining budget → can_afford=False with a warning."""
    # Tecnología: planned=1_000_000, actual=400_000, remaining=600_000
    # Purchase of 900_000 → remaining_after = 600_000 - 900_000 = -300_000
    result = simulate_purchase(900_000, "Tecnología", budget_df, expenses_df)

    assert result["can_afford"] is False
    assert result["remaining_after"] == -300_000
    assert result["warning"] is not None
    assert "Tecnología" in result["warning"]


def test_simulate_purchase_unbudgeted_category_warning(
    expenses_df: pd.DataFrame,
) -> None:
    """Purchasing in a category with no budget line triggers an 'unbudgeted' warning."""
    budget_df = pd.DataFrame({"Categoría": ["Alimentación"], "Presupuesto": [500_000]})

    result = simulate_purchase(50_000, "Salud", budget_df, expenses_df)

    assert result["warning"] is not None
    # The warning must mention either "no budget" or "unbudgeted" (case-insensitive).
    warning_lower = result["warning"].lower()
    assert "no budget" in warning_lower or "unbudgeted" in warning_lower


def test_simulate_purchase_budget_pct_after(
    budget_df: pd.DataFrame, expenses_df: pd.DataFrame
) -> None:
    """budget_pct_after must reflect (actual + purchase_amount) / planned * 100."""
    # Transporte: planned=200_000, actual=30_000
    # Purchase of 20_000 → new_actual=50_000 → pct = 50k/200k*100 = 25.0
    result = simulate_purchase(20_000, "Transporte", budget_df, expenses_df)

    assert result["budget_pct_after"] == pytest.approx(25.0, abs=0.1)


def test_simulate_purchase_empty_dataframes() -> None:
    """simulate_purchase must not raise when both DataFrames are empty."""
    result = simulate_purchase(
        500_000, "Cualquiera", pd.DataFrame(), pd.DataFrame()
    )

    # Category has no budget allocation → warning expected, no crash.
    assert "can_afford" in result
    assert result["warning"] is not None


# ---------------------------------------------------------------------------
# Tests for get_monthly_trend
# ---------------------------------------------------------------------------

def test_get_monthly_trend_calendar_order(expenses_df: pd.DataFrame) -> None:
    """Months must appear in calendar order (Enero before Febrero), not data order."""
    trend = get_monthly_trend(expenses_df)

    months = [entry["month"] for entry in trend]
    assert months == ["Enero", "Febrero"]


def test_get_monthly_trend_correct_totals(expenses_df: pd.DataFrame) -> None:
    """Each month entry must sum all expenses (all people, all categories) for that month."""
    trend    = get_monthly_trend(expenses_df)
    by_month = {entry["month"]: entry["total"] for entry in trend}

    # Enero:   150_000 (Juan) + 30_000 (Ana)  = 180_000
    assert by_month["Enero"]   == 180_000
    # Febrero:  80_000 (Juan) + 400_000 (Ana) = 480_000
    assert by_month["Febrero"] == 480_000


def test_get_monthly_trend_empty_input_returns_empty_list() -> None:
    """Empty DataFrame → empty list, no exception."""
    assert get_monthly_trend(pd.DataFrame()) == []


def test_get_monthly_trend_single_month() -> None:
    """A single month with multiple rows must produce exactly one entry."""
    df = pd.DataFrame({
        "Mes":   ["Marzo", "Marzo"],
        "Monto": [100_000, 200_000],
    })
    trend = get_monthly_trend(df)

    assert len(trend) == 1
    assert trend[0]["month"] == "Marzo"
    assert trend[0]["total"] == 300_000


def test_get_monthly_trend_unsorted_input_still_sorted() -> None:
    """Even if expense rows are in reverse order, output must be calendar-sorted."""
    # Provide Marzo before Enero in the data — output must still be Enero first.
    df = pd.DataFrame({
        "Mes":   ["Marzo", "Enero"],
        "Monto": [50_000,  20_000],
    })
    trend = get_monthly_trend(df)

    months = [entry["month"] for entry in trend]
    assert months == ["Enero", "Marzo"]


# ---------------------------------------------------------------------------
# Tests for get_expenses_by_month
# ---------------------------------------------------------------------------

def test_get_expenses_by_month_filters_by_month(expenses_df: pd.DataFrame) -> None:
    """Only rows matching the given month must be returned."""
    result = get_expenses_by_month(expenses_df, "Enero")

    assert len(result) == 2
    assert (result["Mes"] == "Enero").all()


def test_get_expenses_by_month_filters_by_month_and_person(
    expenses_df: pd.DataFrame,
) -> None:
    """When person is specified, only that person's rows for the month are returned."""
    result = get_expenses_by_month(expenses_df, "Enero", person="Juan")

    assert len(result) == 1
    assert result.iloc[0]["Persona"] == "Juan"
    assert result.iloc[0]["Mes"]     == "Enero"


def test_get_expenses_by_month_no_match_returns_empty(
    expenses_df: pd.DataFrame,
) -> None:
    """A month with no rows must return an empty DataFrame, not raise."""
    result = get_expenses_by_month(expenses_df, "Diciembre")

    assert isinstance(result, pd.DataFrame)
    assert result.empty


def test_get_expenses_by_month_empty_input() -> None:
    """Empty input DataFrame must return an empty DataFrame without raising."""
    result = get_expenses_by_month(pd.DataFrame(), "Enero")

    assert isinstance(result, pd.DataFrame)
    assert result.empty
