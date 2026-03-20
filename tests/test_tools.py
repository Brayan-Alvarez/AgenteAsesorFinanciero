"""
test_tools.py — Unit tests for agent/tools.py.

Tools interact with the data layer, so tests use pre-built DataFrames
(no real Sheets or LLM calls required).

Coverage targets:
- get_budget_summary() returns correct planned vs actual figures.
- get_expenses() filters correctly by month, person, and both.
- get_monthly_trend() returns data sorted chronologically.
- simulate_purchase() correctly flags can_afford True/False.
- simulate_purchase() computes correct remaining_after value.
- All tools return empty results (not exceptions) on empty input data.
"""

import pytest
import pandas as pd


# ---------------------------------------------------------------------------
# Fixtures — sample DataFrames that simulate Sheets data
# ---------------------------------------------------------------------------

# TODO: Add pytest fixtures with sample budget and expense DataFrames in Phase 2.


# ---------------------------------------------------------------------------
# Tests for get_budget_summary
# ---------------------------------------------------------------------------

def test_budget_summary_calculates_restante() -> None:
    """restante should equal presupuesto minus gastado."""
    pass  # TODO: implement in Phase 2


def test_budget_summary_empty_input_returns_empty_dict() -> None:
    """Empty DataFrames should return an empty dict, not raise."""
    pass  # TODO: implement in Phase 2


# ---------------------------------------------------------------------------
# Tests for get_expenses
# ---------------------------------------------------------------------------

def test_get_expenses_filters_by_month() -> None:
    """Only expenses matching the given month should be returned."""
    pass  # TODO: implement in Phase 2


def test_get_expenses_filters_by_person() -> None:
    """Only expenses matching the given person should be returned."""
    pass  # TODO: implement in Phase 2


def test_get_expenses_no_filter_returns_all() -> None:
    """With no filters, all expenses should be returned aggregated by category."""
    pass  # TODO: implement in Phase 2


def test_get_expenses_empty_result_returns_empty() -> None:
    """No matching rows should return an empty result, not raise."""
    pass  # TODO: implement in Phase 2


# ---------------------------------------------------------------------------
# Tests for get_monthly_trend
# ---------------------------------------------------------------------------

def test_monthly_trend_sorted_chronologically() -> None:
    """Months should appear in calendar order (Enero → Diciembre)."""
    pass  # TODO: implement in Phase 2


def test_monthly_trend_empty_data_returns_empty_list() -> None:
    """Empty expenses DataFrame should return an empty list, not raise."""
    pass  # TODO: implement in Phase 2


# ---------------------------------------------------------------------------
# Tests for simulate_purchase
# ---------------------------------------------------------------------------

def test_simulate_purchase_can_afford_true() -> None:
    """can_afford should be True when remaining budget >= purchase amount."""
    pass  # TODO: implement in Phase 2


def test_simulate_purchase_can_afford_false() -> None:
    """can_afford should be False when purchase amount > remaining budget."""
    pass  # TODO: implement in Phase 2


def test_simulate_purchase_remaining_after_is_correct() -> None:
    """remaining_after should equal total remaining minus the purchase amount."""
    pass  # TODO: implement in Phase 2
