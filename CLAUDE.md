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

### Phase 5 — Deploy ✅ COMPLETE
- [x] Deploy FastAPI to Railway — https://agenteasesorfinanciero-production.up.railway.app
- [x] Set all backend env vars in Railway dashboard (GOOGLE_CREDENTIALS_JSON, BUDGET_SHEET_ID, EXPENSES_SHEET_ID, PERSON_NAMES, GEMINI_API_KEY, PYTHONPATH, GEMINI_MODEL)
- [x] Smoke tested: /health, /api/personas, /api/transactions, /api/trend, /api/chat all return real data
- [x] railway.toml — startCommand = "uvicorn api.main:app --host 0.0.0.0 --port $PORT"
- [x] sheets_loader.py — supports GOOGLE_CREDENTIALS_JSON env var (production) + file path fallback (local dev)
- [x] Deploy React frontend to Vercel — https://agente-asesor-financiero.vercel.app
- [x] Set VITE_API_URL=https://agenteasesorfinanciero-production.up.railway.app in Vercel dashboard
- [x] Update FRONTEND_URL in Railway with the Vercel URL (for CORS)
- [x] GEMINI_MODEL env var — configurable without code changes (default: gemini-1.5-flash)
- [x] fix: normalize Gemini 2.5+ content blocks to string — ChatResponse now stable with all model versions
- [x] Smoke test full app: charts load from Sheets, chat responds with real financial data

### Phase 6 — Supabase + Sistema de Presupuesto ← CURRENT
*Se elimina la dependencia de Google Sheets para escritura. Supabase es la fuente de verdad
para categorías, presupuesto, deudas y transacciones. Los Sheets siguen usándose solo para
importar el historial inicial de transacciones.*

#### 6A — Base de datos Supabase

**Modelo de datos completo:**

```sql
-- Usuarios del hogar
CREATE TABLE users (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,   -- color HEX del avatar
  avatar text NOT NULL,  -- inicial del nombre
  created_at timestamptz DEFAULT now()
);

-- Categorías (definidas por el usuario, no hardcodeadas)
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  icon       text NOT NULL DEFAULT '📦',
  color      text NOT NULL DEFAULT '#94a3b8',
  type       text CHECK (type IN ('fixed', 'variable')) NOT NULL DEFAULT 'variable',
  sort_order int  DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Subcategorías por categoría
CREATE TABLE subcategories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Presupuesto mensual por categoría y por usuario
-- Cada usuario define su propio monto para cada categoría.
-- Una categoría puede tener presupuesto solo para Belmont, solo para Sofi, o para ambos.
-- Ejemplo: Belmont → Restaurantes $800k | Sofi → Restaurantes $200k
-- Vista Pareja: muestra $1M total (80% Belmont, 20% Sofi) — derivado automáticamente.
CREATE TABLE budget (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id),   -- a quién pertenece este presupuesto
  year        int  NOT NULL,
  month       int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount      int  NOT NULL,               -- monto en COP para este usuario
  created_at  timestamptz DEFAULT now(),
  UNIQUE (category_id, user_id, year, month)
);

-- Historial de cambios del presupuesto (trazabilidad)
CREATE TABLE budget_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   uuid REFERENCES budget(id),
  category_id uuid REFERENCES categories(id),
  year        int  NOT NULL,
  month       int  NOT NULL,
  old_amount  int,
  new_amount  int,
  changed_by  uuid REFERENCES users(id),
  reason      text,  -- nota opcional del usuario al cambiar el presupuesto
  changed_at  timestamptz DEFAULT now()
);

-- Transacciones
CREATE TABLE transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id),
  date           date NOT NULL,
  category_id    uuid REFERENCES categories(id),
  subcategory_id uuid REFERENCES subcategories(id),
  description    text NOT NULL,
  amount         int  NOT NULL,  -- COP positivo siempre
  type           text CHECK (type IN ('income', 'expense')) NOT NULL,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- Deudas (créditos, tarjetas, préstamos personales, etc.)
CREATE TABLE debts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,         -- "Tarjeta Visa", "Préstamo carro"
  description  text,
  total_amount int  NOT NULL,         -- monto original de la deuda en COP
  user_id      uuid REFERENCES users(id),  -- NULL = deuda del hogar compartida
  color        text DEFAULT '#dc2626',
  status       text CHECK (status IN ('active', 'paid')) DEFAULT 'active',
  due_date     date,                  -- fecha de vencimiento total (opcional)
  interest_rate numeric(5,2),        -- tasa de interés (opcional, para info)
  created_at   timestamptz DEFAULT now()
);

-- Abonos a deudas
CREATE TABLE debt_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id     uuid REFERENCES debts(id) ON DELETE CASCADE,
  amount      int  NOT NULL,          -- monto abonado en COP
  date        date NOT NULL,
  description text,                   -- "Abono cuota 3", "Pago mínimo", etc.
  paid_by     uuid REFERENCES users(id),
  notes       text,
  created_at  timestamptz DEFAULT now()
);
```

**Reglas de negocio clave:**
- Al crear una categoría → queda disponible inmediatamente para transacciones de cualquier usuario
- Una categoría puede tener presupuesto solo de Belmont, solo de Sofi, o de ambos — no hay restricción
- Vista individual (Belmont o Sofi): muestra únicamente las categorías donde ese usuario tiene presupuesto
- Vista Pareja: agrupa por categoría y suma los montos de todos los usuarios que la tengan;
  los porcentajes de contribución se calculan automáticamente (no se configuran)
- El presupuesto de cada usuario es independiente — cada quien edita el suyo sin afectar al otro
- El saldo pendiente de una deuda = `total_amount − SUM(debt_payments.amount)`
- Las deudas se muestran en la vista de Presupuesto con pestaña separada
- Una deuda pagada (saldo = 0) cambia automáticamente a `status = 'paid'`

#### 6B — Backend (FastAPI + Supabase)

- [ ] Crear proyecto en supabase.com y ejecutar el schema SQL anterior
- [ ] Seed inicial: insertar usuarios (Belmont, Sofi) y categorías base en Supabase
- [ ] Importar historial de transacciones desde Google Sheets → Supabase (script de migración)
- [ ] Añadir `supabase-py` a requirements.txt
- [ ] `db/client.py` — cliente Supabase singleton (lee SUPABASE_URL + SUPABASE_SERVICE_KEY)
- [ ] `db/queries.py` — todas las queries centralizadas:
  - categorías CRUD + subcategorías CRUD
  - presupuesto CRUD + splits + historial
  - transacciones CRUD
  - deudas CRUD + abonos CRUD
- [ ] Nuevos endpoints:
  ```
  GET/POST        /api/categories
  PUT/DELETE      /api/categories/{id}
  POST            /api/categories/{id}/subcategories
  DELETE          /api/subcategories/{id}

  GET/POST        /api/budget?year=&month=
  PUT             /api/budget/{id}
  GET             /api/budget/{id}/history
  POST/PUT        /api/budget/{id}/splits

  GET/POST        /api/transactions
  PUT/DELETE      /api/transactions/{id}

  GET/POST        /api/debts
  PUT/DELETE      /api/debts/{id}
  POST            /api/debts/{id}/payments
  DELETE          /api/debt-payments/{id}
  ```
- [ ] Actualizar `agent/tools.py` para leer de Supabase en vez de Sheets

#### 6C — Frontend

**Vista Presupuesto (rediseño):**
- Dos pestañas principales: `Presupuesto` | `Deudas`
- **Pestaña Presupuesto:**
  - Selector de mes/año
  - Toggle usuario (Belmont / Sofi / Pareja)
  - Lista de categorías con monto presupuestado, gastado y % usado
  - Botón "+ Categoría" → modal para crear categoría (nombre, icono, color, tipo)
  - Click en categoría → expande subcategorías + edición inline del monto
  - Cada usuario edita su propio monto directamente (no hay configuración de split)
  - En vista "Pareja": barra apilada mostrando el monto de cada uno y el % derivado;
    si solo uno tiene presupuesto para esa categoría se muestra solo su aporte (100%)
  - Ícono de historial por categoría → drawer con cambios anteriores
- **Pestaña Deudas:**
  - Cards por deuda: nombre, saldo pendiente, barra de progreso, próximo vencimiento
  - Botón "Abonar" → modal con monto, fecha, quién paga, notas
  - Botón "+ Deuda" → modal para crear deuda
  - Toggle usuario: filtra por propietario o muestra todas (Pareja)
  - Deuda pagada → card con estado "Pagada ✓" en verde, colapsable

**Otras vistas afectadas:**
- Transacciones → selector de categoría usa categorías de Supabase (no hardcodeadas)
- TxnForm → CRUD real contra `/api/transactions`
- AppContext → reemplaza seed data y Sheets cache con queries a Supabase endpoints

#### 6D — Migración de datos
- [ ] Script `data/migrate_to_supabase.py`:
  1. Lee todas las transacciones de Google Sheets
  2. Mapea categorías de texto a UUIDs de la tabla `categories`
  3. Inserta en `transactions` de Supabase
  4. Verifica que el total por mes coincida con los datos originales

### Phase 7 — Agente IA con contexto Supabase
*Una vez que toda la data está en Supabase, el agente puede responder con más precisión
y el usuario puede hacer preguntas sobre deudas, splits de presupuesto, etc.*
- [ ] Actualizar `agent/tools.py` para usar `db/queries.py`
- [ ] Añadir herramienta `get_debt_summary` — saldos pendientes por deuda
- [ ] Añadir herramienta `get_budget_splits` — distribución por usuario
- [ ] Prompt actualizado para incluir contexto de deudas y splits
- [ ] Test end-to-end: "¿Cuánto le debo a la tarjeta Visa?" → respuesta correcta

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