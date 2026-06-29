"""
db/queries.py — All Supabase database queries, centralized.

Every function returns plain Python dicts/lists so the API layer
(api/routes/) can serialize them directly to JSON via Pydantic models.

Sections:
  - Users
  - Categories + Subcategories
  - Budget + Budget History
  - Transactions
  - Debts + Debt Payments
"""

from __future__ import annotations

import logging
from typing import Optional

from db.client import get_supabase

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


# ══════════════════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════════════════

def get_users() -> list[dict]:
    res = _sb().table("users").select("*").order("name").execute()
    return res.data


def get_user(user_id: str) -> dict | None:
    res = _sb().table("users").select("*").eq("id", user_id).single().execute()
    return res.data


# ══════════════════════════════════════════════════════════════════════════════
# CATEGORIES
# ══════════════════════════════════════════════════════════════════════════════

def get_categories(include_inactive: bool = False) -> list[dict]:
    """
    All categories ordered by sort_order, with their subcategories.
    By default returns only active categories (is_active = true).
    Pass include_inactive=True to get everything (used by AppContext for display).
    """
    q = _sb().table("categories").select("*, subcategories(*)").order("sort_order")
    if not include_inactive:
        q = q.eq("is_active", True)
    cats = q.execute().data
    # Filter inactive subcategories when not requested
    if not include_inactive:
        for cat in cats:
            cat["subcategories"] = [s for s in (cat.get("subcategories") or []) if s.get("is_active", True)]
    return cats


def get_category(category_id: str) -> dict | None:
    res = _sb().table("categories").select("*, subcategories(*)").eq("id", category_id).single().execute()
    return res.data


def create_category(name: str, icon: str, color: str, type_: str, sort_order: int = 0) -> dict:
    res = _sb().table("categories").insert({
        "name": name,
        "icon": icon,
        "color": color,
        "type": type_,
        "sort_order": sort_order,
    }).execute()
    return res.data[0]


def update_category(category_id: str, **fields) -> dict:
    res = _sb().table("categories").update(fields).eq("id", category_id).execute()
    return res.data[0]


def delete_category(category_id: str) -> None:
    # Soft delete: mark inactive so existing transactions keep their category reference.
    _sb().table("categories").update({"is_active": False}).eq("id", category_id).execute()


# ── Subcategories ─────────────────────────────────────────────────────────────

def create_subcategory(category_id: str, name: str, icon: str = "📦", sort_order: int = 0) -> dict:
    res = _sb().table("subcategories").insert({
        "category_id": category_id,
        "name": name,
        "icon": icon,
        "sort_order": sort_order,
    }).execute()
    return res.data[0]


def update_subcategory(subcategory_id: str, **fields) -> dict:
    res = _sb().table("subcategories").update(fields).eq("id", subcategory_id).execute()
    return res.data[0]


def delete_subcategory(subcategory_id: str) -> None:
    # Soft delete: existing transactions that reference this subcategory keep their link.
    _sb().table("subcategories").update({"is_active": False}).eq("id", subcategory_id).execute()


# ══════════════════════════════════════════════════════════════════════════════
# BUDGET
# ══════════════════════════════════════════════════════════════════════════════

def get_budget(year: int, month: int, user_id: Optional[str] = None) -> list[dict]:
    """Return effective budget for the given month using carry-forward semantics.

    The budget is conceptually annual — the user sets it once and it applies until
    they explicitly change it (e.g. after a raise). Rules:

    For each (category_id, user_id) pair:
    1. Prefer the entry with the highest month <= requested month.
       This is the most recent budget decision at or before the viewed month.
    2. If no entry exists on or before the requested month (e.g. viewing January
       when the budget was first set in May), fall back to the earliest entry in
       the year so the view is never empty.

    Examples with a budget set in May and updated in September:
      Jan: no prior entry → falls back to May  (earliest)
      May: exact match   → May
      Jun: highest ≤ 6   → May   (carries forward)
      Sep: exact match   → Sep
      Dec: highest ≤ 12  → Sep   (carries forward)
    """
    from collections import defaultdict

    q = _sb().table("budget").select(
        "*, categories(id, name, icon, color, type)"
    ).eq("year", year)
    if user_id:
        q = q.eq("user_id", user_id)
    all_rows = q.execute().data

    # Group by (category_id, user_id)
    groups: dict[tuple, list] = defaultdict(list)
    for row in all_rows:
        key = (row["category_id"], row.get("user_id"))
        groups[key].append(row)

    effective = []
    for rows in groups.values():
        # Most recent entry at or before the requested month (carry-forward)
        prior = [r for r in rows if r["month"] <= month]
        if prior:
            effective.append(max(prior, key=lambda r: r["month"]))
        else:
            # Budget was set after this month — show the earliest available entry
            # so the view is never blank (common when viewing January before any entry)
            effective.append(min(rows, key=lambda r: r["month"]))

    return effective


def upsert_budget(category_id: str, user_id: str, year: int, month: int,
                  amount: int, reason: Optional[str] = None) -> dict:
    """
    Create or update a budget entry. Records the change in budget_history.
    """
    sb = _sb()

    # Check for existing entry
    existing = sb.table("budget").select("*") \
        .eq("category_id", category_id) \
        .eq("user_id", user_id) \
        .eq("year", year) \
        .eq("month", month) \
        .execute().data

    if existing:
        old_amount = existing[0]["amount"]
        budget_id  = existing[0]["id"]
        res = sb.table("budget").update({"amount": amount}).eq("id", budget_id).execute()
        entry = res.data[0]
    else:
        old_amount = None
        res = sb.table("budget").insert({
            "category_id": category_id,
            "user_id":     user_id,
            "year":        year,
            "month":       month,
            "amount":      amount,
        }).execute()
        entry = res.data[0]
        budget_id = entry["id"]

    # Log the change
    sb.table("budget_history").insert({
        "budget_id":   budget_id,
        "category_id": category_id,
        "user_id":     user_id,
        "year":        year,
        "month":       month,
        "old_amount":  old_amount,
        "new_amount":  amount,
        "reason":      reason,
    }).execute()

    return entry


def delete_budget(budget_id: str) -> None:
    _sb().table("budget").delete().eq("id", budget_id).execute()


def get_budget_history(category_id: str, user_id: str) -> list[dict]:
    """Audit log for a specific user+category combination."""
    res = _sb().table("budget_history") \
        .select("*") \
        .eq("category_id", category_id) \
        .eq("user_id", user_id) \
        .order("changed_at", desc=True) \
        .execute()
    return res.data


# ══════════════════════════════════════════════════════════════════════════════
# TRANSACTIONS
# ══════════════════════════════════════════════════════════════════════════════

def get_transactions(
    user_id:     Optional[str] = None,
    year:        Optional[int] = None,
    month:       Optional[int] = None,
    category_id: Optional[str] = None,
) -> list[dict]:
    q = _sb().table("transactions").select(
        "*, users(id, name, color, avatar), "
        "categories(id, name, icon, color), "
        "subcategories(id, name)"
    ).order("date", desc=True)

    if user_id:
        q = q.eq("user_id", user_id)
    if category_id:
        q = q.eq("category_id", category_id)
    if year and month:
        import datetime
        first = datetime.date(year, month, 1)
        last  = datetime.date(year, month + 1, 1) if month < 12 else datetime.date(year + 1, 1, 1)
        q = q.gte("date", str(first)).lt("date", str(last))
    elif year:
        q = q.gte("date", f"{year}-01-01").lte("date", f"{year}-12-31")

    return q.execute().data


def create_transaction(
    user_id:        str,
    date:           str,
    category_id:    str,
    description:    str,
    amount:         int,
    type_:          str,
    subcategory_id: Optional[str] = None,
    notes:          Optional[str] = None,
    debt_id:        Optional[str] = None,
) -> dict:
    sb  = _sb()
    res = sb.table("transactions").insert({
        "user_id":        user_id,
        "date":           date,
        "category_id":    category_id,
        "subcategory_id": subcategory_id,
        "description":    description,
        "amount":         amount,
        "type":           type_,
        "notes":          notes,
        "debt_id":        debt_id,
    }).execute()
    tx = res.data[0]

    # When a transaction is linked to a debt, auto-create the matching debt_payment
    # so the debt balance updates immediately. All manual extra payments = full capital.
    if debt_id and type_ == "expense":
        sb.table("debt_payments").insert({
            "debt_id":        debt_id,
            "amount":         amount,
            "capital_amount": amount,   # extra payments go entirely to capital
            "date":           date,
            "description":    description,
            "paid_by":        user_id,
            "transaction_id": tx["id"],
            "payment_type":   "manual",
        }).execute()
        # Auto-mark debt as paid if balance reaches zero
        debt = get_debt(debt_id)
        if debt and debt["pending_amount"] == 0:
            sb.table("debts").update({"status": "paid"}).eq("id", debt_id).execute()

    return tx


def update_transaction(transaction_id: str, **fields) -> dict:
    res = _sb().table("transactions").update(fields).eq("id", transaction_id).execute()
    return res.data[0]


def delete_transaction(transaction_id: str) -> None:
    _sb().table("transactions").delete().eq("id", transaction_id).execute()


def migrate_category_transactions(
    from_category_id: str,
    to_category_id: str,
    to_subcategory_id: Optional[str] = None,
) -> int:
    """
    Reassign every transaction that belongs to from_category_id to to_category_id.
    Also sets subcategory_id (None clears it). Returns the number of rows updated.
    This operates across ALL time, not just the current year.
    """
    res = (
        _sb()
        .table("transactions")
        .update({"category_id": to_category_id, "subcategory_id": to_subcategory_id})
        .eq("category_id", from_category_id)
        .execute()
    )
    return len(res.data)


# ══════════════════════════════════════════════════════════════════════════════
# DEBTS
# ══════════════════════════════════════════════════════════════════════════════

def _compute_debt_stats(debt: dict) -> dict:
    """
    Enrich a debt dict with computed financial stats:
      pending_amount      — remaining capital balance
      total_capital_paid  — historical + tracked capital
      total_interest_paid — historical + tracked interest
      total_paid          — total money actually paid out of pocket
    Uses capital_amount from each payment if available; falls back to amount.
    """
    payments          = debt.get("debt_payments") or []
    hist_cap          = debt.get("historical_capital_paid")  or 0
    hist_int          = debt.get("historical_interest_paid") or 0

    tracked_capital   = sum(p.get("capital_amount") or p["amount"] for p in payments)
    tracked_interest  = sum(p.get("interest_amount") or 0            for p in payments)
    tracked_total     = sum(p["amount"]                               for p in payments)

    total_capital     = hist_cap + tracked_capital
    total_interest    = hist_int + tracked_interest
    total_paid        = hist_cap + hist_int + tracked_total

    debt["pending_amount"]      = max(debt["total_amount"] - total_capital, 0)
    debt["total_capital_paid"]  = total_capital
    debt["total_interest_paid"] = total_interest
    debt["total_paid"]          = total_paid
    return debt


def _get_or_create_debts_category() -> str:
    """Returns the UUID of 'Finanzas y deudas', creating it if absent."""
    sb  = _sb()
    res = sb.table("categories").select("id").eq("name", "Finanzas y deudas").execute()
    if res.data:
        return res.data[0]["id"]
    new = sb.table("categories").insert({
        "name":       "Finanzas y deudas",
        "icon":       "💳",
        "color":      "#dc2626",
        "type":       "fixed",
        "sort_order": 12,
    }).execute()
    return new.data[0]["id"]


def get_debts(user_id: Optional[str] = None) -> list[dict]:
    """Returns debts with payments and computed financial stats."""
    q = _sb().table("debts").select(
        "*, debt_payments(*), users(id, name, color, avatar)"
    ).order("created_at", desc=True)

    if user_id:
        q = q.or_(f"user_id.eq.{user_id},user_id.is.null")

    debts = q.execute().data
    for debt in debts:
        _compute_debt_stats(debt)
    return debts


def get_debt(debt_id: str) -> dict | None:
    res = _sb().table("debts") \
        .select("*, debt_payments(*), users(id, name, color, avatar)") \
        .eq("id", debt_id).single().execute()
    if not res.data:
        return None
    return _compute_debt_stats(res.data)


def create_debt(
    name:                    str,
    total_amount:            int,
    user_id:                 Optional[str]   = None,
    description:             Optional[str]   = None,
    color:                   str             = "#dc2626",
    due_date:                Optional[str]   = None,
    installment_amount:       Optional[int]   = None,
    installment_amount_2:     Optional[int]   = None,
    annual_rate:              Optional[float] = None,
    payment_day:              Optional[int]   = None,
    payment_day_2:            Optional[int]   = None,
    auto_pay:                 bool            = False,
    historical_capital_paid:  int             = 0,
    historical_interest_paid: int             = 0,
) -> dict:
    sb  = _sb()
    # Build the row dict with required fields always present.
    # Optional nullable columns are only included when they have a value —
    # this prevents PostgREST PGRST204 errors if a column migration hasn't
    # been run yet in a given Supabase project.
    row: dict = {
        "name":                     name,
        "total_amount":             total_amount,
        "color":                    color,
        "auto_pay":                 auto_pay,
        "historical_capital_paid":  historical_capital_paid,
        "historical_interest_paid": historical_interest_paid,
    }
    if user_id is not None:              row["user_id"]              = user_id
    if description is not None:          row["description"]          = description
    if due_date is not None:             row["due_date"]             = due_date
    if installment_amount is not None:   row["installment_amount"]   = installment_amount
    if installment_amount_2 is not None: row["installment_amount_2"] = installment_amount_2
    if annual_rate is not None:          row["annual_rate"]          = annual_rate
    if payment_day is not None:          row["payment_day"]          = payment_day
    if payment_day_2 is not None:        row["payment_day_2"]        = payment_day_2

    res  = sb.table("debts").insert(row).execute()
    debt = res.data[0]

    # Auto-create a subcategory under "Finanzas y deudas" so this debt appears
    # as a selectable option in the transaction form.
    cat_id  = _get_or_create_debts_category()
    sub_res = sb.table("subcategories").insert({
        "category_id": cat_id,
        "name":        name,
        "icon":        "💳",
        "sort_order":  0,
    }).execute()
    sub_id  = sub_res.data[0]["id"]
    sb.table("debts").update({"subcategory_id": sub_id}).eq("id", debt["id"]).execute()
    debt["subcategory_id"] = sub_id

    return debt


def update_debt(debt_id: str, **fields) -> dict:
    # If name changed, keep the linked subcategory in sync
    sb = _sb()
    if "name" in fields:
        debt_row = sb.table("debts").select("subcategory_id").eq("id", debt_id).single().execute()
        sub_id   = debt_row.data.get("subcategory_id") if debt_row.data else None
        if sub_id:
            sb.table("subcategories").update({"name": fields["name"]}).eq("id", sub_id).execute()
    sb.table("debts").update(fields).eq("id", debt_id).execute()
    return get_debt(debt_id)


def delete_debt(debt_id: str) -> None:
    sb = _sb()
    # Soft-deactivate the linked subcategory so historical transactions keep it
    debt_row = sb.table("debts").select("subcategory_id").eq("id", debt_id).single().execute()
    sub_id   = debt_row.data.get("subcategory_id") if debt_row.data else None
    if sub_id:
        sb.table("subcategories").update({"is_active": False}).eq("id", sub_id).execute()
    sb.table("debts").delete().eq("id", debt_id).execute()


# ── Debt payments ─────────────────────────────────────────────────────────────

def create_debt_payment(
    debt_id:        str,
    amount:         int,
    date:           str,
    paid_by:        Optional[str]   = None,
    description:    Optional[str]   = None,
    notes:          Optional[str]   = None,
    capital_amount: Optional[int]   = None,
    interest_amount:Optional[int]   = None,
    transaction_id: Optional[str]   = None,
    payment_type:   str             = "manual",
) -> dict:
    sb  = _sb()

    # For manual payments (no pre-existing transaction), create a matching expense
    # transaction so the abono appears in the main transactions list and Dashboard totals.
    # Auto-pay installments already pass transaction_id, so we skip them.
    tx_id = transaction_id
    if paid_by and tx_id is None:
        debt_info = sb.table("debts").select("name, subcategory_id") \
            .eq("id", debt_id).single().execute().data
        if debt_info:
            sub_id = debt_info.get("subcategory_id")
            if sub_id:
                sub_res = sb.table("subcategories").select("category_id") \
                    .eq("id", sub_id).single().execute()
                cat_id = sub_res.data["category_id"] if sub_res.data else _get_or_create_debts_category()
            else:
                cat_id = _get_or_create_debts_category()

            tx_res = sb.table("transactions").insert({
                "user_id":        paid_by,
                "date":           date,
                "category_id":    cat_id,
                "subcategory_id": sub_id,
                "description":    description or f"Abono — {debt_info['name']}",
                "amount":         amount,
                "type":           "expense",
                "debt_id":        debt_id,
                "notes":          notes,
            }).execute()
            tx_id = tx_res.data[0]["id"]

    res = sb.table("debt_payments").insert({
        "debt_id":        debt_id,
        "amount":         amount,
        "date":           date,
        "paid_by":        paid_by,
        "description":    description,
        "notes":          notes,
        "capital_amount": capital_amount,
        "interest_amount":interest_amount,
        "transaction_id": tx_id,
        "payment_type":   payment_type,
    }).execute()
    payment = res.data[0]

    # Auto-mark debt as paid when balance reaches zero
    debt = get_debt(debt_id)
    if debt and debt["pending_amount"] == 0:
        sb.table("debts").update({"status": "paid"}).eq("id", debt_id).execute()

    return payment


# ── Debt installment auto-processing ─────────────────────────────────────────

def _create_single_installment(
    sb, debt: dict, pay_date, installment: int, annual_rate, months_es: list
) -> bool:
    """
    Creates ONE auto-payment (transaction + debt_payment) for the given date.
    Idempotent: returns False without creating if an auto payment on that
    exact date already exists.  Returns True when a new payment is created.
    """
    # Idempotency: one auto payment per debt per calendar date
    existing = sb.table("debt_payments") \
        .select("id") \
        .eq("debt_id", debt["id"]) \
        .eq("date", str(pay_date)) \
        .eq("payment_type", "auto") \
        .execute()
    if existing.data:
        return False

    # Re-fetch current balance so the second payment of the month uses the
    # updated balance after the first one was applied.
    fresh = sb.table("debts") \
        .select("*, debt_payments(amount, capital_amount, date)") \
        .eq("id", debt["id"]).single().execute()
    if not fresh.data:
        return False
    _compute_debt_stats(fresh.data)
    balance = fresh.data["pending_amount"]
    if balance <= 0:
        return False

    # Capital / interest split (annual_rate=0 or None → all capital)
    if annual_rate and annual_rate > 0 and installment > 0:
        monthly_rate = (1 + annual_rate / 100) ** (1 / 12) - 1
        interest_amt = round(balance * monthly_rate)
        capital_amt  = max(min(installment - interest_amt, balance), 0)
    else:
        interest_amt = 0
        capital_amt  = min(installment or balance, balance)

    total_amt = capital_amt + interest_amt
    month     = pay_date.month
    year      = pay_date.year

    # Create transaction if debt has owner + subcategory
    tx_id  = None
    sub_id = debt.get("subcategory_id")
    owner  = debt.get("user_id")
    if sub_id and owner:
        sub_res = sb.table("subcategories").select("category_id") \
            .eq("id", sub_id).single().execute()
        cat_id  = sub_res.data["category_id"] if sub_res.data else _get_or_create_debts_category()
        tx_res  = sb.table("transactions").insert({
            "user_id":        owner,
            "date":           str(pay_date),
            "category_id":    cat_id,
            "subcategory_id": sub_id,
            "description":    f"Cuota {debt['name']} — {months_es[month-1]} {year}",
            "amount":         total_amt,
            "type":           "expense",
            "debt_id":        debt["id"],
        }).execute()
        tx_id = tx_res.data[0]["id"]

    pay_res = sb.table("debt_payments").insert({
        "debt_id":         debt["id"],
        "amount":          total_amt,
        "capital_amount":  capital_amt,
        "interest_amount": interest_amt if interest_amt > 0 else None,
        "date":            str(pay_date),
        "description":     f"Cuota automática {months_es[month-1]} {year}",
        "payment_type":    "auto",
        "transaction_id":  tx_id,
        "paid_by":         owner,
    }).execute()

    if tx_id:
        sb.table("debt_payments").update({"transaction_id": tx_id}) \
            .eq("id", pay_res.data[0]["id"]).execute()

    return True


def process_pending_debt_installments(year: int, month: int) -> int:
    """
    Idempotent: for each active debt with auto_pay=True, create auto
    installment transactions for all configured payment days in the month.
    Supports two payment days (payment_day + payment_day_2) for bi-weekly debts.
    Each payment day is idempotent independently (keyed by exact date).
    Returns the number of new payments created.
    """
    import calendar
    from datetime import date as _date

    sb      = _sb()
    today   = _date.today()
    created = 0

    months_es = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

    current_month = _date(today.year, today.month, 1)
    payment_month = _date(year, month, 1)
    if payment_month > current_month:
        return 0  # Never process future months

    max_day = calendar.monthrange(year, month)[1]

    # Active debts with auto_pay enabled
    debts = sb.table("debts").select(
        "*, debt_payments(amount, capital_amount, date)"
    ).eq("auto_pay", True).eq("status", "active").execute().data

    for debt in debts:
        _compute_debt_stats(debt)
        if debt["pending_amount"] <= 0:
            continue

        annual_rate = debt.get("annual_rate")  # None or 0 → interest-free

        # Build list of (day, installment_amount) pairs.
        # payment_day_2 uses installment_amount_2 when set, otherwise falls back
        # to the same installment_amount as the first payment.
        installment_1 = debt.get("installment_amount") or 0
        installment_2 = debt.get("installment_amount_2") or installment_1
        day_1 = debt.get("payment_day") or 1
        day_2 = debt.get("payment_day_2")

        day_installment_pairs = [(day_1, installment_1)]
        if day_2:
            day_installment_pairs.append((day_2, installment_2))

        # Clamp days to actual month length and deduplicate
        seen = set()
        deduped = []
        for (d, amt) in day_installment_pairs:
            d_clamped = min(d, max_day)
            if d_clamped not in seen:
                seen.add(d_clamped)
                deduped.append((d_clamped, amt))
        day_installment_pairs = sorted(deduped, key=lambda x: x[0])

        for day, installment in day_installment_pairs:
            pay_date = _date(year, month, day)
            # Don't process payments that haven't arrived yet (current month only)
            if payment_month == current_month and pay_date > today:
                continue
            if _create_single_installment(sb, debt, pay_date, installment, annual_rate, months_es):
                created += 1

    return created


# ══════════════════════════════════════════════════════════════════════════════
# SUBSCRIPTIONS
# ══════════════════════════════════════════════════════════════════════════════

def _get_or_create_subscriptions_category() -> str:
    """Returns the UUID of the 'Suscripciones' category, creating it if it doesn't exist.

    All subscription transactions are always assigned to this category so that
    the budget page can display an auto-calculated read-only budget for it.
    """
    sb = _sb()
    res = sb.table("categories").select("id").eq("name", "Suscripciones").limit(1).execute()
    if res.data:
        return res.data[0]["id"]
    # Category doesn't exist yet — create it
    try:
        new_cat = sb.table("categories").insert({
            "name":       "Suscripciones",
            "icon":       "🔄",
            "color":      "#6366f1",
            "type":       "fixed",
            "sort_order": 99,
            "is_active":  True,
        }).execute()
        return new_cat.data[0]["id"]
    except Exception:
        # Race condition: another request created it between our SELECT and INSERT
        res = sb.table("categories").select("id").eq("name", "Suscripciones").limit(1).execute()
        if res.data:
            return res.data[0]["id"]
        raise


def get_subscriptions(user_id: Optional[str] = None, include_inactive: bool = False) -> list[dict]:
    q = (_sb().table("subscriptions")
         .select("*, users(id, name, color, avatar)")
         .order("created_at"))
    if not include_inactive:
        q = q.eq("is_active", True)
    if user_id:
        q = q.eq("user_id", user_id)
    return q.execute().data


def create_subscription(
    name: str, amount: int, billing_day: int,
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    icon: str = "🔄", color: str = "#6366f1",
    user_id: Optional[str] = None,
    start_date: Optional[str] = None, notes: Optional[str] = None,
) -> dict:
    from datetime import date as _date
    # If no category chosen, fall back to the dedicated "Suscripciones" category.
    resolved_category_id = category_id or _get_or_create_subscriptions_category()
    res = _sb().table("subscriptions").insert({
        "name":           name,
        "amount":         amount,
        "category_id":    resolved_category_id,
        "subcategory_id": subcategory_id,
        "user_id":        user_id,
        "billing_day":    billing_day,
        "icon":           icon,
        "color":          color,
        "start_date":     start_date or str(_date.today()),
        "notes":          notes,
    }).execute()
    return res.data[0]


def update_subscription(subscription_id: str, **fields) -> dict:
    res = _sb().table("subscriptions").update(fields).eq("id", subscription_id).execute()
    return res.data[0]


def cancel_subscription(subscription_id: str) -> dict:
    """Soft delete: marks inactive and records end_date for historical budget accuracy."""
    from datetime import date as _date
    res = _sb().table("subscriptions").update({
        "is_active": False,
        "end_date":  str(_date.today()),
    }).eq("id", subscription_id).execute()
    return res.data[0]


def process_pending_subscriptions(year: int, month: int) -> int:
    """
    For the given month, create expense transactions for every active subscription
    whose billing_day has arrived (≤ today.day for the current month, always for
    past months) and that has no transaction yet for that month.

    Safe to call multiple times — checks for existing transactions before inserting.
    Returns the number of transactions created.
    """
    import datetime
    today = datetime.date.today()
    first_day = datetime.date(year, month, 1)
    last_day_num = (datetime.date(year, month % 12 + 1, 1) - datetime.timedelta(days=1)).day \
                   if month < 12 else 31
    last_day = datetime.date(year, month, last_day_num)

    is_current = (year == today.year and month == today.month)

    sb = _sb()

    # Active subscriptions that started before or during this month
    subs = (sb.table("subscriptions")
              .select("*")
              .eq("is_active", True)
              .lte("start_date", str(last_day))
              .execute().data)

    # Also include subscriptions cancelled DURING this month (they should still be billed)
    cancelled = (sb.table("subscriptions")
                   .select("*")
                   .eq("is_active", False)
                   .lte("start_date", str(last_day))
                   .gte("end_date",   str(first_day))
                   .execute().data)

    created = 0
    for sub in subs + cancelled:
        billing_day = sub["billing_day"]

        # For the current month, only create if billing day has arrived
        if is_current and billing_day > today.day:
            continue

        # Clamp billing_day to the actual last day of the month
        actual_day = min(billing_day, last_day_num)
        txn_date = str(datetime.date(year, month, actual_day))

        # Skip if a transaction for this subscription already exists this month
        existing = (sb.table("transactions")
                      .select("id")
                      .eq("subscription_id", sub["id"])
                      .gte("date", str(first_day))
                      .lte("date", str(last_day))
                      .execute().data)
        if existing:
            continue

        sb.table("transactions").insert({
            "user_id":         sub["user_id"],
            "date":            txn_date,
            "category_id":     sub["category_id"],
            "subcategory_id":  sub["subcategory_id"],
            "description":     sub["name"],
            "amount":          sub["amount"],
            "type":            "expense",
            "subscription_id": sub["id"],
            "notes":           "Pago automático de suscripción",
        }).execute()
        created += 1

    return created


def delete_debt_payment(payment_id: str) -> None:
    sb = _sb()
    # Fetch both debt_id and transaction_id before deletion
    payment = sb.table("debt_payments").select("debt_id, transaction_id") \
        .eq("id", payment_id).single().execute().data
    if payment:
        sb.table("debt_payments").delete().eq("id", payment_id).execute()
        # Also delete the linked transaction so it disappears from the transactions list
        if payment.get("transaction_id"):
            sb.table("transactions").delete().eq("id", payment["transaction_id"]).execute()
        sb.table("debts").update({"status": "active"}).eq("id", payment["debt_id"]).execute()


# ══════════════════════════════════════════════════════════════════════════════
# INCOME
# ══════════════════════════════════════════════════════════════════════════════

def get_income(year: int, month: int, user_id: Optional[str] = None) -> list[dict]:
    """Return effective income for the given month using carry-forward semantics.

    Identical logic to get_budget: the most recent entry per user at or before
    the requested month is used (carry-forward). Falls back to the earliest future
    entry if no prior entry exists for that user.
    """
    from collections import defaultdict

    q = _sb().table("income").select(
        "*, users(id, name, color, avatar)"
    ).eq("year", year)
    if user_id:
        q = q.eq("user_id", user_id)
    all_rows = q.execute().data

    groups: dict[str, list] = defaultdict(list)
    for row in all_rows:
        groups[row["user_id"]].append(row)

    effective = []
    for rows in groups.values():
        prior = [r for r in rows if r["month"] <= month]
        if prior:
            effective.append(max(prior, key=lambda r: r["month"]))
        else:
            effective.append(min(rows, key=lambda r: r["month"]))

    return effective


def upsert_income(
    user_id: str, year: int, month: int, amount: int,
    notes: Optional[str] = None,
) -> dict:
    """Create or update an income entry. Always records the change in income_history."""
    sb = _sb()

    existing = sb.table("income").select("*") \
        .eq("user_id", user_id).eq("year", year).eq("month", month) \
        .execute().data

    if existing:
        old_amount = existing[0]["amount"]
        income_id  = existing[0]["id"]
        res = sb.table("income").update({"amount": amount, "notes": notes}) \
            .eq("id", income_id).execute()
        entry = res.data[0]
    else:
        old_amount = None
        res = sb.table("income").insert({
            "user_id": user_id,
            "year":    year,
            "month":   month,
            "amount":  amount,
            "notes":   notes,
        }).execute()
        entry      = res.data[0]
        income_id  = entry["id"]

    sb.table("income_history").insert({
        "income_id": income_id,
        "user_id":   user_id,
        "year":      year,
        "month":     month,
        "old_amount": old_amount,
        "new_amount": amount,
        "notes":      notes,
    }).execute()

    # Auto-generate income transaction for the saved month (idempotent)
    generate_income_transactions(year, month)

    return entry


def get_income_history(user_id: str) -> list[dict]:
    """Full audit log for a user's income changes, most recent first."""
    res = _sb().table("income_history").select("*") \
        .eq("user_id", user_id) \
        .order("changed_at", desc=True) \
        .execute()
    return res.data


# ══════════════════════════════════════════════════════════════════════════════
# INCOME TRANSACTIONS — auto-generate monthly income entries in transactions
# ══════════════════════════════════════════════════════════════════════════════

def _get_or_create_income_category() -> str:
    """Returns the UUID of the 'Ingresos' category, creating it if absent."""
    sb  = _sb()
    res = sb.table("categories").select("id").eq("name", "Ingresos").execute()
    if res.data:
        return res.data[0]["id"]
    new = sb.table("categories").insert({
        "name":       "Ingresos",
        "icon":       "💰",
        "color":      "#22c55e",
        "type":       "variable",
        "sort_order": 0,
        "is_active":  True,
    }).execute()
    return new.data[0]["id"]


def generate_income_transactions(year: int, month: int) -> int:
    """
    For the given month, create one income transaction per user who has
    declared income, if no income transaction already exists for that user
    in that month.  Idempotent — safe to call on every app load.
    Returns the number of new transactions created.
    """
    sb          = _sb()
    income_rows = get_income(year, month)
    if not income_rows:
        return 0

    cat_id  = _get_or_create_income_category()
    lo      = f"{year}-{month:02d}-01"
    hi      = f"{year}-{month+1:02d}-01" if month < 12 else f"{year+1}-01-01"
    created = 0

    for row in income_rows:
        user_id = row["user_id"]
        amount  = row.get("amount", 0)
        if amount <= 0:
            continue

        # Skip only if an auto-generated income transaction (in the "Ingresos" category)
        # already exists for this user+month.  Manual income entries in other categories
        # must not block the auto-generation (that was the original bug for Belmont).
        existing = sb.table("transactions").select("id") \
            .eq("user_id", user_id).eq("type", "income") \
            .eq("category_id", cat_id) \
            .gte("date", lo).lt("date", hi) \
            .execute()
        if existing.data:
            continue

        user_name = (row.get("users") or {}).get("name", "")
        desc      = f"Ingreso mensual{' – ' + user_name if user_name else ''}"

        sb.table("transactions").insert({
            "user_id":     user_id,
            "date":        lo,           # 1st of the month
            "category_id": cat_id,
            "description": desc,
            "amount":      amount,
            "type":        "income",
        }).execute()
        created += 1

    return created


def seed_income_transactions_history() -> int:
    """
    Generate income transactions for every month that has any transaction
    data, up to and including the current month.  Uses carry-forward income.
    Safe to call multiple times (idempotent per user+month).
    """
    from datetime import date as _date

    sb    = _sb()
    today = _date.today()

    # Collect every distinct year/month from the transactions table
    txns   = sb.table("transactions").select("date").execute().data
    months = set()
    for t in txns:
        d = _date.fromisoformat(t["date"])
        if d <= today:
            months.add((d.year, d.month))

    # Always include the current month even if no transactions yet
    months.add((today.year, today.month))

    total = 0
    for (y, m) in sorted(months):
        total += generate_income_transactions(y, m)
    return total


# ══════════════════════════════════════════════════════════════════════════════
# PRIMAS (year-end / mid-year bonuses — auto-generate income transactions)
# ══════════════════════════════════════════════════════════════════════════════

def get_primas(user_id: Optional[str] = None) -> list[dict]:
    """Return all active primas, optionally filtered by user."""
    q = _sb().table("primas").select("*, users(id, name, color, avatar)") \
        .eq("is_active", True).order("month")
    if user_id:
        q = q.eq("user_id", user_id)
    return q.execute().data


def create_prima(user_id: str, month: int, amount: int,
                 description: str = "Prima",
                 salary_pct: Optional[int] = None,
                 payment_day: int = 15) -> dict:
    data: dict = {
        "user_id":     user_id,
        "month":       month,
        "amount":      amount,
        "description": description,
        "payment_day": payment_day,
    }
    if salary_pct is not None:
        data["salary_pct"] = salary_pct
    res = _sb().table("primas").insert(data).execute()
    return res.data[0]


def update_prima(prima_id: str, **fields) -> dict:
    res = _sb().table("primas").update(fields).eq("id", prima_id).execute()
    return res.data[0]


def delete_prima(prima_id: str) -> None:
    """Soft delete — keeps historical transactions linked to this prima intact."""
    _sb().table("primas").update({"is_active": False}).eq("id", prima_id).execute()


def process_pending_primas(year: int, month: int) -> int:
    """
    Idempotent: for each active prima configured for the given month, create
    an income transaction in that year/month if one does not already exist.
    Uses prima_id on the transactions table for idempotency.
    Returns the number of new transactions created.
    """
    from datetime import date as _date

    today = _date.today()
    if _date(year, month, 1) > _date(today.year, today.month, 1):
        return 0  # never process future months

    sb      = _sb()
    primas  = sb.table("primas").select("*").eq("is_active", True).eq("month", month).execute().data
    if not primas:
        return 0

    import calendar as _cal

    cat_id  = _get_or_create_income_category()
    lo      = f"{year}-{month:02d}-01"
    hi      = f"{year}-{month+1:02d}-01" if month < 12 else f"{year+1}-01-01"
    last_day_of_month = _cal.monthrange(year, month)[1]
    created = 0

    for prima in primas:
        # Idempotency: one income transaction per prima per year
        existing = sb.table("transactions").select("id") \
            .eq("prima_id", prima["id"]) \
            .gte("date", lo).lt("date", hi).execute()
        if existing.data:
            continue

        # If salary_pct is set, compute the amount from the user's effective income
        if prima.get("salary_pct"):
            income_rows = get_income(year, month, prima["user_id"])
            base_income  = income_rows[0]["amount"] if income_rows else 0
            amount       = round(base_income * prima["salary_pct"] / 100)
        else:
            amount = prima["amount"]

        if amount <= 0:
            continue

        # Clamp payment_day to the actual last day of the month (e.g. Feb 30 → Feb 28)
        raw_day  = prima.get("payment_day") or 15
        pay_day  = min(raw_day, last_day_of_month)
        txn_date = f"{year}-{month:02d}-{pay_day:02d}"

        sb.table("transactions").insert({
            "user_id":     prima["user_id"],
            "date":        txn_date,
            "category_id": cat_id,
            "description": prima["description"],
            "amount":      amount,
            "type":        "income",
            "prima_id":    prima["id"],
        }).execute()
        created += 1

    return created
