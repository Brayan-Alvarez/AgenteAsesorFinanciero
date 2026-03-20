"""
sheets_loader.py — Reads and normalizes Google Sheets data into pandas DataFrames.

Responsibilities:
- Authenticate with Google Sheets API using a service account.
- Load the annual budget spreadsheet into a DataFrame.
- Load expense tabs (one per person per month) into a unified DataFrame.
- Normalize column types (e.g., parse dates, cast Monto to int).

Expected Sheets structure:
  Budget sheet  — columns: Categoría, Presupuesto
  Expense tabs  — columns: Fecha, Categoría, Descripción, Monto, Observaciones
                — tab naming: "Enero - Name", "Febrero - Name", etc.
"""

import os
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials


# Google Sheets API scopes required for read-only access.
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


def get_gspread_client() -> gspread.Client:
    """
    Authenticate with Google Sheets API using a service account JSON key.

    The path to the credentials file is loaded from the GOOGLE_CREDENTIALS_PATH
    environment variable (default: credentials/service_account.json).

    Returns:
        An authenticated gspread Client instance.

    Raises:
        FileNotFoundError: If the credentials file does not exist.
        google.auth.exceptions.MalformedError: If the JSON key is invalid.
    """
    pass  # TODO: implement in Phase 1


def load_budget(client: gspread.Client) -> pd.DataFrame:
    """
    Load the annual budget spreadsheet into a DataFrame.

    Reads the first sheet of the BUDGET_SHEET_ID spreadsheet.
    Expected columns: Categoría, Presupuesto

    Args:
        client: An authenticated gspread Client.

    Returns:
        DataFrame with columns ['Categoría', 'Presupuesto'] where
        Presupuesto values are integers (COP, no decimals).

    Raises:
        gspread.exceptions.SpreadsheetNotFound: If BUDGET_SHEET_ID is wrong.
    """
    pass  # TODO: implement in Phase 1


def load_expenses(client: gspread.Client, person_names: list[str]) -> pd.DataFrame:
    """
    Load all expense tabs for all people into a single unified DataFrame.

    Iterates over every tab in the EXPENSES_SHEET_ID spreadsheet.
    Only processes tabs matching the pattern "Month - PersonName".
    Adds 'Persona' and 'Mes' columns derived from the tab name.

    Args:
        client: An authenticated gspread Client.
        person_names: List of person names to match against tab headers.
                      These must match exactly what appears in the tab names.

    Returns:
        DataFrame with columns:
            Fecha (datetime), Categoría (str), Descripción (str),
            Monto (int), Observaciones (str), Persona (str), Mes (str)
        Returns an empty DataFrame (with the correct columns) if no data is found.

    Raises:
        gspread.exceptions.SpreadsheetNotFound: If EXPENSES_SHEET_ID is wrong.
    """
    pass  # TODO: implement in Phase 1
