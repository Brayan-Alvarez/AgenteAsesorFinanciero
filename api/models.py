"""
models.py — Pydantic request/response models for the FastAPI backend.

Every endpoint in api/routes/ uses these models so that:
  - FastAPI can validate incoming data automatically.
  - OpenAPI docs (at /docs) show the exact shape of each payload.
  - The frontend knows exactly what JSON to send and expect.

Monetary amounts are always COP integers — never floats.
"""

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Chat  (POST /api/chat)
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    """Body sent by the client to start a conversation turn."""

    message: str = Field(
        ...,
        min_length=1,
        description="The user's question or request in natural language.",
        examples=["¿Cómo vamos con el presupuesto este mes?"],
    )


class ChatResponse(BaseModel):
    """Body returned by the agent after processing the user's message."""

    reply: str = Field(
        ...,
        description="The agent's full text response.",
    )


# ---------------------------------------------------------------------------
# Budget  (GET /api/budget)
# ---------------------------------------------------------------------------

class BudgetCategory(BaseModel):
    """Planned vs actual spending for a single budget category."""

    name: str = Field(..., description="Category name (e.g. 'Restaurantes').")
    planned: int = Field(..., description="Annual budgeted amount in COP.")
    actual: int = Field(..., description="Amount spent so far in COP.")
    remaining: int = Field(
        ...,
        description="Unspent budget in COP. Negative means over budget.",
    )
    pct_used: float = Field(
        ...,
        description="Percentage of the budget consumed, rounded to 1 decimal.",
    )


class BudgetResponse(BaseModel):
    """All budget categories for the current year."""

    categories: list[BudgetCategory]


# ---------------------------------------------------------------------------
# Expenses  (GET /api/expenses?month=Marzo&person=Sofi)
# ---------------------------------------------------------------------------

class ExpenseItem(BaseModel):
    """Aggregated spending for a single category in a given month."""

    category: str = Field(..., description="Budget category name.")
    total: int = Field(..., description="Total spent in this category in COP.")


class ExpensesResponse(BaseModel):
    """Aggregated expenses for a month, optionally scoped to one person."""

    month: str = Field(..., description="Spanish month name (e.g. 'Marzo').")
    person: Optional[str] = Field(
        None,
        description="Person name if filtered, null when showing combined expenses.",
    )
    items: list[ExpenseItem] = Field(
        ...,
        description="Categories sorted by total descending.",
    )


# ---------------------------------------------------------------------------
# Monthly trend  (GET /api/trend)
# ---------------------------------------------------------------------------

class MonthTotal(BaseModel):
    """Total spending for a single month."""

    month: str = Field(..., description="Spanish month name (e.g. 'Enero').")
    total: int = Field(..., description="Total spent across all categories in COP.")


class TrendResponse(BaseModel):
    """Month-by-month spending for the current year in calendar order."""

    trend: list[MonthTotal]


# ---------------------------------------------------------------------------
# Individual transactions  (GET /api/transactions)
# ---------------------------------------------------------------------------

class TransactionItem(BaseModel):
    """A single expense or income row from the Google Sheets expense tabs."""

    id: int = Field(..., description="Stable row index (1-based) used as a unique key.")
    fecha: str = Field(..., description="Transaction date in ISO format YYYY-MM-DD.")
    categoria: str = Field(..., description="Category label exactly as written in the sheet.")
    descripcion: str = Field(..., description="Free-text description of the transaction.")
    monto: int = Field(..., description="Amount in COP (always a positive integer).")
    persona: str = Field(..., description="Person name as it appears in the tab header.")
    mes: str = Field(..., description="Spanish month name derived from the tab name.")
    tipo: str = Field(
        ...,
        description="'ingreso' for income rows, 'gasto' for all other expenses.",
    )


class TransactionsResponse(BaseModel):
    """All individual transactions from the expenses sheet."""

    transactions: list[TransactionItem]


# ---------------------------------------------------------------------------
# Personas  (GET /api/personas)
# ---------------------------------------------------------------------------

class PersonaItem(BaseModel):
    """A single user / person tracked in the household."""

    id: str = Field(..., description="URL-safe identifier: lowercase name.")
    nombre: str = Field(..., description="Display name as it appears in the sheet tabs.")


class PersonasResponse(BaseModel):
    """All persons configured via the PERSON_NAMES environment variable."""

    personas: list[PersonaItem]


# ---------------------------------------------------------------------------
# Supabase — Categories
# ---------------------------------------------------------------------------

class SubcategoryOut(BaseModel):
    id: str
    category_id: str
    name: str
    icon: str = "📦"
    sort_order: int
    is_active: bool = True

class CategoryOut(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    type: str
    sort_order: int
    is_active: bool = True
    subcategories: list[SubcategoryOut] = []

class CategoryCreate(BaseModel):
    name: str
    icon: str = "📦"
    color: str = "#94a3b8"
    type: str = "variable"
    sort_order: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    type: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

class SubcategoryCreate(BaseModel):
    name: str
    icon: str = "📦"
    sort_order: int = 0

class SubcategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Supabase — Budget
# ---------------------------------------------------------------------------

class BudgetOut(BaseModel):
    id: str
    category_id: str
    user_id: str
    year: int
    month: int
    amount: int
    categories: Optional[dict] = None   # joined category info

class BudgetUpsert(BaseModel):
    category_id: str
    user_id: str
    year: int
    month: int
    amount: int
    reason: Optional[str] = None

class BudgetHistoryOut(BaseModel):
    id: str
    category_id: Optional[str]
    user_id: Optional[str]
    year: int
    month: int
    old_amount: Optional[int]
    new_amount: int
    reason: Optional[str]
    changed_at: str


# ---------------------------------------------------------------------------
# Supabase — Transactions (Supabase-backed)
# ---------------------------------------------------------------------------

class TransactionCreate(BaseModel):
    user_id: str
    date: str
    category_id: str
    description: str
    amount: int
    type: str                           # 'income' | 'expense'
    subcategory_id: Optional[str] = None
    notes: Optional[str] = None
    debt_id: Optional[str] = None       # set when this transaction is a debt payment

class TransactionUpdate(BaseModel):
    user_id: Optional[str] = None
    date: Optional[str] = None
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[int] = None
    type: Optional[str] = None
    notes: Optional[str] = None
    debt_id: Optional[str] = None

class CategoryMigrationRequest(BaseModel):
    """Bulk-reassign all transactions from one category to another."""
    from_category_id: str
    to_category_id: str
    to_subcategory_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Supabase — Debts
# ---------------------------------------------------------------------------

class DebtOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    total_amount: int
    pending_amount: int          # computed: total - historical_capital - sum(capital of payments)
    total_capital_paid: int = 0  # historical + tracked capital payments
    total_interest_paid: int = 0 # historical + tracked interest payments
    total_paid: int = 0          # total money out of pocket (capital + interest)
    user_id: Optional[str]
    color: str
    status: str
    due_date: Optional[str]
    # Auto-pay configuration
    installment_amount: Optional[int] = None
    installment_amount_2: Optional[int] = None  # amount for the second payment day
    annual_rate: Optional[float] = None   # annual effective rate (EA %)
    payment_day: Optional[int] = None
    payment_day_2: Optional[int] = None   # second payment day (bi-weekly / quincenal)
    auto_pay: bool = False
    # Historical data (payments made before tracking started)
    historical_capital_paid: int = 0
    historical_interest_paid: int = 0
    # Category link: subcategory under "Finanzas y deudas" for transactions
    subcategory_id: Optional[str] = None
    created_at: str
    debt_payments: list[dict] = []
    users: Optional[dict] = None

class DebtCreate(BaseModel):
    name: str
    total_amount: int
    user_id: Optional[str] = None
    description: Optional[str] = None
    color: str = "#dc2626"
    due_date: Optional[str] = None
    # Auto-pay
    installment_amount: Optional[int] = None
    installment_amount_2: Optional[int] = None
    annual_rate: Optional[float] = None
    payment_day: Optional[int] = None
    payment_day_2: Optional[int] = None
    auto_pay: bool = False
    # Historical payments before tracking
    historical_capital_paid: int = 0
    historical_interest_paid: int = 0

class DebtUpdate(BaseModel):
    name: Optional[str] = None
    total_amount: Optional[int] = None
    user_id: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    installment_amount: Optional[int] = None
    installment_amount_2: Optional[int] = None
    annual_rate: Optional[float] = None
    payment_day: Optional[int] = None
    payment_day_2: Optional[int] = None
    auto_pay: Optional[bool] = None
    historical_capital_paid: Optional[int] = None
    historical_interest_paid: Optional[int] = None

class DebtPaymentCreate(BaseModel):
    amount: int
    date: str
    paid_by: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    # Optional capital/interest split for manual extra payments
    capital_amount: Optional[int] = None
    interest_amount: Optional[int] = None


# ---------------------------------------------------------------------------
# Supabase — Subscriptions
# ---------------------------------------------------------------------------

class SubscriptionCreate(BaseModel):
    name: str
    amount: int
    billing_day: int = 1
    icon: str = "🔄"
    color: str = "#6366f1"
    # If category_id is None the backend auto-assigns the "Suscripciones" category.
    # Pass a real category_id to charge a specific category (e.g. "Carro propio").
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    user_id: Optional[str] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None

class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[int] = None
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    user_id: Optional[str] = None
    billing_day: Optional[int] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Income + Income History
# ---------------------------------------------------------------------------

class IncomeOut(BaseModel):
    id: str
    user_id: str
    year: int
    month: int
    amount: int
    notes: Optional[str] = None
    users: Optional[dict] = None          # joined user info

class IncomeUpsert(BaseModel):
    user_id: str
    year: int
    month: int
    amount: int
    notes: Optional[str] = None

class IncomeHistoryOut(BaseModel):
    id: str
    income_id: Optional[str]
    user_id: Optional[str]
    year: int
    month: int
    old_amount: Optional[int]
    new_amount: int
    notes: Optional[str]
    changed_at: str
