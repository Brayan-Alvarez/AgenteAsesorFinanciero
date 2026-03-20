"""
dashboard.py — Plotly charts for the financial dashboard tab.

Charts:
    1. Spending by category (bar chart, current month or YTD).
    2. Budget vs actual (grouped bar or gauge per category).
    3. Monthly trend (line chart of total spend per month).
    4. Spending by person (pie or stacked bar).

All chart functions accept pre-processed data dicts/DataFrames from data_processor.py
and return Plotly Figure objects. Rendering (st.plotly_chart) is done in app.py.

Amounts are always COP integers. Labels use thousands separator ($2.800.000).
"""

import plotly.graph_objects as go
import pandas as pd


def chart_spending_by_category(expenses_summary: pd.DataFrame) -> go.Figure:
    """
    Horizontal bar chart of total spending per category, sorted descending.

    Args:
        expenses_summary: DataFrame with columns ['Categoría', 'Monto'].

    Returns:
        Plotly Figure. Returns an empty figure with a "no data" annotation if
        the DataFrame is empty.
    """
    pass  # TODO: implement in Phase 3


def chart_budget_vs_actual(budget_summary: dict) -> go.Figure:
    """
    Grouped bar chart comparing planned budget vs actual spend per category.

    Args:
        budget_summary: Output of data_processor.get_budget_summary().

    Returns:
        Plotly Figure. Returns an empty figure if budget_summary is empty.
    """
    pass  # TODO: implement in Phase 3


def chart_monthly_trend(monthly_trend: list[dict]) -> go.Figure:
    """
    Line chart of total spending per month, plotted chronologically.

    Args:
        monthly_trend: Output of data_processor.get_monthly_trend().

    Returns:
        Plotly Figure. Returns an empty figure if the list is empty.
    """
    pass  # TODO: implement in Phase 3


def chart_spending_by_person(expenses_df: pd.DataFrame) -> go.Figure:
    """
    Pie chart of total spending per person.

    Args:
        expenses_df: Full expenses DataFrame with a 'Persona' column.

    Returns:
        Plotly Figure. Returns an empty figure if the DataFrame is empty.
    """
    pass  # TODO: implement in Phase 3
