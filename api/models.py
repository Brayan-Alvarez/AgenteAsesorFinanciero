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
