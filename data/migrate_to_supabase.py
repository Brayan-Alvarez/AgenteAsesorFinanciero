"""
migrate_to_supabase.py — Import historical transactions from Google Sheets → Supabase.

Two modes (selected automatically):
  FAST  — uses SUPABASE_URL + SUPABASE_SERVICE_KEY directly (batch inserts).
           Set these in your local .env to use this mode.
  API   — uses the deployed FastAPI backend (/api/transactions/db).
           Works without local Supabase credentials; slower (one request per row).

Usage:
    python data/migrate_to_supabase.py            # live run
    python data/migrate_to_supabase.py --dry-run  # preview only, no writes
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ── Category mapping: Sheets label → Supabase category name ──────────────────
CATEGORY_MAP: dict[str, str] = {
    "Ahorro":                "Ahorro",
    "Almuerzos normales":    "Restaurantes",
    "Comida/Galgerias":      "Alimentación",
    "Deuda":                 "Deuda",
    "Educación":             "Educación",
    "Gusticos":              "Entretenimiento",
    "Otros":                 "Otros",
    "Plancitos":             "Entretenimiento",
    "Regalos":               "Regalos",
    "Restaurantes":          "Restaurantes",
    "Salud/médicos":         "Salud",
    "Servicios básicos":     "Vivienda",
    "SkinCare":              "Ropa y cuidado",
    "Suscripciones y Ocio":  "Suscripciones",
    "Tecnología":            "Tecnología",
    "Transporte":            "Transporte",
    "Viajes":                "Entretenimiento",
    "Vivienda":              "Vivienda",
}

TIPO_MAP: dict[str, str] = {"gasto": "expense", "ingreso": "income"}
FALLBACK_CATEGORY = "Otros"
DEFAULT_API_BASE  = "https://agenteasesorfinanciero-production.up.railway.app"
BATCH_SIZE        = 100


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Sheets transactions to Supabase.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without writing.")
    parser.add_argument("--api-base", default=os.getenv("API_BASE", DEFAULT_API_BASE),
                        help="Base URL of the FastAPI backend.")
    args = parser.parse_args()

    api_base = args.api_base.rstrip("/")
    use_direct = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"))

    if args.dry_run:
        logger.info("=== DRY RUN — nothing will be written ===")

    mode = "DIRECT Supabase client" if use_direct else "API endpoint (no local Supabase creds)"
    logger.info("Mode: %s", mode)

    # ── Step 1: Fetch Sheets transactions ─────────────────────────────────────
    logger.info("Fetching Sheets transactions from %s/api/transactions …", api_base)
    resp = requests.get(f"{api_base}/api/transactions", timeout=30)
    resp.raise_for_status()
    sheets_txns: list[dict] = resp.json()["transactions"]
    logger.info("Fetched %d rows from Sheets.", len(sheets_txns))

    # ── Step 2: Load Supabase reference data (categories + users) ─────────────
    logger.info("Loading reference data from %s …", api_base)
    cat_by_name: dict[str, str] = {
        c["name"]: c["id"]
        for c in requests.get(f"{api_base}/api/categories", timeout=10).json()
    }
    user_by_name: dict[str, str] = {
        u["name"]: u["id"]
        for u in requests.get(f"{api_base}/api/users", timeout=10).json()
    }
    logger.info("Categories: %s", sorted(cat_by_name))
    logger.info("Users: %s", sorted(user_by_name))

    # Warn about unmapped Sheets categories
    unmapped_in_map = {t["categoria"] for t in sheets_txns} - set(CATEGORY_MAP)
    if unmapped_in_map:
        logger.warning("Sheets categories without a mapping → will use '%s': %s",
                       FALLBACK_CATEGORY, sorted(unmapped_in_map))

    # ── Step 3: Load existing Supabase transactions for dedup ─────────────────
    logger.info("Loading existing Supabase transactions for dedup check …")
    existing_keys: set[tuple] = set()
    if use_direct:
        from db.client import get_supabase
        sb = get_supabase()
        for year in [2025, 2026]:
            rows = sb.table("transactions").select("user_id,date,description,amount") \
                     .gte("date", f"{year}-01-01").lte("date", f"{year}-12-31") \
                     .execute().data
            existing_keys.update((r["user_id"], r["date"], r["description"], r["amount"]) for r in rows)
    else:
        for year in [2025, 2026]:
            for month in range(1, 13):
                page = requests.get(f"{api_base}/api/transactions/db",
                                    params={"year": year, "month": month},
                                    timeout=10).json()
                for r in page:
                    existing_keys.add((r["user_id"], r["date"], r["description"], r["amount"]))

    logger.info("Found %d existing transactions in Supabase.", len(existing_keys))

    # ── Step 4: Build rows list ────────────────────────────────────────────────
    rows_to_insert: list[dict] = []
    skipped = errors = 0

    for txn in sheets_txns:
        sheets_cat = txn["categoria"]
        persona    = txn["persona"]

        sup_cat_name = CATEGORY_MAP.get(sheets_cat, FALLBACK_CATEGORY)
        cat_id  = cat_by_name.get(sup_cat_name)
        user_id = user_by_name.get(persona)

        if not cat_id:
            logger.error("Category '%s'→'%s' not in Supabase — skip.", sheets_cat, sup_cat_name)
            errors += 1
            continue
        if not user_id:
            logger.error("User '%s' not in Supabase — skip.", persona)
            errors += 1
            continue

        date        = txn["fecha"]
        description = (txn.get("descripcion") or "Sin descripción").strip()
        raw_amount  = int(txn["monto"])
        txn_type    = TIPO_MAP.get(txn.get("tipo", "gasto"), "expense")
        raw_notes   = str(txn.get("observaciones") or "").strip()
        notes       = raw_notes if raw_notes and raw_notes not in ("0", "$0") else None

        # Skip zero-amount placeholders (e.g. "pago total TC" without real value)
        if raw_amount == 0:
            skipped += 1
            continue

        # Negative amounts in Sheets = money received; treat as income with positive amount
        if raw_amount < 0:
            amount   = abs(raw_amount)
            txn_type = "income"
        else:
            amount = raw_amount

        key = (user_id, date, description, amount)
        if key in existing_keys:
            skipped += 1
            continue

        rows_to_insert.append({
            "user_id":     user_id,
            "date":        date,
            "category_id": cat_id,
            "description": description,
            "amount":      amount,
            "type":        txn_type,
            "notes":       notes,
        })

    print()
    print(f"  To insert : {len(rows_to_insert)}")
    print(f"  Skipped   : {skipped}  (already in Supabase)")
    print(f"  Errors    : {errors}")
    print()

    if args.dry_run or not rows_to_insert:
        logger.info("DRY RUN — no data written." if args.dry_run else "Nothing to insert.")
        return

    # ── Step 5: Insert ────────────────────────────────────────────────────────
    total_inserted = 0

    if use_direct:
        # Fast path: batch insert via Supabase client
        for i in range(0, len(rows_to_insert), BATCH_SIZE):
            chunk = rows_to_insert[i : i + BATCH_SIZE]
            sb.table("transactions").insert(chunk).execute()
            total_inserted += len(chunk)
            logger.info("  Inserted %d / %d …", total_inserted, len(rows_to_insert))
    else:
        # Slow path: one API call per row (no local Supabase creds)
        logger.info("Inserting %d rows via API (this may take a few minutes)…", len(rows_to_insert))
        errors_insert = 0
        for i, row in enumerate(rows_to_insert):
            try:
                r = requests.post(f"{api_base}/api/transactions/db", json={
                    "user_id":        row["user_id"],
                    "date":           row["date"],
                    "category_id":    row["category_id"],
                    "description":    row["description"],
                    "amount":         row["amount"],
                    "type":           row["type"],
                    "subcategory_id": None,
                    "notes":          row["notes"],
                }, timeout=15)
                r.raise_for_status()
                total_inserted += 1
            except Exception as exc:
                body = ""
                try:
                    body = r.text[:300]
                except Exception:
                    pass
                logger.error("Row %d failed: %s | body: %s | row: %s", i, exc, body, row)
                errors_insert += 1

            if (i + 1) % 50 == 0:
                logger.info("  … %d / %d done", i + 1, len(rows_to_insert))

        errors += errors_insert

    print()
    logger.info("✅  Migration complete — %d inserted, %d skipped, %d errors.",
                total_inserted, skipped, errors)


if __name__ == "__main__":
    main()
