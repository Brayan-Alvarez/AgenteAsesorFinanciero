/**
 * AppContext.jsx — Global state for the financial app.
 *
 * Data sources (all Supabase via FastAPI):
 *   - users         → GET /api/users
 *   - categories    → GET /api/categories
 *   - transactions  → GET /api/transactions/db  (current year)
 *
 * Legacy Sheets data (still used by Dashboard charts until Phase 7):
 *   - apiBudget     → GET /api/budget
 *   - apiTrend      → GET /api/trend
 *   - expensesCache → GET /api/expenses
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getBudget, getExpenses, getTrend,
  getUsers, getCategories,
  getTransactionsDb, createTransactionDb, updateTransactionDb, deleteTransactionDb,
} from '../api/client.js';

const AppContext = createContext(null);

const INITIAL_CHAT = [
  { role: 'agent', text: '¡Hola! Soy tu asesor financiero personal. ¿En qué te puedo ayudar hoy?' },
];

// Map Supabase transaction shape → internal frontend shape
function mapTxn(item, categories = [], users = []) {
  const cat  = categories.find(c => c.id === item.category_id);
  const user = users.find(u => u.id === item.user_id) ?? item.users;
  return {
    id:            item.id,
    userId:        item.user_id,
    date:          item.date,
    desc:          item.description,
    category:      item.categories?.name ?? cat?.name ?? '',
    categoryId:    item.category_id,
    subcategoryId: item.subcategory_id,
    amount:        item.amount,
    type:          item.type,
    notes:         item.notes ?? null,
    user,
  };
}

export function AppProvider({ children }) {
  // ── Supabase data ────────────────────────────────────────────────────────
  const [users,         setUsers]         = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [transactions,  setTransactions]  = useState([]);
  const [isLoadingTxns, setIsLoadingTxns] = useState(true);
  const [txnsError,     setTxnsError]     = useState(null);

  // ── UI filter ─────────────────────────────────────────────────────────────
  const [userFilter, setUserFilter] = useState('all');

  // ── Legacy Sheets aggregated data (Dashboard charts) ─────────────────────
  const [apiBudget,     setApiBudget]     = useState(null);
  const [apiTrend,      setApiTrend]      = useState(null);
  const [expensesCache, setExpensesCache] = useState({});
  const [isLoadingApi,  setIsLoadingApi]  = useState(true);
  const [apiError,      setApiError]      = useState(null);

  // ── Chat history ──────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);

  // ── Load everything on mount ──────────────────────────────────────────────
  useEffect(() => {
    const year = new Date().getFullYear();

    // Users + categories (needed before mapping transactions)
    Promise.all([getUsers(), getCategories()])
      .then(([usersData, catsData]) => {
        setUsers(usersData);
        setCategories(catsData);

        // Load transactions after we have categories + users for mapping
        return getTransactionsDb({ year }).then(txns => {
          setTransactions(txns.map(t => mapTxn(t, catsData, usersData)));
        });
      })
      .catch(err => setTxnsError(err.message))
      .finally(() => setIsLoadingTxns(false));

    // Legacy Sheets data for Dashboard charts — independent, can fail separately
    Promise.all([getBudget(), getTrend()])
      .then(([b, t]) => {
        setApiBudget(b.categories);
        setApiTrend(t.trend);
      })
      .catch(err => setApiError(err.message))
      .finally(() => setIsLoadingApi(false));
  }, []);

  // Lazy-fetch expense category totals per month/person (Dashboard donut)
  const fetchExpenses = useCallback(async (month, person = null) => {
    const key = `${month}|${person ?? 'all'}`;
    if (expensesCache[key] !== undefined) return expensesCache[key];
    const data = await getExpenses(month, person);
    setExpensesCache(prev => ({ ...prev, [key]: data.items }));
    return data.items;
  }, [expensesCache]);

  // ── Transaction CRUD (hits real Supabase via API) ─────────────────────────

  const addTransaction = useCallback(async (txn) => {
    const created = await createTransactionDb({
      user_id:        txn.userId,
      date:           txn.date,
      category_id:    txn.categoryId,
      subcategory_id: txn.subcategoryId ?? null,
      description:    txn.desc,
      amount:         Number(txn.amount),
      type:           txn.type,
      notes:          txn.notes ?? null,
    });
    setTransactions(prev =>
      [mapTxn(created, categories, users), ...prev]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    );
  }, [categories, users]);

  const updateTransaction = useCallback(async (id, txn) => {
    const updated = await updateTransactionDb(id, {
      user_id:        txn.userId,
      date:           txn.date,
      category_id:    txn.categoryId,
      subcategory_id: txn.subcategoryId ?? null,
      description:    txn.desc,
      amount:         Number(txn.amount),
      type:           txn.type,
      notes:          txn.notes ?? null,
    });
    setTransactions(prev => prev.map(t => t.id === id ? mapTxn(updated, categories, users) : t));
  }, [categories, users]);

  const deleteTransaction = useCallback(async (id) => {
    await deleteTransactionDb(id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Derived helpers ───────────────────────────────────────────────────────
  const getUser = useCallback((id) => users.find(u => u.id === id), [users]);

  const value = useMemo(() => ({
    // Supabase data
    users,
    categories,
    transactions,
    isLoadingTxns,
    txnsError,
    getUser,

    // Kept for backward-compat (Recommendations.jsx) — empty until Phase 7
    budget: {},

    // UI filter
    userFilter,
    setUserFilter,

    // Transaction CRUD
    addTransaction,
    updateTransaction,
    deleteTransaction,

    // Legacy Sheets data (Dashboard)
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
    users, categories, transactions, isLoadingTxns, txnsError, getUser,
    userFilter,
    addTransaction, updateTransaction, deleteTransaction,
    apiBudget, apiTrend, expensesCache, fetchExpenses, isLoadingApi, apiError,
    chatHistory,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside <AppProvider>.');
  return ctx;
}
