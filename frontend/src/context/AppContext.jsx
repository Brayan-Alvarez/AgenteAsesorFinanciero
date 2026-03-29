/**
 * AppContext.jsx — Global state store for the financial advisor app.
 *
 * Why a context?
 *   Without shared state, navigating away from Dashboard and back would
 *   re-fetch data from the API on every visit, causing a flash of loading
 *   spinners and unnecessary network calls.  By hoisting state here, all
 *   expensive data is fetched ONCE on app start and shared across routes.
 *
 * What lives here:
 *   budgetData    — all categories from GET /api/budget (fetched once on mount)
 *   trendData     — monthly totals from GET /api/trend  (fetched once on mount)
 *   expensesCache — { "Marzo|all": [...], "Marzo|Sofi": [...], ... }
 *                   keyed by "month|person" so each combo is fetched at most once
 *   chatHistory   — conversation turns; persists across route changes
 *   isLoadingData — true while the initial budget + trend requests are in flight
 *   dataError     — error message if the initial fetch fails
 *
 * What stays LOCAL to each component:
 *   selectedMonth    (Dashboard)  — pure UI state, no benefit from being global
 *   expensesLoading  (Dashboard)  — only relevant while a per-month fetch runs
 *   input / loading  (Chat)       — ephemeral form state
 */

import { createContext, useContext, useEffect, useState } from "react";

import { getBudget, getExpenses, getTrend } from "../api/client";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppContext = createContext(null);

// ---------------------------------------------------------------------------
// Initial chat greeting — defined here so AppProvider owns it
// ---------------------------------------------------------------------------

const INITIAL_CHAT_HISTORY = [
  { role: "agent", text: "¡Hola! Soy tu asesor financiero personal. ¿En qué te puedo ayudar hoy?" },
];

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }) {
  // --- Shared data state ---
  const [budgetData,    setBudgetData]    = useState(null);
  const [trendData,     setTrendData]     = useState(null);
  const [expensesCache, setExpensesCache] = useState({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError,     setDataError]     = useState(null);

  // --- Chat history — persists across route changes ---
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT_HISTORY);

  // Fetch budget + trend exactly once when the app first mounts.
  // Expenses are fetched lazily via fetchExpenses() below.
  useEffect(() => {
    Promise.all([getBudget(), getTrend()])
      .then(([budget, trend]) => {
        setBudgetData(budget.categories);
        setTrendData(trend.trend);
      })
      .catch((err) => setDataError(err.message))
      .finally(() => setIsLoadingData(false));
  }, []); // empty deps → runs once

  /**
   * Return cached expenses for a month+person combo, fetching from the API
   * only on the first request for that combo.
   *
   * @param {string}      month  — Spanish month name, e.g. "Marzo"
   * @param {string|null} person — Person name or null for combined expenses
   * @returns {Promise<Array>}   Resolved with the items array
   */
  const fetchExpenses = async (month, person = null) => {
    const key = `${month}|${person ?? "all"}`;

    // Cache hit — return immediately without touching the network
    if (expensesCache[key] !== undefined) {
      return expensesCache[key];
    }

    // Cache miss — fetch, store, and return
    const data = await getExpenses(month, person);
    setExpensesCache((prev) => ({ ...prev, [key]: data.items }));
    return data.items;
  };

  return (
    <AppContext.Provider
      value={{
        // Budget + trend (fetched once on mount)
        budgetData,
        trendData,
        isLoadingData,
        dataError,

        // Expenses cache + loader (fetched lazily per month/person)
        expensesCache,
        fetchExpenses,

        // Chat history (persisted across route changes)
        chatHistory,
        setChatHistory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Custom hook — convenience wrapper with a helpful error if used outside provider
// ---------------------------------------------------------------------------

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error("useAppContext must be used inside <AppProvider>.");
  }
  return ctx;
}
