# AgenteAsesorFinanciero — Project Context for Claude Code

## Project Overview
A personal AI financial advisor agent for a couple. Reads budget and expense data
from Supabase and answers natural language questions like:
- "How are we doing with groceries this month?"
- "Could I buy a $2.8M COP monitor? How would it impact our finances?"
- "What are our biggest spending categories this year?"

This is a **learning project** — prioritize readable, well-commented code over
premature optimization. Explain non-obvious decisions in comments.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent engine | LangGraph (StateGraph) |
| LLM (local dev) | Ollama — `llama3.2` or `mistral` |
| LLM (cloud/prod) | Google Gemini Flash via `langchain-google-genai` |
| LLM abstraction | `agent/llm_factory.py` — switch via `LLM_PROVIDER` env var |
| Database | Supabase (PostgreSQL) |
| Data processing | `pandas` DataFrames |
| Backend API | FastAPI + uvicorn |
| Frontend | React (Vite) + Recharts |
| HTTP client | axios (frontend → FastAPI) |
| Python version | 3.12+ |
| Package manager | pip + `requirements.txt` (Python) · npm (React) |

---

## Repository Structure

```
AgenteAsesorFinanciero/
├── data/
│   ├── sheets_loader.py        # Legacy — used only for one-time migration ✓
│   ├── data_processor.py       # Builds summaries by category, month, person ✓
│   ├── cache.py                # TTL cache ✓
│   └── migrate_to_supabase.py  # One-time migration script (Phase 7)
├── agent/
│   ├── graph.py                # LangGraph StateGraph ✓
│   ├── tools.py                # Agent tools ✓
│   ├── llm_factory.py          # Ollama ↔ Gemini switch ✓
│   └── prompts.py              # System prompts ✓
├── api/
│   ├── main.py                 # FastAPI entry point ✓
│   ├── models.py               # Pydantic models ✓
│   └── routes/
│       ├── chat.py             # POST /api/chat ✓
│       ├── dashboard.py        # GET /api/budget, /api/expenses, /api/trend ✓
│       └── transactions.py     # CRUD /api/transactions (Phase 6)
├── db/
│   ├── client.py               # Supabase Python client (Phase 7)
│   ├── queries.py              # All DB queries centralized (Phase 7)
│   └── schema.sql              # Table definitions (Phase 7)
├── frontend/
│   ├── src/
│   │   ├── pages/              # Dashboard, Chat, Transactions, Budget ✓
│   │   ├── components/         # Avatar, UserToggle, MonthNav, CatChip, Modal, TxnForm, DonutChart, TrendBarChart ✓
│   │   ├── context/            # AppContext global state ✓
│   │   ├── data/
│   │   │   ├── categories.js   # 15 categories + subcategories (update in Phase 6)
│   │   │   └── seed.js         # Budget seed — replaced in Phase 7
│   │   └── api/
│   │       └── client.js       # All axios calls to FastAPI ✓
│   ├── package.json
│   └── .env.example
├── tests/
│   ├── test_loader.py          # ✓
│   └── test_tools.py
├── credentials/                # gitignored — never commit
├── .env.example
├── .gitignore
├── requirements.txt
├── CLAUDE.md
└── README.md
```

---

## Category System

15 top-level categories, each with subcategories.
**Single source of truth: `frontend/src/data/categories.js` — DB schema mirrors it exactly.**

| # | Category | Type | Key subcategories |
|---|---|---|---|
| 1 | Vivienda | fixed | Arriendo, Servicios públicos, Administración, Internet y TV, Mantenimiento y reparaciones, Artículos del hogar |
| 2 | Alimentación | variable | Mercado / supermercado, Tienda y mini-mercado, Frutas y verduras, Carnicería / pescadería, Panadería |
| 3 | Restaurantes y salidas | variable | Restaurantes, Domicilios (Rappi / iFood), Cafés y snacks, Bares y vida nocturna |
| 4 | Transporte | variable | SITP / Transmilenio, Uber / taxi / InDriver, Parqueadero |
| 5 | Carro propio | fixed | Gasolina, Seguro del vehículo, Revisión técnico-mecánica, Mantenimiento y reparaciones, Multas y trámites |
| 6 | Salud | variable | Medicina prepagada / EPS, Medicamentos, Consultas médicas, Dentista, Óptica, Gimnasio y deporte |
| 7 | Educación | fixed | Matrículas y pensiones, Cursos y certificaciones, Libros y materiales, Suscripciones de aprendizaje |
| 8 | Entretenimiento | variable | Streaming (Netflix / Spotify / etc.), Videojuegos, Cine y eventos, Viajes y hospedaje, Hobbies |
| 9 | Ropa y cuidado personal | variable | Ropa y calzado, Peluquería y estética, Productos de higiene, Accesorios |
| 10 | Tecnología | variable | Dispositivos y accesorios, Software y apps, Suscripciones tech |
| 11 | Mascotas | variable | Comida, Veterinario, Accesorios y juguetes, Peluquería |
| 12 | Finanzas y deudas | fixed | Tarjeta de crédito, Créditos y cuotas, Seguros, Impuestos |
| 13 | Ahorro e inversión | fixed | Ahorro de emergencia, Inversiones (CDT / fondos / acciones), Fondo de viaje, Fondo de proyectos |
| 14 | Regalos y donaciones | variable | Regalos familiares, Regalos de pareja, Donaciones |
| 15 | Gastos varios | variable | Cualquier gasto que no clasifica en otra categoría |

**Rules:**
- Every transaction MUST have a category. Subcategory is optional.
- Category and subcategory names are stored in Spanish, exact match.
- `categories.js` is the single source of truth — DB schema and agent tools mirror it.
- Transporte = public transport / rideshares. Carro propio = everything related to owning a car.

---

## Database Schema (Supabase / PostgreSQL)

```sql
-- db/schema.sql

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  type text CHECK (type IN ('fixed', 'variable')) NOT NULL,
  color text NOT NULL
);

CREATE TABLE subcategories (
  id serial PRIMARY KEY,
  category_id int REFERENCES categories(id),
  name text NOT NULL
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  date date NOT NULL,
  category_id int REFERENCES categories(id),
  subcategory_id int REFERENCES subcategories(id),
  description text,
  amount int NOT NULL,  -- COP integer, always positive
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE budget (
  id serial PRIMARY KEY,
  category_id int REFERENCES categories(id),
  month int CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL,
  amount int NOT NULL,  -- planned COP amount for that category/month
  UNIQUE (category_id, month, year)
);
```

---

## Environment Variables

All secrets live in `.env` (local) or each platform's secrets dashboard (production).
**Never hardcode any of these values.**

```bash
# .env.example

# LLM provider: "ollama" for local dev, "gemini" for cloud
LLM_PROVIDER=ollama

# Ollama (local only)
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434

# Gemini (cloud/prod)
GEMINI_API_KEY=your_gemini_api_key_here

# Google Sheets — legacy, used only for one-time migration
BUDGET_SHEET_ID=your_google_sheet_id_here
EXPENSES_SHEET_ID=your_google_sheet_id_here
GOOGLE_CREDENTIALS_PATH=credentials/service_account.json

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here

# App
PERSON_NAMES=Name1,Name2
CURRENCY=COP

# FastAPI
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:5173   # update in production
```

---

## LLM Factory Pattern

The entire codebase must use `get_llm()` from `agent/llm_factory.py`.
**Never instantiate an LLM directly in any other file.**

```python
# agent/llm_factory.py — reference implementation
import os
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI

def get_llm():
    provider = os.getenv("LLM_PROVIDER", "ollama")

    if provider == "ollama":
        return ChatOllama(
            model=os.getenv("OLLAMA_MODEL", "llama3.2"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=os.getenv("GEMINI_API_KEY"),
        )
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: '{provider}'. Use 'ollama' or 'gemini'.")
```

---

## Agent Tools (LangGraph)

Implemented in `agent/tools.py`. Do not modify without updating tests.

| Tool | Input | Output | Description |
|---|---|---|---|
| `get_budget_summary` | none | dict by category | Planned vs actual spend for current year |
| `get_expenses` | `month`, `person?` | DataFrame summary | Filtered and aggregated expenses |
| `get_monthly_trend` | none | list of monthly totals | Month-by-month spending evolution |
| `simulate_purchase` | `amount`, `category` | impact analysis | Can we afford X? Effect on remaining budget |

All tools must handle missing data gracefully — return empty results, never raise exceptions.

---

## LangGraph State

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    financial_context: dict   # Loaded once per session
    current_month: str        # e.g. "Enero"
    current_year: int
```

---

## Financial Advisor Persona

- Always answer in the same language the user writes in (Spanish or English)
- Express amounts in COP with thousands separator: `$2.800.000`
- When simulating a purchase, show remaining budget per category after the expense
- Be encouraging but honest — don't sugarcoat overspending
- Never invent data — if information is missing, say so clearly

---

## API Endpoints

### Implemented ✓
```
POST /api/chat                              → LangGraph agent
GET  /api/budget                            → budget summary by category
GET  /api/expenses?month=&person=           → filtered expenses
GET  /api/trend                             → monthly totals
GET  /api/personas                          → list of users
```

### To implement (Phase 6)
```
GET    /api/transactions?month=&year=&user_id=&category=
POST   /api/transactions
PUT    /api/transactions/{id}
DELETE /api/transactions/{id}
GET    /api/budget/monthly
PUT    /api/budget
```

---

## Coding Conventions

- **Language:** English for all code (variables, functions, classes, file names)
- **Comments:** English — add them generously (learning project)
- **Type hints:** Required on all Python function signatures
- **Error handling:** Specific exceptions only, never bare `except:`
- **Secrets:** Always from `os.getenv()`, never hardcoded
- **Category names:** Spanish, exact match to DB — never translate them
- **Money:** Always COP integers — never use floats for monetary values
- **PEP 8:** Max line length 100 chars (Python)
- **ESLint defaults** for React

---

## Development Phases

### Phase 1 — Data layer ✅ COMPLETE
- [x] sheets_loader.py — reads budget and expenses from Google Sheets
- [x] data_processor.py — summaries by category, month, person
- [x] cache.py — TTL cache
- [x] tests/test_loader.py — unit tests with mocks

### Phase 2 — LangGraph Agent ✅ COMPLETE
- [x] llm_factory.py — Ollama ↔ Gemini switch
- [x] tools.py — 4 agent tools
- [x] prompts.py — financial advisor system prompt
- [x] graph.py — StateGraph with ReAct loop
- [x] Conversational responses verified with real Sheets data

### Phase 3 — FastAPI Backend ✅ COMPLETE
- [x] api/main.py — FastAPI app with CORS
- [x] api/models.py — Pydantic models
- [x] api/routes/chat.py — POST /api/chat
- [x] api/routes/dashboard.py — dashboard endpoints

### Phase 4 — React Frontend ✅ COMPLETE
- [x] Vite + React bootstrap
- [x] Design system — dark mode, DM Sans + DM Mono, indigo/violet palette
- [x] App shell — sidebar 240px (desktop) + bottom nav with FAB (mobile), React Router v7
- [x] AppContext — global state, persists across route changes
- [x] categories.js — 15 categories with icon/color/subcategories
- [x] seed.js — budget seed + filterTxns helper
- [x] Shared components: Avatar, UserToggle, MonthNav, CatChip, Modal, TxnForm, DonutChart, TrendBarChart
- [x] Dashboard — KPIs, budget bar, donut, AI insights, 6-month trend, categories vs budget
- [x] Transactions — grouped by day, search + filter, CRUD in-memory
- [x] Budget — editable grid category × month + 12-card monthly view
- [x] Recommendations — deterministic AI rules (overspend, projection, savings rate, etc.)
- [x] Chat — connected to /api/chat

### Phase 5 — Deploy ← CURRENT
- [ ] Deploy FastAPI to Railway or Render (free tier)
- [ ] Deploy React to Vercel (free tier)
- [ ] Set all env vars in each platform's dashboard
- [ ] Update CORS with production frontend URL
- [ ] Add basic auth — shared password via env var, checked in FastAPI middleware
- [ ] Smoke test: open production URL, send a chat message, verify charts load

### Phase 6 — Transactions & Budget API (CRUD)
*Complete Phase 5 first. Deploy with current Sheets data, then add write endpoints.*
- [ ] api/routes/transactions.py — GET/POST/PUT/DELETE /api/transactions
- [ ] api/routes/dashboard.py — add GET/PUT /api/budget/monthly
- [ ] api/models.py — add TransactionCreate, TransactionUpdate, BudgetUpdate
- [ ] frontend/src/api/client.js — add createTransaction, updateTransaction, deleteTransaction, updateBudget
- [ ] Connect TxnForm (add/edit/delete) to real API — remove in-memory CRUD
- [ ] Connect Budget grid to real API — remove seed data
- [ ] Update AppContext to use new endpoints

### Phase 7 — Supabase Migration
*Complete Phase 6 first (full CRUD working with Sheets), then swap the data layer.*
- [ ] Create Supabase project at supabase.com (free tier)
- [ ] Run db/schema.sql in Supabase SQL editor
- [ ] Seed categories (15) and subcategories from categories.js into DB
- [ ] Add `supabase-py` to requirements.txt
- [ ] Create db/client.py — Supabase Python client singleton
- [ ] Create db/queries.py — all DB queries centralized (get_transactions, create_transaction, etc.)
- [ ] Write data/migrate_to_supabase.py — one-time script: read Sheets → insert into DB
- [ ] Run migration, verify row counts match Sheets exactly
- [ ] Update api/routes/ to use db/queries.py instead of sheets_loader + data_processor
- [ ] Update agent/tools.py to query DB instead of Sheets
- [ ] Remove BUDGET_SHEET_ID and EXPENSES_SHEET_ID from active .env (keep in .env.example for reference)
- [ ] Remove seed.js budget — AppContext loads budget from DB
- [ ] End-to-end test: add transaction in frontend → verify in Supabase dashboard → verify agent sees it

---

## How to Run Locally

```bash
# 1. Clone and enter the project
git clone https://github.com/YOUR_USERNAME/AgenteAsesorFinanciero.git
cd AgenteAsesorFinanciero

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your actual values

# 5. Make sure Ollama is running
ollama run llama3.2

# 6. Start the backend
uvicorn api.main:app --reload --port 8000
# Docs available at http://localhost:8000/docs

# 7. Start the frontend (new terminal)
cd frontend && npm run dev
# App available at http://localhost:5173
```

---

## Important Constraints

- `credentials/` must be in `.gitignore` — never commit service account keys
- Sheet IDs and API keys must never appear in code or commit history
- Supabase anon key is safe in frontend (Supabase RLS handles security)
- Supabase service role key must NEVER go to frontend — backend only
- All monetary amounts: COP integers — never use floats for money
- CORS must be strict — only allow `FRONTEND_URL` in production, never `*`
- The agent loads financial context once per session via the cache layer