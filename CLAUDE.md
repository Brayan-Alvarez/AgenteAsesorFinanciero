# AgenteAsesorFinanciero — Project Context for Claude Code

## Project Overview
A personal AI financial advisor agent for a couple. It reads budget and expense data
from Google Sheets and answers natural language questions like:
- "How are we doing with groceries this month?"
- "Could I buy a $2.8M COP monitor? How would it impact our finances?"
- "What are our biggest spending categories this year?"

The project is a **learning project** — prioritize readable, well-commented code over
premature optimization. Explain non-obvious decisions in comments.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent engine | LangGraph (StateGraph) |
| LLM (local dev) | Ollama — `llama3.2` or `mistral` |
| LLM (cloud/prod) | Google Gemini Flash via `langchain-google-genai` |
| LLM abstraction | `agent/llm_factory.py` — switch via `LLM_PROVIDER` env var |
| Data source | Google Sheets API via `gspread` + `google-auth` |
| Data processing | `pandas` DataFrames |
| UI | Streamlit |
| Charts | Plotly |
| Python version | 3.12+ |
| Package manager | pip + `requirements.txt` |

---

## Repository Structure

```
AgenteAsesorFinanciero/
├── data/
│   ├── sheets_loader.py      # Reads and normalizes Google Sheets into DataFrames
│   ├── data_processor.py     # Builds summaries by category, month, person
│   └── cache.py              # TTL cache to avoid hitting Sheets on every query
├── agent/
│   ├── graph.py              # LangGraph StateGraph definition
│   ├── tools.py              # Agent tools (budget summary, expenses, simulate purchase)
│   ├── llm_factory.py        # Returns correct LLM based on LLM_PROVIDER env var
│   └── prompts.py            # System prompts for the financial advisor persona
├── ui/
│   ├── app.py                # Streamlit entry point
│   ├── chat.py               # Chat component connected to LangGraph agent
│   └── dashboard.py          # Plotly charts: by category, month, person
├── tests/
│   ├── test_loader.py
│   └── test_tools.py
├── .env.example              # Template — never commit the real .env
├── .gitignore
├── requirements.txt
├── CLAUDE.md                 # This file
└── README.md
```

---

## Google Sheets Data Structure

### Spreadsheet 1 — Annual Budget (`BUDGET_SHEET_ID`)
- One sheet (tab) for the full year
- Columns: `Categoría`, `Presupuesto` (planned amount per category for the year)
- Used to compare actual spend vs planned budget

### Spreadsheet 2 — Expenses (`EXPENSES_SHEET_ID`)
- One tab per person per month
- Tab naming convention: `"Enero - [Name]"`, `"Febrero - [Name]"`, etc.
- Columns (exact, case-sensitive): `Fecha`, `Categoría`, `Descripción`, `Monto`, `Observaciones`
- `Fecha` format: `DD/MM/YYYY`
- `Monto` is in COP (Colombian Pesos) — always treat as integer, no decimals

> **Note:** Update `PERSON_NAMES` in `.env` with the actual names used in the tab headers.

---

## Environment Variables

All secrets and config live in `.env` (local) or `st.secrets` (Streamlit Cloud).
**Never hardcode any of these values.**

```bash
# .env.example

# LLM provider: "ollama" for local dev, "gemini" for cloud
LLM_PROVIDER=ollama

# Ollama config (local only)
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434

# Gemini config (cloud/prod)
GEMINI_API_KEY=your_gemini_api_key_here

# Google Sheets
BUDGET_SHEET_ID=your_google_sheet_id_here
EXPENSES_SHEET_ID=your_google_sheet_id_here
GOOGLE_CREDENTIALS_PATH=credentials/service_account.json

# App config
PERSON_NAMES=Name1,Name2
CURRENCY=COP
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

These are the tools the agent has access to. Implement in `agent/tools.py`:

| Tool | Input | Output | Description |
|---|---|---|---|
| `get_budget_summary` | none | dict by category | Planned vs actual spend for current year |
| `get_expenses` | `month`, `person` (optional) | DataFrame summary | Filtered and aggregated expenses |
| `get_monthly_trend` | none | list of monthly totals | Month-by-month spending evolution |
| `simulate_purchase` | `amount` (COP int) | impact analysis | Can we afford X? Effect on remaining budget |

All tools must handle missing data gracefully (return empty results, not raise exceptions).

---

## LangGraph State

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    financial_context: dict   # Loaded once per session from Sheets
    current_month: str        # e.g. "Enero"
    current_year: int
```

---

## Financial Advisor Persona (System Prompt)

The agent should behave as a friendly, practical financial advisor for a Colombian couple.
Key behaviors:
- Always answer in the same language the user writes in (Spanish or English)
- Express amounts in COP with thousands separator: `$2.800.000`
- When simulating a purchase, show remaining budget per category after the expense
- Be encouraging but honest — don't sugarcoat overspending
- Never invent data — if information is missing, say so clearly

---

## Coding Conventions

- **Language:** English for all code (variables, functions, classes, file names)
- **Comments:** English (add them generously — this is a learning project)
- **Type hints:** Required on all function signatures
- **Error handling:** Use specific exceptions, never bare `except:`
- **Secrets:** Always load from `os.getenv()` or `st.secrets`, never hardcode
- **DataFrames:** Column names stay in Spanish (match the Sheets exactly): `Fecha`, `Categoría`, `Descripción`, `Monto`, `Observaciones`
- **Formatting:** Follow PEP 8. Max line length 100 chars.
- **Tests:** Write at least one test per tool function in `tests/`

---

## Development Phases

Work through these phases in order. Do not skip ahead.

### Phase 1 — Foundations
- [x] Initialize Git repo with `.gitignore` and this `CLAUDE.md`
- [x] Create `requirements.txt` with all dependencies
- [x] Create `.env.example`
- [x] Implement `data/sheets_loader.py`
- [x] Implement `data/data_processor.py`
- [x] Implement `data/cache.py`
- [x] Write basic tests in `tests/test_loader.py`

### Phase 2 — LangGraph Agent
- [x] Implement `agent/llm_factory.py`
- [x] Implement `agent/tools.py`
- [x] Implement `agent/prompts.py`
- [x] Implement `agent/graph.py` (StateGraph)
- [x] Test conversational flow in terminal

### Phase 3 — FastAPI Backend
- [x] api/main.py — FastAPI app with CORS
- [x] api/models.py — Pydantic models
- [x] api/routes/chat.py — POST /api/chat
- [x] api/routes/dashboard.py — dashboard endpoints
- [x] Test all endpoints with curl before starting frontend

### Phase 4 — React Frontend
- [x] Bootstrap Vite + React in frontend/
- [x] src/api/client.js — centralized API calls (axios, getBudget / getExpenses / getTrend / sendMessage)
- [x] Design system — dark mode CSS tokens (DM Sans + DM Mono, indigo/violet palette) in `src/index.css`
- [x] App shell — sidebar 240px (desktop) + bottom nav with FAB (mobile), React Router v7
- [x] AppContext — global state: seed transactions (CRUD), seed budget (editable), userFilter, real API cache, chat history
- [x] `src/data/categories.js` — 21 categories with icon/color + USERS constant
- [x] `src/data/seed.js` — transaction + budget generators, filterTxns helper
- [x] Shared components: Avatar, UserToggle, MonthNav, CatChip, Modal, TxnForm, DonutChart, TrendBarChart
- [x] Dashboard — KPIs, budget bar, donut + legend, AI insights panel, 6-month trend, categories vs budget, recent transactions table
- [x] Transactions — grouped by day, search + category filter, CRUD via modal
- [x] Budget — "by category" editable grid (category × month) + "by month" 12-card view
- [x] Recommendations — 6 deterministic AI rules (overspend, projection, savings rate, comparison, tip, subscriptions)
- [x] Chat — dark-styled conversational UI connected to /api/chat

**Data layer notes:**
- Seed transactions/budget → interactive CRUD; backend has no individual-transaction endpoints yet
- Real API (budget summary, trend, expense categories) loaded into AppContext but seed data drives the UI
- To fully connect: add `GET /api/transactions` and `GET/PUT /api/budget/{category}/{month}` to the FastAPI backend

### Phase 5 — Deploy ← CURRENT
- [ ] FastAPI → Railway or Render (free tier)
- [ ] React → Vercel (free tier)
- [ ] Environment variables in each platform's dashboard
- [ ] Update CORS with production frontend URL
- [ ] Basic authentication (simple JWT or shared password)

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

# 5. Make sure Ollama is running locally
ollama run llama3.2

# 6. Run the Streamlit app
streamlit run ui/app.py
```

---

## Important Constraints

- The `credentials/` folder must be in `.gitignore` — never commit service account keys
- Sheet IDs and API keys must never appear in code or commit history
- All monetary amounts are COP integers — never use floats for money
- The agent must always load financial context fresh from Sheets at session start (use the cache layer to avoid repeated API calls within a session)