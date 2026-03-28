"""
test_loader.py — Unit tests for data/sheets_loader.py.

All tests use unittest.mock to fake gspread objects — no real API calls are made.
The gspread Client, Spreadsheet, and Worksheet objects are replaced with MagicMocks
whose return values are pre-configured with sample data.

Coverage:
- load_budget() returns a DataFrame with columns Categoría and Presupuesto.
- load_budget() casts "$ 1.500.000" strings to int correctly.
- load_budget() returns an empty DataFrame when no "Gastos *" tabs are found.
- load_budget() raises ValueError when BUDGET_SHEET_ID env var is missing.
- load_expenses() returns a DataFrame with all expected columns.
- load_expenses() populates Persona and Mes from the tab name "Enero Sofi".
- load_expenses() skips tabs whose first word is not a Spanish month name.
- load_expenses() skips tabs whose person name is not in person_names.
- load_expenses() casts Monto to int (even when gspread returns floats).
- load_expenses() returns an empty DataFrame when no tabs match.
- load_expenses() combines multiple valid tabs into one DataFrame.
"""

from unittest.mock import MagicMock

import pandas as pd
import pytest

from data.sheets_loader import (
    DERIVED_COLUMNS,
    EXPENSE_COLUMNS,
    load_budget,
    load_expenses,
)


# ---------------------------------------------------------------------------
# Helper factories — build minimal mock gspread objects
# ---------------------------------------------------------------------------

def _make_worksheet(title: str, records: list[dict]) -> MagicMock:
    """Return a mock gspread Worksheet with .title and .get_all_records()."""
    ws = MagicMock()
    ws.title = title
    ws.get_all_records.return_value = records
    return ws


def _make_gastos_worksheet(title: str, categories: list[tuple[str, str]]) -> MagicMock:
    """
    Return a mock 'Gastos *' worksheet for the load_budget tests.

    The real budget tab structure (discovered from live data):
      Column 0  — category group name (e.g. "Transporte")
      Column 2  — "Total al mes:" marker
      Column 15 — annual total string (e.g. " $9.109.100")

    Args:
        title:      Worksheet title, must start with "Gastos " to be picked up.
        categories: List of (category_name, annual_total_str) pairs.
    """
    rows = []
    for cat_name, annual_str in categories:
        # Build a row with at least 16 columns matching the real sheet layout.
        # [cat, '', 'Total al mes:', m1, m2, ..., m12, annual_total, promedio]
        row = [cat_name, "", "Total al mes:"] + [""] * 12 + [annual_str, ""]
        rows.append(row)

    ws = MagicMock()
    ws.title = title
    ws.get_all_values.return_value = rows
    return ws


def _make_budget_client(gastos_worksheets: list[MagicMock]) -> MagicMock:
    """
    Return a mock gspread Client for load_budget tests.

    load_budget() calls spreadsheet.worksheets() and filters for "Gastos *" tabs,
    then calls ws.get_all_values() on each matching tab.
    """
    spreadsheet = MagicMock()
    spreadsheet.worksheets.return_value = gastos_worksheets

    client = MagicMock()
    client.open_by_key.return_value = spreadsheet
    return client


def _make_expenses_client(worksheets: list[MagicMock]) -> MagicMock:
    """
    Return a mock gspread Client that serves the given worksheet list.

    client.open_by_key(any_id)
        └── .worksheets() → worksheets
    """
    spreadsheet = MagicMock()
    spreadsheet.worksheets.return_value = worksheets

    client = MagicMock()
    client.open_by_key.return_value = spreadsheet
    return client


# ---------------------------------------------------------------------------
# Shared sample data
# ---------------------------------------------------------------------------

# Two well-formed expense rows reused across multiple tests.
# Tab names now use the real format: "Month Person" (space, no dash).
_EXPENSE_ROWS = [
    {
        "Fecha": "15/01/2024",
        "Categoría": "Alimentación",
        "Descripción": "Supermercado",
        "Monto": 150_000,
        "Observaciones": "",
    },
    {
        "Fecha": "20/01/2024",
        "Categoría": "Transporte",
        "Descripción": "Taxi",
        "Monto": 30_000,
        "Observaciones": "Uber",
    },
]


# ---------------------------------------------------------------------------
# Tests for load_budget
# ---------------------------------------------------------------------------

def test_load_budget_returns_dataframe(monkeypatch: pytest.MonkeyPatch) -> None:
    """load_budget() must return a DataFrame with columns Categoría and Presupuesto."""
    monkeypatch.setenv("BUDGET_SHEET_ID", "fake-id")
    ws = _make_gastos_worksheet("Gastos Test", [
        ("Alimentación", " $500.000"),
        ("Transporte",   " $200.000"),
    ])
    df = load_budget(_make_budget_client([ws]))

    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == ["Categoría", "Presupuesto"]
    assert len(df) == 2
    assert set(df["Categoría"].tolist()) == {"Alimentación", "Transporte"}


def test_load_budget_presupuesto_is_int(monkeypatch: pytest.MonkeyPatch) -> None:
    """Presupuesto must be int even when the sheet returns strings like ' $1.500.000'."""
    monkeypatch.setenv("BUDGET_SHEET_ID", "fake-id")
    ws = _make_gastos_worksheet("Gastos Test", [("Salud", " $1.500.000")])
    df = load_budget(_make_budget_client([ws]))

    assert pd.api.types.is_integer_dtype(df["Presupuesto"])
    assert df["Presupuesto"].iloc[0] == 1_500_000


def test_load_budget_empty_sheet_returns_empty_dataframe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No 'Gastos *' tabs → empty DataFrame, no exception."""
    monkeypatch.setenv("BUDGET_SHEET_ID", "fake-id")
    # Pass a non-Gastos tab; load_budget filters it out.
    other_tab = MagicMock()
    other_tab.title = "Configuración"
    df = load_budget(_make_budget_client([other_tab]))

    assert isinstance(df, pd.DataFrame)
    assert df.empty
    assert "Categoría" in df.columns
    assert "Presupuesto" in df.columns


def test_load_budget_raises_when_env_var_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """load_budget() must raise ValueError when BUDGET_SHEET_ID is not set."""
    monkeypatch.delenv("BUDGET_SHEET_ID", raising=False)

    with pytest.raises(ValueError, match="BUDGET_SHEET_ID"):
        load_budget(MagicMock())


# ---------------------------------------------------------------------------
# Tests for load_expenses
# ---------------------------------------------------------------------------

def test_load_expenses_returns_dataframe(monkeypatch: pytest.MonkeyPatch) -> None:
    """load_expenses() must return a DataFrame with all expected columns."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    # Real tab naming: "Month Person" (space, no dash)
    ws = _make_worksheet("Enero Juan", _EXPENSE_ROWS)
    df = load_expenses(_make_expenses_client([ws]), person_names=["Juan"])

    assert isinstance(df, pd.DataFrame)
    expected = set(EXPENSE_COLUMNS + DERIVED_COLUMNS)
    assert expected.issubset(set(df.columns))
    assert len(df) == 2


def test_load_expenses_adds_persona_and_mes_columns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Persona and Mes must be derived from the tab name 'Enero Juan'."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    ws = _make_worksheet("Enero Juan", _EXPENSE_ROWS)
    df = load_expenses(_make_expenses_client([ws]), person_names=["Juan"])

    assert (df["Persona"] == "Juan").all()
    assert (df["Mes"] == "Enero").all()


def test_load_expenses_skips_non_month_tabs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Tabs whose first word is not a Spanish month must be silently skipped."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    # "Resumen" is not in SPANISH_MONTHS → skipped; "Febrero Ana" → kept.
    bad_tab  = _make_worksheet("Resumen Anual", _EXPENSE_ROWS)
    good_tab = _make_worksheet("Febrero Ana",   _EXPENSE_ROWS)
    df = load_expenses(
        _make_expenses_client([bad_tab, good_tab]), person_names=["Ana"]
    )

    assert (df["Persona"] == "Ana").all()
    assert (df["Mes"] == "Febrero").all()


def test_load_expenses_skips_tab_with_non_spanish_month(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A tab named 'January Ana' (English month) must be skipped silently."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    ws = _make_worksheet("January Ana", _EXPENSE_ROWS)
    df = load_expenses(_make_expenses_client([ws]), person_names=["Ana"])

    assert df.empty


def test_load_expenses_skips_unknown_person(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A tab for a person not in person_names must be silently skipped."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    ws = _make_worksheet("Enero Stranger", _EXPENSE_ROWS)
    df = load_expenses(_make_expenses_client([ws]), person_names=["Juan"])

    assert df.empty


def test_load_expenses_monto_is_int(monkeypatch: pytest.MonkeyPatch) -> None:
    """Monto must be cast to int even when gspread returns a float."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    rows_with_float = [
        {
            "Fecha": "01/03/2024",
            "Categoría": "Salud",
            "Descripción": "Farmacia",
            "Monto": 75_000.0,   # float — common from Sheets numeric cells
            "Observaciones": "",
        }
    ]
    ws = _make_worksheet("Marzo Juan", rows_with_float)
    df = load_expenses(_make_expenses_client([ws]), person_names=["Juan"])

    assert pd.api.types.is_integer_dtype(df["Monto"])
    assert df["Monto"].iloc[0] == 75_000


def test_load_expenses_empty_returns_empty_dataframe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No worksheets at all → empty DataFrame with the correct schema."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    df = load_expenses(_make_expenses_client([]), person_names=["Juan"])

    assert isinstance(df, pd.DataFrame)
    assert df.empty
    assert set(EXPENSE_COLUMNS + DERIVED_COLUMNS).issubset(set(df.columns))


def test_load_expenses_combines_multiple_tabs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Three valid tabs should be concatenated into one DataFrame (6 total rows)."""
    monkeypatch.setenv("EXPENSES_SHEET_ID", "fake-id")
    tabs = [
        _make_worksheet("Enero Juan",   _EXPENSE_ROWS),
        _make_worksheet("Enero Ana",    _EXPENSE_ROWS),
        _make_worksheet("Febrero Juan", _EXPENSE_ROWS),
    ]
    df = load_expenses(_make_expenses_client(tabs), person_names=["Juan", "Ana"])

    assert len(df) == 6
    assert set(df["Persona"].unique()) == {"Juan", "Ana"}
    assert set(df["Mes"].unique())    == {"Enero", "Febrero"}
