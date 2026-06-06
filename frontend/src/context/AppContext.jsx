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
  getSubscriptions, processSubscriptions,
  getDebts, processDebtInstallments,
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
    id:             item.id,
    userId:         item.user_id,
    date:           item.date,
    desc:           item.description,
    category:       item.categories?.name ?? cat?.name ?? '',
    categoryId:     item.category_id,
    subcategoryId:  item.subcategory_id,
    amount:         item.amount,
    type:           item.type,
    notes:          item.notes ?? null,
    subscriptionId: item.subscription_id ?? null,  // set when auto-created by a subscription
    debtId:         item.debt_id ?? null,           // set when this transaction is a debt payment
    user,
  };
}

export function AppProvider({ children }) {
  // ── Supabase data ────────────────────────────────────────────────────────
  const [users,          setUsers]          = useState([]);
  const [categories,     setCategories]     = useState([]);
  const [transactions,   setTransactions]   = useState([]);
  const [subscriptions,  setSubscriptions]  = useState([]);
  const [debts,          setDebts]          = useState([]);
  const [isLoadingTxns,  setIsLoadingTxns]  = useState(true);
  const [txnsError,      setTxnsError]      = useState(null);

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
    const now          = new Date();
    const year         = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // 1. Users + categories (needed before mapping transactions).
    //    Load ALL categories including inactive so transaction chips still render.
    Promise.all([getUsers(), getCategories({ includeInactive: true })])
      .then(([usersData, catsData]) => {
        setUsers(usersData);
        setCategories(catsData);

        // 2. Load transactions (requires users + categories for mapping)
        return getTransactionsDb({ year }).then(txns => {
          setTransactions(txns.map(t => mapTxn(t, catsData, usersData)));
          return [usersData, catsData];
        });
      })
      .then(([usersData, catsData]) => {
        // 3. Process pending subscriptions + debt installments (idempotent, safe every load).
        return Promise.all([
          processSubscriptions(year, currentMonth).catch(err => {
            console.warn('Subscription auto-processing failed:', err);
            return { created: 0 };
          }),
          processDebtInstallments(year, currentMonth).catch(err => {
            console.warn('Debt installment auto-processing failed:', err);
            return { created: 0 };
          }),
        ]).then(([subResult, debtResult]) => {
          if ((subResult.created ?? 0) + (debtResult.created ?? 0) > 0) {
            return getTransactionsDb({ year }).then(txns => {
              setTransactions(txns.map(t => mapTxn(t, catsData, usersData)));
            });
          }
        });
      })
      .catch(err => setTxnsError(err.message))
      .finally(() => setIsLoadingTxns(false));

    // Subscriptions + Debts — independent, can fail separately
    getSubscriptions()
      .then(subs => setSubscriptions(subs))
      .catch(err => console.warn('Failed to load subscriptions:', err));

    getDebts()
      .then(d => setDebts(d))
      .catch(err => console.warn('Failed to load debts:', err));

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
      debt_id:        txn.debtId ?? null,
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

  // Re-fetch all categories (active + inactive) — used after bulk operations (migration).
  const reloadCategories = useCallback(async () => {
    try {
      const catsData = await getCategories({ includeInactive: true });
      setCategories(catsData);
    } catch (err) {
      console.error('Failed to reload categories:', err);
    }
  }, []);

  // Granular category state patchers — update only the affected item so the
  // rest of the list doesn't re-render. Used by Budget CRUD instead of reloadCategories.
  const addCategoryLocal = useCallback((cat) => {
    setCategories(prev => [...prev, { ...cat, subcategories: cat.subcategories ?? [] }]);
  }, []);

  const addSubcategoryLocal = useCallback((catId, sub) => {
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, subcategories: [...(c.subcategories ?? []), sub] } : c
    ));
  }, []);

  const deactivateCategoryLocal = useCallback((catId) => {
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, is_active: false } : c
    ));
  }, []);

  const deactivateSubcategoryLocal = useCallback((subId) => {
    setCategories(prev => prev.map(c => ({
      ...c,
      subcategories: (c.subcategories ?? []).map(s =>
        s.id === subId ? { ...s, is_active: false } : s
      ),
    })));
  }, []);

  // ── Subscription state patchers ───────────────────────────────────────────

  const reloadSubscriptions = useCallback(async () => {
    try {
      const subs = await getSubscriptions();
      setSubscriptions(subs);
    } catch (err) {
      console.error('Failed to reload subscriptions:', err);
    }
  }, []);

  const addSubscriptionLocal = useCallback((sub) => {
    setSubscriptions(prev => [...prev, sub]);
  }, []);

  const removeSubscriptionLocal = useCallback((subId) => {
    setSubscriptions(prev => prev.filter(s => s.id !== subId));
  }, []);

  const updateSubscriptionLocal = useCallback((updated) => {
    setSubscriptions(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, []);

  // Re-fetch current-year transactions after a bulk operation (e.g. category migration).
  const reloadTransactions = useCallback(async () => {
    const year = new Date().getFullYear();
    try {
      const txns = await getTransactionsDb({ year });
      // categories/users may have changed too — use latest state via functional update
      setTransactions(prev => {
        void prev; // intentional: we replace entirely with fresh data
        return txns.map(t => mapTxn(t, categories, users));
      });
    } catch (err) {
      console.error('Failed to reload transactions:', err);
    }
  }, [categories, users]);

  // ── Derived helpers ───────────────────────────────────────────────────────
  const getUser = useCallback((id) => users.find(u => u.id === id), [users]);

  // Map subcategory_id → debt for quick lookup in TxnForm
  const debtsBySubcategoryId = useMemo(() => {
    const map = {};
    debts.forEach(d => { if (d.subcategory_id) map[d.subcategory_id] = d; });
    return map;
  }, [debts]);

  const reloadDebts = useCallback(async () => {
    try {
      const d = await getDebts();
      setDebts(d);
    } catch (err) {
      console.error('Failed to reload debts:', err);
    }
  }, []);

  const value = useMemo(() => ({
    // Supabase data
    users,
    categories,
    transactions,
    subscriptions,
    debts,
    debtsBySubcategoryId,
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

    // Category management
    reloadCategories,
    reloadTransactions,
    addCategoryLocal,
    addSubcategoryLocal,
    deactivateCategoryLocal,
    deactivateSubcategoryLocal,

    // Subscription management
    reloadSubscriptions,
    addSubscriptionLocal,
    removeSubscriptionLocal,
    updateSubscriptionLocal,

    // Debt management
    reloadDebts,

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
    users, categories, transactions, subscriptions, isLoadingTxns, txnsError, getUser,
    userFilter,
    addTransaction, updateTransaction, deleteTransaction,
    reloadCategories, reloadTransactions,
    addCategoryLocal, addSubcategoryLocal, deactivateCategoryLocal, deactivateSubcategoryLocal,
    reloadSubscriptions, addSubscriptionLocal, removeSubscriptionLocal, updateSubscriptionLocal,
    debts, debtsBySubcategoryId, reloadDebts,
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
