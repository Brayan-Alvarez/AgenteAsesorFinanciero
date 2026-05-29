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
    """
    Return budget rows for a given month.
    If user_id is provided, return only that user's entries.
    The caller (API layer) derives Pareja totals and percentages.
    """
    q = _sb().table("budget").select(
        "*, categories(id, name, icon, color, type)"
    ).eq("year", year).eq("month", month)
    if user_id:
        q = q.eq("user_id", user_id)
    return q.execute().data


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
) -> dict:
    res = _sb().table("transactions").insert({
        "user_id":        user_id,
        "date":           date,
        "category_id":    category_id,
        "subcategory_id": subcategory_id,
        "description":    description,
        "amount":         amount,
        "type":           type_,
        "notes":          notes,
    }).execute()
    return res.data[0]


def update_transaction(transaction_id: str, **fields) -> dict:
    res = _sb().table("transactions").update(fields).eq("id", transaction_id).execute()
    return res.data[0]


def delete_transaction(transaction_id: str) -> None:
    _sb().table("transactions").delete().eq("id", transaction_id).execute()


# ══════════════════════════════════════════════════════════════════════════════
# DEBTS
# ══════════════════════════════════════════════════════════════════════════════

def get_debts(user_id: Optional[str] = None) -> list[dict]:
    """
    Returns debts with their payments and computed pending_amount.
    user_id=None → all debts (Pareja view).
    """
    q = _sb().table("debts").select(
        "*, debt_payments(*), users(id, name, color, avatar)"
    ).order("created_at", desc=True)

    if user_id:
        # Show debts owned by this user OR shared debts (user_id IS NULL)
        q = q.or_(f"user_id.eq.{user_id},user_id.is.null")

    debts = q.execute().data

    # Compute pending_amount for each debt
    for debt in debts:
        paid = sum(p["amount"] for p in (debt.get("debt_payments") or []))
        debt["pending_amount"] = max(debt["total_amount"] - paid, 0)

    return debts


def get_debt(debt_id: str) -> dict | None:
    res = _sb().table("debts").select("*, debt_payments(*), users(id, name, color, avatar)") \
        .eq("id", debt_id).single().execute()
    if not res.data:
        return None
    debt = res.data
    paid = sum(p["amount"] for p in (debt.get("debt_payments") or []))
    debt["pending_amount"] = max(debt["total_amount"] - paid, 0)
    return debt


def create_debt(
    name:          str,
    total_amount:  int,
    user_id:       Optional[str] = None,
    description:   Optional[str] = None,
    color:         str = "#dc2626",
    due_date:      Optional[str] = None,
    interest_rate: Optional[float] = None,
) -> dict:
    res = _sb().table("debts").insert({
        "name":          name,
        "total_amount":  total_amount,
        "user_id":       user_id,
        "description":   description,
        "color":         color,
        "due_date":      due_date,
        "interest_rate": interest_rate,
    }).execute()
    return res.data[0]


def update_debt(debt_id: str, **fields) -> dict:
    res = _sb().table("debts").update(fields).eq("id", debt_id).execute()
    return res.data[0]


def delete_debt(debt_id: str) -> None:
    _sb().table("debts").delete().eq("id", debt_id).execute()


# ── Debt payments ─────────────────────────────────────────────────────────────

def create_debt_payment(
    debt_id:     str,
    amount:      int,
    date:        str,
    paid_by:     Optional[str] = None,
    description: Optional[str] = None,
    notes:       Optional[str] = None,
) -> dict:
    sb = _sb()
    res = sb.table("debt_payments").insert({
        "debt_id":     debt_id,
        "amount":      amount,
        "date":        date,
        "paid_by":     paid_by,
        "description": description,
        "notes":       notes,
    }).execute()
    payment = res.data[0]

    # Auto-update debt status to 'paid' if fully covered
    debt = get_debt(debt_id)
    if debt and debt["pending_amount"] == 0:
        sb.table("debts").update({"status": "paid"}).eq("id", debt_id).execute()

    return payment


def delete_debt_payment(payment_id: str) -> None:
    sb = _sb()
    # Re-open the debt if it was marked paid
    payment = sb.table("debt_payments").select("debt_id").eq("id", payment_id).single().execute().data
    if payment:
        sb.table("debt_payments").delete().eq("id", payment_id).execute()
        sb.table("debts").update({"status": "active"}).eq("id", payment["debt_id"]).execute()
