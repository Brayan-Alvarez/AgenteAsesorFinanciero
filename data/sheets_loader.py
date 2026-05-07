"""
sheets_loader.py — Reads and normalizes Google Sheets data into pandas DataFrames.

Responsibilities:
- Authenticate with Google Sheets API using a service account.
- Load the annual budget spreadsheet into a DataFrame.
- Load expense tabs (one per person per month) into a unified DataFrame.
- Normalize column types (e.g., parse dates, cast Monto to int).

Actual Sheets structure (discovered from live data):
  Budget spreadsheet  — "Gastos [Person]" tabs with a multi-row layout.
                        Category group names in column A; "Total al mes:" marker
                        in column C; annual total in column P (index 15).
  Expense tabs        — columns: Fecha, Categoría, Descripción, Monto, Observaciones
                        (plus extra summary columns to the right that are ignored).
                      — tab naming: "Enero Sofi", "Febrero Belmont", etc. (space only,
                        no dash between month and person name).
"""

import json
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

# Regex pattern for expense tab names: "Enero Sofi", "Febrero Belmont", etc.
# The real spreadsheet uses a single space (no dash) between month and name.
# Group 1 → month (e.g. "Enero"), Group 2 → person name (e.g. "Belmont")
# Non-month tabs like "Resumen Sofi" or "Menu desplegable" are filtered out
# afterwards by the SPANISH_MONTHS membership check.
_TAB_PATTERN = re.compile(r"^([A-Za-záéíóúüÁÉÍÓÚÜñÑ]+)\s+(.+)$")

# Expected columns in the expenses sheet (exact, case-sensitive — must match Sheets).
EXPENSE_COLUMNS = ["Fecha", "Categoría", "Descripción", "Monto", "Observaciones"]

# Columns added by this loader (not present in the raw sheet).
DERIVED_COLUMNS = ["Persona", "Mes"]


def get_gspread_client() -> gspread.Client:
    """
    Authenticate with Google Sheets API using a service account key.

    Two authentication modes are supported (checked in order):

    1. **GOOGLE_CREDENTIALS_JSON** env var (production / Railway / Render):
       Set this to the full contents of the service account JSON file.
       The value can be the raw JSON string or a base64-encoded JSON string.
       This avoids shipping credential files into containers.

    2. **GOOGLE_CREDENTIALS_PATH** env var (local dev, default):
       Path to the JSON key file on disk.  Defaults to
       `credentials/service_account.json` when the var is unset.

    Returns:
        An authenticated gspread Client instance.

    Raises:
        ValueError: If neither credential source is available.
        json.JSONDecodeError: If GOOGLE_CREDENTIALS_JSON is set but malformed.
        FileNotFoundError: If GOOGLE_CREDENTIALS_PATH points to a missing file.
    """
    # ── Mode 1: JSON string in environment variable (production) ──────────────
    credentials_json = os.getenv("GOOGLE_CREDENTIALS_JSON", "").strip()
    if credentials_json:
        # Support optional base64 encoding (useful when the JSON contains
        # characters that some platforms escape in env vars).
        if not credentials_json.startswith("{"):
            import base64
            credentials_json = base64.b64decode(credentials_json).decode("utf-8")

        service_account_info = json.loads(credentials_json)
        creds = Credentials.from_service_account_info(service_account_info, scopes=SCOPES)
        logger.info("Authenticated via GOOGLE_CREDENTIALS_JSON env var.")
        return gspread.authorize(creds)

    # ── Mode 2: JSON file on disk (local dev) ────────────────────────────────
    credentials_path = os.getenv(
        "GOOGLE_CREDENTIALS_PATH", "credentials/service_account.json"
    )
    if not os.path.exists(credentials_path):
        raise FileNotFoundError(
            f"Google credentials not found. "
            f"Set GOOGLE_CREDENTIALS_JSON (production) or place the service "
            f"account key at '{credentials_path}' (local dev)."
        )

    creds = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    logger.info("Authenticated via credentials file '%s'.", credentials_path)
    return gspread.authorize(creds)


def load_budget(client: gspread.Client) -> pd.DataFrame:
    """
    Load the annual budget from all "Gastos [Person]" tabs in BUDGET_SHEET_ID.

    The budget spreadsheet uses a multi-row layout (not a simple two-column table).
    Each "Gastos *" tab looks like:

        Row structure:
          Column A (0)  — category group name (e.g. "Deuda", "Transporte")
                          only present on the "Total al mes:" row for that group
          Column C (2)  — either a subcategory name or the marker "Total al mes:"
          Column P (15) — annual total for that row (sum of all 12 months)

    This function collects only the "Total al mes:" rows (one per category group)
    and sums the annual totals across all "Gastos *" tabs so the result represents
    the combined household budget.

    Args:
        client: An authenticated gspread Client.

    Returns:
        DataFrame with columns ['Categoría', 'Presupuesto'] (Presupuesto as int COP).
        Returns an empty DataFrame if no "Gastos *" tabs are found.

    Raises:
        gspread.exceptions.SpreadsheetNotFound: If BUDGET_SHEET_ID is wrong or
            the service account has not been granted access to the spreadsheet.
        ValueError: If BUDGET_SHEET_ID env var is not set.
    """
    sheet_id = os.getenv("BUDGET_SHEET_ID")
    if not sheet_id:
        raise ValueError("BUDGET_SHEET_ID environment variable is not set.")

    spreadsheet = client.open_by_key(sheet_id)

    # Find all "Gastos *" tabs (one per person, e.g. "Gastos Brayan", "Gastos Sofi").
    gastos_tabs = [ws for ws in spreadsheet.worksheets() if ws.title.startswith("Gastos ")]

    if not gastos_tabs:
        logger.warning("No 'Gastos *' tabs found in budget spreadsheet — returning empty.")
        return pd.DataFrame(columns=["Categoría", "Presupuesto"])

    # Accumulate {category: total_annual_cop} across all tabs.
    totals: dict[str, int] = {}

    for worksheet in gastos_tabs:
        rows = worksheet.get_all_values()
        current_category = ""

        for row in rows:
            # Skip rows that are too short to contain the columns we need.
            if len(row) <= 15:
                continue

            # Column A (index 0): category group name appears only on the
            # "Total al mes:" row for that group.
            if row[0].strip():
                current_category = row[0].strip()

            # Column C (index 2): look for the "Total al mes:" marker.
            if row[2].strip() != "Total al mes:":
                continue

            # Column P (index 15): annual total for this category.
            annual_str = row[15].strip()
            if not annual_str:
                continue

            annual_int = _to_int_cop(pd.Series([annual_str])).iloc[0]

            # Sum across tabs so the result is the combined household budget.
            totals[current_category] = totals.get(current_category, 0) + annual_int

        logger.info("Parsed budget tab '%s'.", worksheet.title)

    if not totals:
        logger.warning("No budget rows found — returning empty DataFrame.")
        return pd.DataFrame(columns=["Categoría", "Presupuesto"])

    df = (
        pd.DataFrame(list(totals.items()), columns=["Categoría", "Presupuesto"])
        .sort_values("Categoría")
        .reset_index(drop=True)
    )

    logger.info("Loaded budget: %d categories across %d tab(s).", len(df), len(gastos_tabs))
    return df


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

        # Use get_all_values() instead of get_all_records() because the expense
        # tabs have duplicate column headers: "Categoría" appears both in the
        # data area (col B) and in a pivot/summary section further right.
        # get_all_records() resolves duplicates to the LAST occurrence, which is
        # the empty pivot column.  Slicing to the first 5 columns avoids this.
        raw_rows = worksheet.get_all_values()

        if len(raw_rows) < 2:
            logger.info("Tab '%s' is empty — skipping.", tab_name)
            continue

        # Slice every row to exactly the 5 expense columns we care about.
        n_cols = len(EXPENSE_COLUMNS)
        header = raw_rows[0][:n_cols]
        data   = [row[:n_cols] for row in raw_rows[1:]]

        df = pd.DataFrame(data, columns=header)

        # Validate expected columns exist before processing.
        _assert_columns(df, EXPENSE_COLUMNS, source=f"tab '{tab_name}'")

        # Add the derived columns before any type casting so that even rows
        # with bad data carry their provenance for debugging.
        df["Persona"] = person
        df["Mes"] = month

        # Cast Monto to int — amounts are always whole COP pesos.
        df["Monto"] = _to_int_cop(df["Monto"])

        # Parse Fecha to datetime. Different people use different separators:
        # Sofi → "01/01/2026", Belmont → "01-01-2026".
        # format="mixed" lets pandas handle both in the same column.
        # dayfirst=True is required for DD/MM/YYYY (not MM/DD/YYYY) interpretation.
        # errors="coerce" turns unparseable values into NaT instead of crashing.
        df["Fecha"] = pd.to_datetime(
            df["Fecha"], format="mixed", dayfirst=True, errors="coerce"
        )

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

        # Drop rows with blank or formula-artifact categories ("", "0", "$0.00").
        # These come from empty category cells that Sheets fills with formula results.
        df["Categoría"] = df["Categoría"].astype(str).str.strip()
        df = df[df["Categoría"].str.len() > 0]
        df = df[~df["Categoría"].str.fullmatch(r"[\d\$\.\,\s]+")]

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
# Convenience wrappers (no arguments — read everything from env vars)
# ---------------------------------------------------------------------------

def load_budget_sheet() -> pd.DataFrame:
    """
    Convenience wrapper: authenticate and load the budget sheet in one call.

    Reads credentials and sheet ID entirely from environment variables, so
    callers don't need to instantiate a gspread Client themselves.

    Returns:
        DataFrame with columns ['Categoría', 'Presupuesto'] (Presupuesto as int).

    Raises:
        FileNotFoundError: If the credentials file is missing.
        ValueError: If BUDGET_SHEET_ID or GOOGLE_CREDENTIALS_PATH is not set.
        gspread.exceptions.SpreadsheetNotFound: If the sheet ID is wrong.
    """
    client = get_gspread_client()
    return load_budget(client)


def load_expenses_sheet() -> pd.DataFrame:
    """
    Convenience wrapper: authenticate and load all expense tabs in one call.

    Person names are read from the PERSON_NAMES environment variable
    (comma-separated, e.g. "Ana,Carlos").

    Returns:
        Unified expenses DataFrame with columns:
            Fecha, Categoría, Descripción, Monto, Observaciones, Persona, Mes.

    Raises:
        FileNotFoundError: If the credentials file is missing.
        ValueError: If EXPENSES_SHEET_ID, PERSON_NAMES, or
                    GOOGLE_CREDENTIALS_PATH is not set.
        gspread.exceptions.SpreadsheetNotFound: If the sheet ID is wrong.
    """
    person_names_raw = os.getenv("PERSON_NAMES", "")
    if not person_names_raw:
        raise ValueError(
            "PERSON_NAMES environment variable is not set. "
            "Set it to a comma-separated list of names matching the tab headers, "
            "e.g. PERSON_NAMES=Ana,Carlos"
        )
    # Split on comma and strip surrounding whitespace from each name.
    person_names = [name.strip() for name in person_names_raw.split(",") if name.strip()]

    client = get_gspread_client()
    return load_expenses(client, person_names)


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
    # Fast path: gspread returns numeric cells as Python ints or floats.
    # When the whole column is already numeric, cast directly — no string
    # parsing needed and no risk of mangling thousand-separator strings.
    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0).astype(int)

    # Slow path: values are strings with various formatting styles:
    #   - Colombian dot-separated thousands:  " $4.219.992"
    #   - US comma-separated + cents:         "$22,500.00"
    #   - Plain string integers:              "150000"
    cleaned = (
        series.astype(str)
        .str.strip()
        # Strip trailing decimal cents (1–2 digits only) BEFORE removing thousand
        # separators. "\.\d{1,2}$" matches ".00" or ".5" but NOT ".000" (3 digits),
        # so Colombian thousand-separator dots (always followed by 3 digits) are safe.
        # Without this step, "$22,500.00" → after removing "," → "$22500.00" →
        # after removing non-digits (including ".") → "2250000" — off by 10×.
        .str.replace(r"\.\d{1,2}$", "", regex=True)
        # Remove common thousand separators (both dot and comma formats).
        # The lookahead (?=\d{3}) ensures we only remove separators, not
        # meaningful dots (like a lone decimal point with 3+ digits after it).
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
