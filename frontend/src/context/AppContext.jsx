/**
 * AppContext.jsx — Global state for the financial app.
 *
 * Holds two data layers:
 *   1. Seed transactions + budget — interactive CRUD, derived KPIs, filters.
 *      These use in-memory seed data because the backend doesn't expose
 *      individual transaction endpoints yet (only aggregated by category).
 *   2. Real API data — budget summary, trend, expense categories (read-only,
 *      fetched from the FastAPI backend that reads Google Sheets).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBudget, getExpenses, getTrend } from '../api/client.js';
import { generateBudget, generateTransactions } from '../data/seed.js';

const AppContext = createContext(null);

// Stable seed so the data doesn't regenerate on every render
const SEED_TXN    = generateTransactions();
const SEED_BUDGET = generateBudget();

const INITIAL_CHAT = [
  { role: 'agent', text: '¡Hola! Soy tu asesor financiero personal. ¿En qué te puedo ayudar hoy?' },
];

export function AppProvider({ children }) {
  // ── Seed state (CRUD) ──────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState(SEED_TXN);
  const [budget, setBudget]             = useState(SEED_BUDGET);
  const [userFilter, setUserFilter]     = useState('all');

  // ── Real API data ──────────────────────────────────────────────────────────
  const [apiBudget,      setApiBudget]      = useState(null);
  const [apiTrend,       setApiTrend]       = useState(null);
  const [expensesCache,  setExpensesCache]  = useState({});
  const [isLoadingApi,   setIsLoadingApi]   = useState(true);
  const [apiError,       setApiError]       = useState(null);

  // ── Chat history ───────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);

  // Fetch real API data once on mount
  useEffect(() => {
    Promise.all([getBudget(), getTrend()])
      .then(([b, t]) => {
        setApiBudget(b.categories);
        setApiTrend(t.trend);
      })
      .catch(err => setApiError(err.message))
      .finally(() => setIsLoadingApi(false));
  }, []);

  // Lazy fetch expenses per month/person (cached)
  const fetchExpenses = useCallback(async (month, person = null) => {
    const key = `${month}|${person ?? 'all'}`;
    if (expensesCache[key] !== undefined) return expensesCache[key];
    const data = await getExpenses(month, person);
    setExpensesCache(prev => ({ ...prev, [key]: data.items }));
    return data.items;
  }, [expensesCache]);

  // ── Transaction actions ────────────────────────────────────────────────────
  const addTransaction = useCallback((txn) => {
    setTransactions(prev => {
      const newId = prev.length > 0 ? Math.max(...prev.map(t => t.id)) + 1 : 1;
      return [{ ...txn, id: newId }, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
  }, []);

  const updateTransaction = useCallback((id, txn) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...txn, id } : t));
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Budget action ──────────────────────────────────────────────────────────
  const updateBudget = useCallback((catId, month, value) => {
    setBudget(prev => ({
      ...prev,
      [catId]: { ...prev[catId], [month]: Number(value) || 0 },
    }));
  }, []);

  const value = useMemo(() => ({
    // Seed data + CRUD
    transactions,
    budget,
    userFilter,
    setUserFilter,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateBudget,

    // Real API data
    apiBudget,
    apiTrend,
    expensesCache,
    fetchExpenses,
    isLoadingApi,
    apiError,

    // Chat
    chatHistory,
    setChatHistory,
  }), [
    transactions, budget, userFilter,
    apiBudget, apiTrend, expensesCache, fetchExpenses, isLoadingApi, apiError,
    chatHistory,
    addTransaction, updateTransaction, deleteTransaction, updateBudget,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside <AppProvider>.');
  return ctx;
}
