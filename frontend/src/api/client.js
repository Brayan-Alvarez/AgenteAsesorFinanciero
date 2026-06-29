/**
 * client.js — Centralized API client for the AgenteAsesorFinanciero backend.
 *
 * This is the ONLY file that should import axios or make HTTP requests.
 * All other components should import and call the functions exported here.
 *
 * Base URL is read from the VITE_API_URL environment variable (set in .env),
 * with a fallback to localhost:8000 for safety.
 */

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function sendMessage(message, history = []) {
  const response = await api.post("/api/chat", { message, history });
  return response.data;
}

// ── Legacy Sheets endpoints (still used by Dashboard charts) ─────────────────

export async function getBudget() {
  const response = await api.get("/api/budget");
  return response.data;
}

export async function getExpenses(month, person = null) {
  const params = { month };
  if (person !== null) params.person = person;
  const response = await api.get("/api/expenses", { params });
  return response.data;
}

export async function getTrend() {
  const response = await api.get("/api/trend");
  return response.data;
}

// ── Supabase — Users ──────────────────────────────────────────────────────────

export async function getUsers() {
  const response = await api.get("/api/users");
  return response.data;
}

// ── Supabase — Categories ─────────────────────────────────────────────────────

export async function getCategories({ includeInactive = false } = {}) {
  const params = includeInactive ? { include_inactive: true } : {};
  const response = await api.get("/api/categories", { params });
  return response.data;
}

export async function createCategory(data) {
  const response = await api.post("/api/categories", data);
  return response.data;
}

export async function updateCategory(id, data) {
  const response = await api.put(`/api/categories/${id}`, data);
  return response.data;
}

export async function deleteCategory(id) {
  await api.delete(`/api/categories/${id}`);
}

export async function createSubcategory(categoryId, data) {
  const response = await api.post(`/api/categories/${categoryId}/subcategories`, data);
  return response.data;
}

export async function deleteSubcategory(id) {
  await api.delete(`/api/subcategories/${id}`);
}

// ── Supabase — Budget ─────────────────────────────────────────────────────────

export async function getBudgetSupabase(year, month, userId = null) {
  const params = { year, month };
  if (userId) params.user_id = userId;
  const response = await api.get("/api/budget/supabase", { params });
  return response.data;
}

export async function upsertBudget(data) {
  const response = await api.post("/api/budget/supabase", data);
  return response.data;
}

export async function deleteBudget(id) {
  await api.delete(`/api/budget/supabase/${id}`);
}

export async function getBudgetHistory(categoryId, userId) {
  const response = await api.get("/api/budget/history", {
    params: { category_id: categoryId, user_id: userId },
  });
  return response.data;
}

// ── Supabase — Transactions ───────────────────────────────────────────────────

export async function getTransactionsDb(params = {}) {
  const response = await api.get("/api/transactions/db", { params });
  return response.data;
}

export async function createTransactionDb(data) {
  const response = await api.post("/api/transactions/db", data);
  return response.data;
}

export async function updateTransactionDb(id, data) {
  const response = await api.put(`/api/transactions/db/${id}`, data);
  return response.data;
}

export async function deleteTransactionDb(id) {
  await api.delete(`/api/transactions/db/${id}`);
}

export async function migrateCategory(fromCategoryId, toCategoryId, toSubcategoryId = null) {
  const response = await api.post('/api/transactions/db/migrate-category', {
    from_category_id: fromCategoryId,
    to_category_id:   toCategoryId,
    to_subcategory_id: toSubcategoryId,
  });
  return response.data; // { migrated: N }
}

// ── Supabase — Summary (Dashboard aggregates) ─────────────────────────────────

export async function getBudgetSummary(year, month, userId = null) {
  const params = { year, month };
  if (userId) params.user_id = userId;
  const response = await api.get("/api/summary/budget", { params });
  return response.data;
}

export async function getTrendSummary(year, userId = null) {
  const params = { year };
  if (userId) params.user_id = userId;
  const response = await api.get("/api/summary/trend", { params });
  return response.data;
}

export async function getExpensesSummary(year, month, userId = null) {
  const params = { year, month };
  if (userId) params.user_id = userId;
  const response = await api.get("/api/summary/expenses", { params });
  return response.data;
}

// ── Supabase — Debts ──────────────────────────────────────────────────────────

export async function getDebts(userId = null) {
  const params = {};
  if (userId) params.user_id = userId;
  const response = await api.get("/api/debts", { params });
  return response.data;
}

export async function createDebt(data) {
  const response = await api.post("/api/debts", data);
  return response.data;
}

export async function updateDebt(id, data) {
  const response = await api.put(`/api/debts/${id}`, data);
  return response.data;
}

export async function deleteDebt(id) {
  await api.delete(`/api/debts/${id}`);
}

export async function addDebtPayment(debtId, data) {
  const response = await api.post(`/api/debts/${debtId}/payments`, data);
  return response.data;
}

export async function deleteDebtPayment(paymentId) {
  await api.delete(`/api/debt-payments/${paymentId}`);
}

export async function processDebtInstallments(year, month) {
  const response = await api.post('/api/debts/process', null, { params: { year, month } });
  return response.data;
}

// ── Supabase — Subscriptions ──────────────────────────────────────────────────

export async function getSubscriptions({ userId = null, includeInactive = false } = {}) {
  const params = {};
  if (userId) params.user_id = userId;
  if (includeInactive) params.include_inactive = true;
  const response = await api.get('/api/subscriptions', { params });
  return response.data;
}

export async function createSubscription(data) {
  const response = await api.post('/api/subscriptions', data);
  return response.data;
}

export async function updateSubscription(id, data) {
  const response = await api.put(`/api/subscriptions/${id}`, data);
  return response.data;
}

export async function cancelSubscription(id) {
  const response = await api.delete(`/api/subscriptions/${id}`);
  return response.data;
}

export async function processSubscriptions(year, month) {
  const response = await api.post('/api/subscriptions/process', null, {
    params: { year, month },
  });
  return response.data; // { created: N }
}

// ── Supabase — Income ─────────────────────────────────────────────────────────

export async function getIncome(year, month, userId = null) {
  const params = { year, month };
  if (userId) params.user_id = userId;
  const response = await api.get('/api/income', { params });
  return response.data;
}

export async function upsertIncome(data) {
  const response = await api.post('/api/income', data);
  return response.data;
}

export async function getIncomeHistory(userId) {
  const response = await api.get('/api/income/history', { params: { user_id: userId } });
  return response.data;
}

export async function generateIncomeTransactions(year, month) {
  const response = await api.post('/api/income/generate', null, { params: { year, month } });
  return response.data;
}

export async function seedIncomeHistory() {
  const response = await api.post('/api/income/seed-history');
  return response.data;
}

// ── Primas ────────────────────────────────────────────────────────────────────

export async function getPrimas(userId = null) {
  const params = userId ? { user_id: userId } : {};
  const response = await api.get('/api/primas', { params });
  return response.data;
}

export async function createPrima(data) {
  const response = await api.post('/api/primas', data);
  return response.data;
}

export async function updatePrima(id, data) {
  const response = await api.put(`/api/primas/${id}`, data);
  return response.data;
}

export async function deletePrima(id) {
  await api.delete(`/api/primas/${id}`);
}

export async function processPrimas(year, month) {
  const response = await api.post('/api/primas/process', null, { params: { year, month } });
  return response.data;
}
