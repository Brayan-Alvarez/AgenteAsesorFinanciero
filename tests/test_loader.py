"""
test_loader.py — Unit tests for data/sheets_loader.py.

Tests use mock Google Sheets responses so no real API calls are made.
The gspread client is patched with unittest.mock.

Coverage targets:
- get_gspread_client() authenticates and returns a client.
- load_budget() returns a DataFrame with the expected columns and types.
- load_expenses() returns a unified DataFrame with correct columns and types.
- load_expenses() adds 'Persona' and 'Mes' columns derived from tab names.
- load_expenses() skips tabs that don't match the "Month - Name" pattern.
- Both loaders return empty DataFrames (not exceptions) when Sheets are empty.
"""

import pytest
import pandas as pd


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

# TODO: Add pytest fixtures with sample Sheets data in Phase 1.


# ---------------------------------------------------------------------------
# Tests for load_budget
# ---------------------------------------------------------------------------

def test_load_budget_returns_dataframe() -> None:
    """load_budget() should return a DataFrame with columns Categoría and Presupuesto."""
    pass  # TODO: implement in Phase 1


def test_load_budget_presupuesto_is_int() -> None:
    """Presupuesto column must be integer (COP — no floats)."""
    pass  # TODO: implement in Phase 1


def test_load_budget_empty_sheet_returns_empty_dataframe() -> None:
    """An empty sheet should return an empty DataFrame, not raise an exception."""
    pass  # TODO: implement in Phase 1


# ---------------------------------------------------------------------------
# Tests for load_expenses
# ---------------------------------------------------------------------------

def test_load_expenses_returns_dataframe() -> None:
    """load_expenses() should return a DataFrame with all expected columns."""
    pass  # TODO: implement in Phase 1


def test_load_expenses_adds_persona_and_mes_columns() -> None:
    """Persona and Mes columns should be derived from the tab name."""
    pass  # TODO: implement in Phase 1


def test_load_expenses_skips_unrecognized_tabs() -> None:
    """Tabs that don't match 'Month - Name' pattern should be silently skipped."""
    pass  # TODO: implement in Phase 1


def test_load_expenses_monto_is_int() -> None:
    """Monto column must be integer (COP — no floats)."""
    pass  # TODO: implement in Phase 1


def test_load_expenses_empty_sheet_returns_empty_dataframe() -> None:
    """No matching tabs should return an empty DataFrame, not raise an exception."""
    pass  # TODO: implement in Phase 1
