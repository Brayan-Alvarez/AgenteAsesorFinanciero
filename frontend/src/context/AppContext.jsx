/**
 * AppContext.jsx — Global state for the financial app.
 *
 * Data sources:
 *   Real API (Google Sheets via FastAPI):
 *     - transactions  → GET /api/transactions  (individual rows, all months)
 *     - users/personas → GET /api/personas      (person names from PERSON_NAMES env)
 *     - budget summary → GET /api/budget        (annual planned vs actual)
 *     - trend          → GET /api/trend         (monthly totals)
 *     - expenses cache → GET /api/expenses      (category totals per month)
 *
 *   In-memory CRUD:
 *     Transactions added/edited/deleted in the UI exist only in-memory —
 *     writing back to Google Sheets is not implemented yet (future Phase 5).
 *
 *   Seed budget (editable):
 *     The budget grid uses a monthly breakdown that the API doesn't expose
 *     (the Sheets budget is annual-only).  Seed values are used as defaults;
 *     edits persist only in-memory.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBudget, getExpenses, getPersonas, getTransactions, getTrend } from '../api/client.js';
import { generateBudget } from '../data/seed.js';

const AppContext = createContext(null);

// Avatar colors assigned in order to each person loaded from the API.
const PERSONA_COLORS = ['#6366f1', '#ec4899', '#34d399', '#f59e0b'];

const INITIAL_CHAT = [
  { role: 'agent', text: '¡Hola! Soy tu asesor financiero personal. ¿En qué te puedo ayudar hoy?' },
];

// ---------------------------------------------------------------------------
// Map an API transaction item → frontend Transaction shape
// ---------------------------------------------------------------------------
function mapApiTxn(item) {
  return {
    id:       item.id,
    userId:   item.persona.toLowerCase(),       // "Belmont" → "belmont"
    date:     item.fecha,                        // "YYYY-MM-DD"
    desc:     item.descripcion,
    category: item.categoria,                   // Real label from sheet (e.g. "Almuerzos normales")
    amount:   item.monto,
    type:     item.tipo === 'ingreso' ? 'income' : 'expense',
  };
}

export function AppProvider({ children }) {
  // ── Real transactions (from Sheets via API) ─────────────────────────────
  const [transactions,    setTransactions]    = useState([]);
  const [isLoadingTxns,   setIsLoadingTxns]   = useState(true);
  const [txnsError,       setTxnsError]       = useState(null);

  // ── Dynamic users (from PERSON_NAMES env via API) ───────────────────────
  const [users,           setUsers]           = useState([]);

  // ── Seed budget (editable monthly breakdown) ────────────────────────────
  const [budget,          setBudget]          = useState(() => generateBudget());

  // ── UI filter ───────────────────────────────────────────────────────────
  const [userFilter,      setUserFilter]      = useState('all');

  // ── Real API aggregated data ────────────────────────────────────────────
  const [apiBudget,       setApiBudget]       = useState(null);
  const [apiTrend,        setApiTrend]        = useState(null);
  const [expensesCache,   setExpensesCache]   = useState({});
  const [isLoadingApi,    setIsLoadingApi]    = useState(true);
  const [apiError,        setApiError]        = useState(null);

  // ── Chat history ────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);

  // ── Load everything on mount ─────────────────────────────────────────────
  useEffect(() => {
    // Transactions + personas in parallel
    Promise.all([getTransactions(), getPersonas()])
      .then(([txnData, personaData]) => {
        setTransactions(txnData.transactions.map(mapApiTxn));

        // Build dynamic USERS array with assigned colors
        const loadedUsers = personaData.personas.map((p, i) => ({
          id:     p.id,
          nombre: p.nombre,
          name:   p.nombre,
          avatar: p.nombre.charAt(0).toUpperCase(),
          color:  PERSONA_COLORS[i % PERSONA_COLORS.length],
        }));
        setUsers(loadedUsers);
      })
      .catch(err => setTxnsError(err.message))
      .finally(() => setIsLoadingTxns(false));

    // Budget summary + trend in parallel (separate from above so either can fail independently)
    Promise.all([getBudget(), getTrend()])
      .then(([b, t]) => {
        setApiBudget(b.categories);
        setApiTrend(t.trend);
      })
      .catch(err => setApiError(err.message))
      .finally(() => setIsLoadingApi(false));
  }, []);

  // Lazy-fetch expense category totals per month/person (for donut chart API data)
  const fetchExpenses = useCallback(async (month, person = null) => {
    const key = `${month}|${person ?? 'all'}`;
    if (expensesCache[key] !== undefined) return expensesCache[key];
    const data = await getExpenses(month, person);
    setExpensesCache(prev => ({ ...prev, [key]: data.items }));
    return data.items;
  }, [expensesCache]);

  // ── Transaction CRUD (in-memory only — not persisted to Sheets) ──────────
  const addTransaction = useCallback((txn) => {
    setTransactions(prev => {
      const newId = prev.length > 0 ? Math.max(...prev.map(t => t.id)) + 1 : 1;
      return [{ ...txn, id: newId }, ...prev]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    });
  }, []);

  const updateTransaction = useCallback((id, txn) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...txn, id } : t));
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Budget CRUD (in-memory only) ─────────────────────────────────────────
  const updateBudget = useCallback((catId, month, value) => {
    setBudget(prev => ({
      ...prev,
      [catId]: { ...prev[catId], [month]: Number(value) || 0 },
    }));
  }, []);

  // ── Derived helpers ──────────────────────────────────────────────────────
  const getUser = useCallback((id) => users.find(u => u.id === id), [users]);

  const value = useMemo(() => ({
    // Real transactions
    transactions,
    isLoadingTxns,
    txnsError,

    // Dynamic users
    users,
    getUser,

    // Budget + filter
    budget,
    userFilter,
    setUserFilter,
    updateBudget,

    // Transaction CRUD
    addTransaction,
    updateTransaction,
    deleteTransaction,

    // Real API aggregated data
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
    transactions, isLoadingTxns, txnsError,
    users, getUser,
    budget, userFilter,
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
