"""
tools.py — LangGraph/LangChain tools that give the agent access to financial data.

Data source: Supabase (via db/queries.py).
All tools catch exceptions and return a descriptive error string so a single
failure never crashes the agent graph.

Tool inventory:
  get_budget_summary          — Planned vs actual by category (current or given month)
  get_expenses                — Aggregated spend by category for a month/person
  get_monthly_trend           — Month-by-month totals for the current year
  simulate_purchase           — Impact of a hypothetical one-time expense
  get_debt_summary            — All debts: balance, interest paid, rate, installment
  simulate_debt_extra_payment — How much interest/months saved by a capital payment
  get_income_summary          — Declared income per person for a given month
  get_subscriptions_summary   — Active recurring subscriptions and their totals
  get_spending_behavior       — Per-category spending trend over recent months
  get_financial_overview      — Comprehensive household snapshot (income, budget,
                                debts, subscriptions, expenses) in one call
"""

import logging
import math
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from langchain_core.tools import tool

import db.queries as q

load_dotenv()

logger = logging.getLogger(__name__)

SPANISH_MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _current_year() -> int:
    return date.today().year


def _current_month() -> int:
    return date.today().month


def _month_number(month_name: str) -> Optional[int]:
    try:
        return SPANISH_MONTHS.index(month_name.strip().capitalize()) + 1
    except ValueError:
        return None


def _get_categories() -> dict[str, dict]:
    raw = q.get_categories()
    return {c["id"]: c for c in raw}


def _fmt(amount: int) -> str:
    """Format COP integer as $X.XXX.XXX string."""
    return f"${amount:,.0f}".replace(",", ".")


# ──────────────────────────────────────────────────────────────────────────────
# BUDGET
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_budget_summary(month: Optional[int] = None) -> dict:
    """
    Return planned vs actual spending for every budget category.

    Use this tool when the user asks:
    - "¿Cómo vamos con el presupuesto?"
    - "¿En qué categorías estamos sobrepasando?"
    - "¿Cuánto me queda en [categoría] este mes?"
    - "How much have we spent in total this month?"

    Args:
        month: Month number 1-12. Defaults to current month.

    Returns a dict keyed by category name. Each value contains:
        planned (int):    Budgeted COP for the month (all users combined).
        actual (int):     Amount spent so far in COP.
        remaining (int):  planned − actual (negative = over budget).
        pct_used (float): Percentage of budget consumed.
    """
    try:
        year  = _current_year()
        month = month or _current_month()

        budget_rows = q.get_budget(year, month)
        txn_rows    = q.get_transactions(year=year, month=month)
        categories  = _get_categories()

        planned: dict[str, int] = {}
        for row in budget_rows:
            cat_name = (row.get("categories") or {}).get("name") or categories.get(row["category_id"], {}).get("name", "?")
            planned[cat_name] = planned.get(cat_name, 0) + row["amount"]

        actual: dict[str, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = (txn.get("categories") or {}).get("name") or categories.get(txn.get("category_id", ""), {}).get("name", "?")
            actual[cat_name] = actual.get(cat_name, 0) + txn["amount"]

        all_cats = set(planned) | set(actual)
        result = {}
        for cat in sorted(all_cats):
            p = planned.get(cat, 0)
            a = actual.get(cat, 0)
            result[cat] = {
                "planned":   p,
                "actual":    a,
                "remaining": p - a,
                "pct_used":  round((a / p * 100), 1) if p > 0 else 0.0,
            }
        return result

    except Exception as exc:
        logger.exception("get_budget_summary failed.")
        return f"Error loading budget summary: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# EXPENSES
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_expenses(month: str, person: Optional[str] = None) -> list[dict]:
    """
    Return aggregated expenses by category for a given month.

    Use this tool when the user asks:
    - "¿Cuánto gastamos en enero?"
    - "Muéstrame los gastos de Sofi en marzo."
    - "¿En qué gastamos más el mes pasado?"
    - "What were our biggest spending categories?"

    Args:
        month:  Spanish month name, capitalized (e.g. "Enero", "Febrero").
        person: Optional person name (e.g. "Sofi", "Belmont"). Omit for combined.

    Returns a list sorted descending by amount:
        [{"category": "Restaurantes", "total": 706869}, ...]
    """
    try:
        month_num = _month_number(month)
        if month_num is None:
            return f"Unrecognized month: '{month}'. Use Spanish names like 'Enero'."

        year  = _current_year()
        users = q.get_users()

        user_id = None
        if person:
            matched = [u for u in users if u["name"].lower() == person.lower()]
            if not matched:
                return f"Person '{person}' not found. Available: {[u['name'] for u in users]}"
            user_id = matched[0]["id"]

        txn_rows = q.get_transactions(user_id=user_id, year=year, month=month_num)
        cats     = _get_categories()

        totals: dict[str, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = (txn.get("categories") or {}).get("name") or cats.get(txn.get("category_id", ""), {}).get("name", "?")
            totals[cat_name] = totals.get(cat_name, 0) + txn["amount"]

        return sorted(
            [{"category": k, "total": v} for k, v in totals.items()],
            key=lambda x: x["total"],
            reverse=True,
        )

    except Exception as exc:
        logger.exception("get_expenses failed.")
        return f"Error loading expenses for month='{month}', person='{person}': {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# TREND
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_monthly_trend() -> list[dict]:
    """
    Return total spending per month in chronological order for the current year.

    Use this tool when the user asks:
    - "¿Cómo ha evolucionado nuestro gasto este año?"
    - "¿En qué mes gastamos más?"
    - "Show me our monthly spending trend."

    Returns:
        [{"month": "Enero", "total": 1800000}, ...]
    """
    try:
        year     = _current_year()
        txn_rows = q.get_transactions(year=year)

        totals: dict[int, int] = {}
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            month_num = int(txn["date"][5:7])
            totals[month_num] = totals.get(month_num, 0) + txn["amount"]

        return [
            {"month": SPANISH_MONTHS[m - 1], "total": totals[m]}
            for m in sorted(totals)
        ]

    except Exception as exc:
        logger.exception("get_monthly_trend failed.")
        return f"Error loading monthly trend: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# PURCHASE SIMULATION
# ──────────────────────────────────────────────────────────────────────────────

@tool
def simulate_purchase(amount: int, category: str) -> dict:
    """
    Simulate the financial impact of a hypothetical one-time purchase.

    Use this tool when the user asks:
    - "¿Puedo comprar un monitor de $2.800.000?"
    - "¿Qué pasaría si gasto $500.000 en ropa?"
    - "Would buying a new phone break our budget?"

    Args:
        amount:   Purchase price in COP (e.g. 2800000).
        category: Budget category name in Spanish (e.g. "Tecnología").

    Returns:
        can_afford (bool), remaining_before, remaining_after, budget_pct_after, warning.
    """
    try:
        year  = _current_year()
        month = _current_month()

        budget_rows = q.get_budget(year, month)
        txn_rows    = q.get_transactions(year=year, month=month)
        cats        = _get_categories()

        cat_lower = category.lower()
        planned = 0
        for row in budget_rows:
            cat_name = (row.get("categories") or {}).get("name") or cats.get(row["category_id"], {}).get("name", "")
            if cat_name.lower() == cat_lower:
                planned += row["amount"]

        actual = 0
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = (txn.get("categories") or {}).get("name") or cats.get(txn.get("category_id", ""), {}).get("name", "")
            if cat_name.lower() == cat_lower:
                actual += txn["amount"]

        remaining       = planned - actual
        remaining_after = remaining - amount
        pct_after       = round(((actual + amount) / planned * 100), 1) if planned > 0 else 0.0

        warning = None
        if planned == 0:
            warning = f"No budget defined for '{category}' this month."
        elif remaining_after < 0:
            warning = f"Purchase exceeds the {category} budget by {_fmt(abs(remaining_after))}."
        elif pct_after > 85:
            warning = f"Purchase would consume {pct_after}% of the {category} budget."

        return {
            "can_afford":       remaining_after >= 0,
            "remaining_before": remaining,
            "remaining_after":  remaining_after,
            "budget_pct_after": pct_after,
            "warning":          warning,
        }

    except Exception as exc:
        logger.exception("simulate_purchase failed.")
        return f"Error simulating purchase: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# DEBTS
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_debt_summary() -> list[dict]:
    """
    Return a detailed summary of all active and paid debts.

    Use this tool when the user asks:
    - "¿Cuánto debemos en total?"
    - "¿Cuál es el saldo del Icetex?"
    - "¿Cuánto hemos pagado en intereses de la tarjeta?"
    - "Show me all our debts."

    Returns a list, one dict per debt:
        name, total_amount, pending_amount, total_capital_paid,
        total_interest_paid, total_paid, annual_rate, installment_amount,
        payment_day, payment_day_2, status, owner.
    """
    try:
        debts  = q.get_debts()
        result = []
        for d in debts:
            result.append({
                "name":                 d["name"],
                "description":          d.get("description"),
                "total_amount":         d["total_amount"],
                "pending_amount":       d["pending_amount"],
                "total_capital_paid":   d.get("total_capital_paid", 0),
                "total_interest_paid":  d.get("total_interest_paid", 0),
                "total_paid":           d.get("total_paid", 0),
                "annual_rate":          d.get("annual_rate"),        # EA % or null
                "installment_amount":   d.get("installment_amount"), # per-payment COP
                "payment_day":          d.get("payment_day"),
                "payment_day_2":        d.get("payment_day_2"),      # second payment day if bi-weekly
                "auto_pay":             d.get("auto_pay", False),
                "status":               d["status"],
                "owner":                (d.get("users") or {}).get("name") or "Compartida",
            })
        return result

    except Exception as exc:
        logger.exception("get_debt_summary failed.")
        return f"Error loading debts: {exc}"


@tool
def simulate_debt_extra_payment(debt_name: str, extra_capital: int) -> dict:
    """
    Simulate the effect of making an extra capital-only payment on a debt.
    Shows how many months and how much interest the user would save.

    Use this tool when the user asks:
    - "¿Cuánto me ahorraría si al Icetex le pago 10 millones a capital?"
    - "Si hago un abono extra de $5M, ¿cuántos meses me ahorro?"
    - "¿Cuánto en intereses me ahorro abonando capital?"
    - "Si pago toda la deuda hoy, ¿cuánto me ahorro?"

    Args:
        debt_name:     Name (or partial name) of the debt (case-insensitive match).
        extra_capital: Extra capital amount in COP (plain integer, e.g. 10000000).

    Returns:
        debt_name, current_balance, new_balance,
        months_remaining, months_after, months_saved,
        interest_remaining, interest_after, interest_saved,
        has_rate (bool — whether an interest rate is configured),
        note (explanation of the calculation).
    """
    try:
        debts = q.get_debts()

        # Case-insensitive partial name match
        debt_lower = debt_name.strip().lower()
        matched = [d for d in debts if debt_lower in d["name"].lower()]
        if not matched:
            available = [d["name"] for d in debts]
            return f"No debt found matching '{debt_name}'. Available debts: {available}"

        debt = matched[0]  # Use the first match
        balance     = debt["pending_amount"]
        installment = debt.get("installment_amount") or 0
        annual_rate = debt.get("annual_rate") or 0

        if extra_capital <= 0:
            return "extra_capital must be a positive number."

        if extra_capital >= balance:
            return {
                "debt_name":          debt["name"],
                "current_balance":    balance,
                "new_balance":        0,
                "months_remaining":   math.ceil(balance / installment) if installment > 0 else "unknown",
                "months_after":       0,
                "months_saved":       math.ceil(balance / installment) if installment > 0 else "all",
                "interest_remaining": 0,
                "interest_after":     0,
                "interest_saved":     0,
                "has_rate":           annual_rate > 0,
                "note":               (
                    f"The payment of {_fmt(extra_capital)} covers or exceeds the full "
                    f"balance of {_fmt(balance)}. The debt would be fully paid off immediately."
                ),
            }

        new_balance = balance - extra_capital

        if annual_rate > 0 and installment > 0:
            # French amortization: n = -log(1 − B·m/C) / log(1+m)
            m = (1 + annual_rate / 100) ** (1 / 12) - 1

            def remaining_months(b: float) -> float:
                if b <= 0:
                    return 0
                ratio = m * b / installment
                if ratio >= 1:
                    # Installment too small to cover interest — debt never paid
                    return float("inf")
                return -math.log(1 - ratio) / math.log(1 + m)

            n_current = remaining_months(balance)
            n_after   = remaining_months(new_balance)

            if n_current == float("inf"):
                return {
                    "debt_name":        debt["name"],
                    "current_balance":  balance,
                    "note":             (
                        f"The current installment ({_fmt(installment)}) is too small to cover "
                        f"monthly interest at {annual_rate}% EA. The debt grows instead of shrinking. "
                        "Consider increasing the installment amount."
                    ),
                }

            n_curr_ceil   = math.ceil(n_current)
            n_after_ceil  = math.ceil(n_after)
            months_saved  = max(n_curr_ceil - n_after_ceil, 0)

            # Total interest remaining = total future payments − remaining principal
            interest_remaining = max(round(n_current * installment - balance), 0)
            interest_after     = max(round(n_after   * installment - new_balance), 0)
            interest_saved     = max(interest_remaining - interest_after, 0)

            note = (
                f"Amortización francesa: cuota fija {_fmt(installment)} · "
                f"tasa {annual_rate}% EA ({round(m * 100, 4)}% mensual efectiva)."
            )

        elif installment > 0:
            # Interest-free debt (loan from family, etc.)
            n_curr_ceil  = math.ceil(balance     / installment)
            n_after_ceil = math.ceil(new_balance  / installment)
            months_saved = max(n_curr_ceil - n_after_ceil, 0)
            interest_remaining = 0
            interest_after     = 0
            interest_saved     = 0
            note = f"Deuda sin intereses. Cuota: {_fmt(installment)}."

        else:
            # No installment configured — can still report balance change
            return {
                "debt_name":       debt["name"],
                "current_balance": balance,
                "new_balance":     new_balance,
                "has_rate":        annual_rate > 0,
                "note":            (
                    "No installment amount configured for this debt, so remaining "
                    "months cannot be projected. The balance would drop from "
                    f"{_fmt(balance)} to {_fmt(new_balance)}."
                ),
            }

        return {
            "debt_name":          debt["name"],
            "current_balance":    balance,
            "new_balance":        new_balance,
            "extra_capital":      extra_capital,
            "months_remaining":   n_curr_ceil,
            "months_after":       n_after_ceil,
            "months_saved":       months_saved,
            "interest_remaining": interest_remaining,
            "interest_after":     interest_after,
            "interest_saved":     interest_saved,
            "has_rate":           annual_rate > 0,
            "note":               note,
        }

    except Exception as exc:
        logger.exception("simulate_debt_extra_payment failed.")
        return f"Error simulating extra payment on '{debt_name}': {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# INCOME
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_income_summary(month: Optional[int] = None) -> dict:
    """
    Return declared monthly income per person and household total.

    Use this tool when the user asks:
    - "¿Cuánto ganamos este mes?"
    - "¿Cuál es el ingreso de Sofi?"
    - "What is our household income?"
    - "¿Cuánto nos queda libre después del presupuesto?"

    Args:
        month: Month number 1-12. Defaults to current month.

    Returns:
        {
          "by_person": [{"name": "Belmont", "income": 5000000}, ...],
          "total_income": 8000000,
          "total_budget": 7200000,      # sum of all planned budget for the month
          "free_cash":    800000,        # total_income − total_budget
          "savings_rate": 10.0,          # free_cash / total_income × 100
        }
    """
    try:
        year  = _current_year()
        month = month or _current_month()

        income_rows = q.get_income(year, month)
        budget_rows = q.get_budget(year, month)

        by_person = []
        total_income = 0
        for row in income_rows:
            name   = (row.get("users") or {}).get("name") or "?"
            amount = row.get("amount", 0)
            by_person.append({"name": name, "income": amount})
            total_income += amount

        total_budget = sum(r["amount"] for r in budget_rows)
        free_cash    = total_income - total_budget
        savings_rate = round(free_cash / total_income * 100, 1) if total_income > 0 else 0.0

        return {
            "month":        SPANISH_MONTHS[month - 1],
            "by_person":    by_person,
            "total_income": total_income,
            "total_budget": total_budget,
            "free_cash":    free_cash,
            "savings_rate": savings_rate,
        }

    except Exception as exc:
        logger.exception("get_income_summary failed.")
        return f"Error loading income summary: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# SUBSCRIPTIONS
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_subscriptions_summary() -> dict:
    """
    Return all active recurring subscriptions and monthly totals.

    Use this tool when the user asks:
    - "¿Cuáles son nuestras suscripciones activas?"
    - "¿Cuánto pagamos en suscripciones?"
    - "¿Cuánto gasta Belmont en suscripciones?"
    - "What subscriptions do we have?"

    Returns:
        {
          "subscriptions": [{"name": "Netflix", "amount": 49900, "owner": "Pareja",
                              "billing_day": 15, "category": "Suscripciones"}, ...],
          "total_monthly": 250000,
          "by_person": {"Belmont": 120000, "Sofi": 80000, "Pareja": 50000},
        }
    """
    try:
        subs  = q.get_subscriptions(include_inactive=False)
        users = {u["id"]: u["name"] for u in q.get_users()}
        cats  = _get_categories()

        items = []
        total = 0
        by_person: dict[str, int] = {}

        for s in subs:
            owner    = users.get(s.get("user_id", ""), "Pareja")
            cat_name = cats.get(s.get("category_id", ""), {}).get("name", "Suscripciones")
            items.append({
                "name":        s["name"],
                "amount":      s["amount"],
                "owner":       owner,
                "billing_day": s.get("billing_day"),
                "category":    cat_name,
                "icon":        s.get("icon", "🔄"),
            })
            total += s["amount"]
            by_person[owner] = by_person.get(owner, 0) + s["amount"]

        return {
            "subscriptions": sorted(items, key=lambda x: x["amount"], reverse=True),
            "total_monthly": total,
            "by_person":     by_person,
        }

    except Exception as exc:
        logger.exception("get_subscriptions_summary failed.")
        return f"Error loading subscriptions: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# SPENDING BEHAVIOR
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_spending_behavior(months: int = 3) -> dict:
    """
    Return per-category spending totals over the most recent N months.
    Useful for detecting trends, recurring expenses, and behaviour patterns.

    Use this tool when the user asks:
    - "¿En qué gastamos más habitualmente?"
    - "¿Cuál es nuestro gasto promedio en restaurantes?"
    - "¿Ha subido nuestro gasto en transporte?"
    - "What are our biggest recurring expenses?"

    Args:
        months: How many recent months to analyse (default 3, max 12).

    Returns:
        {
          "period": "last 3 months",
          "by_category": {
            "Restaurantes y salidas": {"total": 1500000, "monthly_avg": 500000, "months_with_data": 3},
            ...
          },
          "top_5": [{"category": "Alimentación", "monthly_avg": 800000}, ...],
          "grand_total": 9500000,
          "monthly_avg_total": 3166666,
        }
    """
    try:
        months  = min(max(months, 1), 12)
        year    = _current_year()
        today   = date.today()
        cats    = _get_categories()

        # Collect the last N months (could span year boundary)
        target_months = []
        m, y = today.month, today.year
        for _ in range(months):
            target_months.append((y, m))
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        target_months.reverse()  # chronological

        # Aggregate spending per category per month
        cat_totals: dict[str, list[int]] = {}  # cat_name → [monthly totals]
        for (yr, mo) in target_months:
            txns    = q.get_transactions(year=yr, month=mo)
            monthly: dict[str, int] = {}
            for txn in txns:
                if txn.get("type") != "expense":
                    continue
                cat_name = (txn.get("categories") or {}).get("name") or cats.get(txn.get("category_id", ""), {}).get("name", "?")
                monthly[cat_name] = monthly.get(cat_name, 0) + txn["amount"]
            for cat, amt in monthly.items():
                if cat not in cat_totals:
                    cat_totals[cat] = []
                cat_totals[cat].append(amt)

        # Build per-category summary
        by_category: dict[str, dict] = {}
        grand_total = 0
        for cat, monthly_list in cat_totals.items():
            total         = sum(monthly_list)
            months_data   = len(monthly_list)
            monthly_avg   = round(total / months)   # avg over the full period, not just active months
            grand_total  += total
            by_category[cat] = {
                "total":            total,
                "monthly_avg":      monthly_avg,
                "months_with_data": months_data,
            }

        top_5 = sorted(
            [{"category": k, "monthly_avg": v["monthly_avg"]} for k, v in by_category.items()],
            key=lambda x: x["monthly_avg"],
            reverse=True,
        )[:5]

        return {
            "period":             f"last {months} months",
            "months_analysed":    [f"{SPANISH_MONTHS[mo-1]} {yr}" for yr, mo in target_months],
            "by_category":        dict(sorted(by_category.items(), key=lambda x: x[1]["total"], reverse=True)),
            "top_5":              top_5,
            "grand_total":        grand_total,
            "monthly_avg_total":  round(grand_total / months),
        }

    except Exception as exc:
        logger.exception("get_spending_behavior failed.")
        return f"Error loading spending behavior: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# FINANCIAL OVERVIEW
# ──────────────────────────────────────────────────────────────────────────────

@tool
def get_financial_overview() -> dict:
    """
    Return a comprehensive household financial snapshot in a single call.
    Combines income, budget, current-month expenses, debts, and subscriptions.

    Use this tool when the user asks broad questions like:
    - "¿Cómo estamos financieramente?"
    - "Dame un resumen de nuestras finanzas."
    - "What is our overall financial health?"
    - "¿Cómo vamos este mes en general?"

    Returns a dict with sections:
        income      — Total household income + free cash + savings rate.
        budget      — Total budgeted vs spent this month + over-budget categories.
        debts       — Total debt, total pending, total interest paid across all debts.
        subscriptions — Monthly subscription cost.
        net_position  — Income minus all committed expenses (budget + debt installments + subs).
    """
    try:
        year  = _current_year()
        month = _current_month()

        # Income
        income_rows  = q.get_income(year, month)
        total_income = sum(r.get("amount", 0) for r in income_rows)

        # Budget vs actual
        budget_rows  = q.get_budget(year, month)
        txn_rows     = q.get_transactions(year=year, month=month)
        cats         = _get_categories()

        total_budget = sum(r["amount"] for r in budget_rows)

        actual_by_cat: dict[str, int] = {}
        total_actual = 0
        for txn in txn_rows:
            if txn.get("type") != "expense":
                continue
            cat_name = (txn.get("categories") or {}).get("name") or cats.get(txn.get("category_id", ""), {}).get("name", "?")
            actual_by_cat[cat_name] = actual_by_cat.get(cat_name, 0) + txn["amount"]
            total_actual += txn["amount"]

        over_budget = []
        planned_by_cat: dict[str, int] = {}
        for row in budget_rows:
            cat_name = (row.get("categories") or {}).get("name") or cats.get(row["category_id"], {}).get("name", "?")
            planned_by_cat[cat_name] = planned_by_cat.get(cat_name, 0) + row["amount"]
        for cat, actual in actual_by_cat.items():
            planned = planned_by_cat.get(cat, 0)
            if actual > planned > 0:
                over_budget.append({"category": cat, "over_by": actual - planned})

        # Debts
        debts           = q.get_debts()
        active_debts    = [d for d in debts if d["status"] == "active"]
        total_debt_orig = sum(d["total_amount"]        for d in active_debts)
        total_pending   = sum(d["pending_amount"]      for d in active_debts)
        total_int_paid  = sum(d.get("total_interest_paid", 0) for d in debts)
        monthly_debt_payments = sum(
            (d.get("installment_amount") or 0) * (2 if d.get("payment_day_2") else 1)
            for d in active_debts if d.get("auto_pay")
        )

        # Subscriptions
        subs            = q.get_subscriptions(include_inactive=False)
        total_subs      = sum(s["amount"] for s in subs)

        # Net position: income minus all committed monthly outflows
        committed  = total_budget + monthly_debt_payments + total_subs
        net_free   = total_income - committed
        svgs_rate  = round(net_free / total_income * 100, 1) if total_income > 0 else 0.0

        return {
            "month": SPANISH_MONTHS[month - 1],
            "year":  year,
            "income": {
                "total":        total_income,
                "by_person":    [{"name": (r.get("users") or {}).get("name", "?"), "income": r.get("amount", 0)} for r in income_rows],
            },
            "budget": {
                "total_planned": total_budget,
                "total_spent":   total_actual,
                "remaining":     total_budget - total_actual,
                "pct_used":      round(total_actual / total_budget * 100, 1) if total_budget > 0 else 0.0,
                "over_budget_categories": over_budget,
            },
            "debts": {
                "active_count":          len(active_debts),
                "total_original":        total_debt_orig,
                "total_pending":         total_pending,
                "total_interest_paid_all_time": total_int_paid,
                "monthly_auto_payments": monthly_debt_payments,
            },
            "subscriptions": {
                "count":         len(subs),
                "total_monthly": total_subs,
            },
            "net_position": {
                "total_committed":    committed,
                "free_after_all":     net_free,
                "savings_rate_pct":   svgs_rate,
            },
        }

    except Exception as exc:
        logger.exception("get_financial_overview failed.")
        return f"Error loading financial overview: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# Convenience list — imported by graph.py when binding tools to the LLM.
# ──────────────────────────────────────────────────────────────────────────────
TOOLS = [
    get_budget_summary,
    get_expenses,
    get_monthly_trend,
    simulate_purchase,
    get_debt_summary,
    simulate_debt_extra_payment,
    get_income_summary,
    get_subscriptions_summary,
    get_spending_behavior,
    get_financial_overview,
]
