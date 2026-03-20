# AgenteAsesorFinanciero

A personal AI financial advisor for a couple. It reads budget and expense data from Google Sheets and answers natural language questions in Spanish or English.

**Example questions:**
- "¿Cómo vamos con mercado este mes?"
- "¿Podría comprar un monitor de $2.800.000 COP? ¿Cómo impacta nuestras finanzas?"
- "What are our biggest spending categories this year?"

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent engine | LangGraph (StateGraph) |
| LLM (local dev) | Ollama — `llama3.2` |
| LLM (cloud/prod) | Google Gemini Flash |
| Data source | Google Sheets API (`gspread`) |
| Data processing | pandas |
| UI | Streamlit |
| Charts | Plotly |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/AgenteAsesorFinanciero.git
cd AgenteAsesorFinanciero
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your real values
```

### 5. Add Google credentials

Place your Google service account JSON key at `credentials/service_account.json`.
This folder is gitignored — it will never be committed.

### 6. Start Ollama (local dev only)

```bash
ollama run llama3.2
```

### 7. Run the app

```bash
streamlit run ui/app.py
```

---

## Project Structure

```
AgenteAsesorFinanciero/
├── data/
│   ├── sheets_loader.py      # Reads Google Sheets into DataFrames
│   ├── data_processor.py     # Aggregates expenses by category/month/person
│   └── cache.py              # TTL cache to limit Sheets API calls
├── agent/
│   ├── graph.py              # LangGraph StateGraph definition
│   ├── tools.py              # Agent tools (budget, expenses, simulate purchase)
│   ├── llm_factory.py        # Returns LLM based on LLM_PROVIDER env var
│   └── prompts.py            # Financial advisor system prompts
├── ui/
│   ├── app.py                # Streamlit entry point
│   ├── chat.py               # Chat component connected to the agent
│   └── dashboard.py          # Plotly charts by category/month/person
├── tests/
│   ├── test_loader.py
│   └── test_tools.py
├── credentials/              # Gitignored — put service_account.json here
├── .env.example              # Template — copy to .env and fill in values
├── .gitignore
├── requirements.txt
└── CLAUDE.md                 # AI assistant context file
```

---

## Environment Variables

See [.env.example](.env.example) for full documentation of all required variables.

Key variables:
- `LLM_PROVIDER` — `ollama` (local) or `gemini` (cloud)
- `BUDGET_SHEET_ID` / `EXPENSES_SHEET_ID` — Google Sheets IDs
- `GOOGLE_CREDENTIALS_PATH` — path to service account JSON
- `PERSON_NAMES` — comma-separated names matching Sheets tab headers

---

## Development Phases

- [x] Phase 1 — Foundations (folder structure, config, data layer)
- [ ] Phase 2 — LangGraph Agent
- [ ] Phase 3 — Streamlit UI
- [ ] Phase 4 — Deploy to Streamlit Cloud
