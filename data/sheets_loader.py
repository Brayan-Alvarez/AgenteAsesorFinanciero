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

import logging
import os
import re

import gspread
import pandas as pd
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

# Google Sheets API scopes required for read-only access.
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Spanish month names in calendar order. Used to validate tab names and to
# sort months chronologically later (index in this list = month number - 1).
SPANISH_MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

# Regex pattern for expense tab names: "Enero - Name" or "Febrero - Ana María"
# Group 1 → month (e.g. "Enero"), Group 2 → person name (e.g. "Ana María")
_TAB_PATTERN = re.compile(r"^([A-Za-záéíóúüÁÉÍÓÚÜñÑ]+)\s+-\s+(.+)$")

# Expected columns in the expenses sheet (exact, case-sensitive — must match Sheets).
EXPENSE_COLUMNS = ["Fecha", "Categoría", "Descripción", "Monto", "Observaciones"]

# Columns added by this loader (not present in the raw sheet).
DERIVED_COLUMNS = ["Persona", "Mes"]


def get_gspread_client() -> gspread.Client:
    """
    Authenticate with Google Sheets API using a service account JSON key.

    The path to the credentials file is loaded from the GOOGLE_CREDENTIALS_PATH
    environment variable (default: credentials/service_account.json).

    Returns:
        An authenticated gspread Client instance.

    Raises:
        FileNotFoundError: If the credentials file path does not exist on disk.
        google.auth.exceptions.MalformedError: If the JSON key is malformed.
    """
    credentials_path = os.getenv(
        "GOOGLE_CREDENTIALS_PATH", "credentials/service_account.json"
    )

    if not os.path.exists(credentials_path):
        raise FileNotFoundError(
            f"Google credentials file not found at '{credentials_path}'. "
            "Set the GOOGLE_CREDENTIALS_PATH env var or place the JSON key "
            "at credentials/service_account.json."
        )

    # Build OAuth2 credentials scoped to read-only Sheets + Drive access.
    creds = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)

    # gspread.authorize wraps the credentials into a ready-to-use client.
    return gspread.authorize(creds)


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
        Returns an empty DataFrame with the correct columns if the sheet is empty.

    Raises:
        gspread.exceptions.SpreadsheetNotFound: If BUDGET_SHEET_ID is wrong or
            the service account has not been granted access to the spreadsheet.
    """
    sheet_id = os.getenv("BUDGET_SHEET_ID")
    if not sheet_id:
        raise ValueError("BUDGET_SHEET_ID environment variable is not set.")

    spreadsheet = client.open_by_key(sheet_id)

    # The budget lives in the first (and only) worksheet.
    worksheet = spreadsheet.sheet1

    # get_all_records() returns a list of dicts, one per row, using the
    # header row as keys. Empty rows are automatically skipped.
    records = worksheet.get_all_records()

    if not records:
        logger.warning("Budget sheet is empty — returning empty DataFrame.")
        return pd.DataFrame(columns=["Categoría", "Presupuesto"])

    df = pd.DataFrame(records)

    # Validate that the expected columns exist before doing type conversion.
    _assert_columns(df, ["Categoría", "Presupuesto"], source="budget sheet")

    # Presupuesto may arrive as a string with thousand separators (e.g. "1.500.000").
    # Strip non-numeric characters and cast to int.
    df["Presupuesto"] = _to_int_cop(df["Presupuesto"])

    # Drop rows where Categoría is empty (can happen with trailing blank rows).
    df = df[df["Categoría"].astype(str).str.strip() != ""]

    logger.info("Loaded budget sheet: %d categories.", len(df))
    return df[["Categoría", "Presupuesto"]].reset_index(drop=True)


def load_expenses(client: gspread.Client, person_names: list[str]) -> pd.DataFrame:
    """
    Load all expense tabs for all people into a single unified DataFrame.

    Iterates over every tab in the EXPENSES_SHEET_ID spreadsheet.
    Only processes tabs whose name matches the pattern "Month - PersonName"
    AND whose PersonName is in the provided person_names list.
    Unrecognized tabs are skipped with a warning log (not an error).

    Args:
        client: An authenticated gspread Client.
        person_names: List of person names to match against tab headers.
                      Must match exactly what appears after the dash in tab names
                      (e.g., ["Ana", "Carlos"]).

    Returns:
        DataFrame with columns:
            Fecha (datetime64), Categoría (str), Descripción (str),
            Monto (int), Observaciones (str), Persona (str), Mes (str)
        Sorted chronologically by Fecha.
        Returns an empty DataFrame with the correct columns if no data is found.

    Raises:
        gspread.exceptions.SpreadsheetNotFound: If EXPENSES_SHEET_ID is wrong or
            the service account lacks access to the spreadsheet.
    """
    sheet_id = os.getenv("EXPENSES_SHEET_ID")
    if not sheet_id:
        raise ValueError("EXPENSES_SHEET_ID environment variable is not set.")

    spreadsheet = client.open_by_key(sheet_id)
    worksheets = spreadsheet.worksheets()

    all_frames: list[pd.DataFrame] = []

    for worksheet in worksheets:
        tab_name = worksheet.title

        # Try to parse "Month - PersonName" from the tab title.
        match = _TAB_PATTERN.match(tab_name)

        if not match:
            logger.warning(
                "Skipping tab '%s' — does not match 'Month - Name' pattern.", tab_name
            )
            continue

        month, person = match.group(1), match.group(2)

        # Validate that the month is a real Spanish month name.
        if month not in SPANISH_MONTHS:
            logger.warning(
                "Skipping tab '%s' — '%s' is not a recognized Spanish month.", tab_name, month
            )
            continue

        # Validate that the person name is in our expected list.
        if person not in person_names:
            logger.warning(
                "Skipping tab '%s' — person '%s' is not in PERSON_NAMES list %s.",
                tab_name,
                person,
                person_names,
            )
            continue

        records = worksheet.get_all_records()

        if not records:
            logger.info("Tab '%s' is empty — skipping.", tab_name)
            continue

        df = pd.DataFrame(records)

        # Validate expected columns exist before processing.
        _assert_columns(df, EXPENSE_COLUMNS, source=f"tab '{tab_name}'")

        # Add the derived columns before any type casting so that even rows
        # with bad data carry their provenance for debugging.
        df["Persona"] = person
        df["Mes"] = month

        # Cast Monto to int — amounts are always whole COP pesos.
        df["Monto"] = _to_int_cop(df["Monto"])

        # Parse Fecha from "DD/MM/YYYY" string to datetime.
        # errors="coerce" turns unparseable values into NaT instead of crashing.
        df["Fecha"] = pd.to_datetime(df["Fecha"], format="%d/%m/%Y", errors="coerce")

        # Warn about rows where Fecha could not be parsed (but keep them).
        bad_dates = df["Fecha"].isna().sum()
        if bad_dates > 0:
            logger.warning(
                "Tab '%s': %d row(s) have unparseable Fecha values — set to NaT.",
                tab_name,
                bad_dates,
            )

        # Drop completely empty rows (can occur if the sheet has trailing blank rows).
        df = df[df["Descripción"].astype(str).str.strip() != ""]

        all_frames.append(df)
        logger.info("Loaded tab '%s': %d rows.", tab_name, len(df))

    if not all_frames:
        logger.warning("No expense tabs matched — returning empty DataFrame.")
        return _empty_expenses_dataframe()

    # Combine all tabs into one DataFrame.
    combined = pd.concat(all_frames, ignore_index=True)

    # Sort chronologically so the agent and charts always see ordered data.
    combined = combined.sort_values("Fecha", na_position="last").reset_index(drop=True)

    # Ensure column order is consistent (source columns first, then derived).
    combined = combined[EXPENSE_COLUMNS + DERIVED_COLUMNS]

    logger.info(
        "Loaded %d total expense rows across %d tabs.", len(combined), len(all_frames)
    )
    return combined


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _to_int_cop(series: pd.Series) -> pd.Series:
    """
    Convert a Series of COP monetary values to integers.

    Handles values that may arrive as:
    - Integers already (e.g., 1500000)
    - Floats (e.g., 1500000.0) — from Sheets numeric cells
    - Strings with thousand separators (e.g., "1.500.000" or "1,500,000")
    - Empty strings → converted to 0

    Args:
        series: Raw pandas Series from a gspread get_all_records() result.

    Returns:
        Series of Python ints.
    """
    # Convert to string first to handle mixed types uniformly.
    cleaned = (
        series.astype(str)
        .str.strip()
        # Remove common thousand separators (both dot and comma formats).
        .str.replace(r"[\.,](?=\d{3})", "", regex=True)
        # Remove any remaining non-numeric characters (e.g., "$", "COP", spaces).
        .str.replace(r"[^\d-]", "", regex=True)
        # Replace empty strings with "0" so int() doesn't fail.
        .replace("", "0")
    )
    return cleaned.astype(int)


def _assert_columns(df: pd.DataFrame, required: list[str], source: str) -> None:
    """
    Raise a descriptive ValueError if any required columns are missing.

    Args:
        df: DataFrame to check.
        required: List of column names that must be present.
        source: Human-readable description of the data source (used in the error message).

    Raises:
        ValueError: With a message listing every missing column.
    """
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(
            f"Missing columns in {source}: {missing}. "
            f"Found columns: {list(df.columns)}. "
            "Check that the sheet header row matches the expected column names exactly."
        )


def _empty_expenses_dataframe() -> pd.DataFrame:
    """
    Return an empty DataFrame with the full expenses schema.

    Returning an empty DataFrame (instead of None or an empty list) lets
    downstream code use DataFrame methods without special-casing None.
    """
    return pd.DataFrame(columns=EXPENSE_COLUMNS + DERIVED_COLUMNS)
