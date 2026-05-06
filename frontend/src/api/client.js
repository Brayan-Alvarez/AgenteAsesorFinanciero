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
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Send a natural-language message to the financial advisor agent.
 *
 * The agent will call the appropriate tools (budget summary, expenses, etc.)
 * internally and return a plain-text reply in the same language as the message.
 *
 * @param {string} message - The user's question or request.
 * @returns {Promise<{ reply: string }>} The agent's text response.
 * @throws {Error} If the request fails or the server returns an error.
 */
export async function sendMessage(message) {
  try {
    const response = await api.post("/api/chat", { message });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ?? "No se pudo conectar con el agente. Intenta de nuevo."
    );
  }
}

/**
 * Fetch planned vs actual spending for every budget category for the current year.
 *
 * Useful for rendering a bar chart that compares what was budgeted against
 * what has actually been spent in each category.
 *
 * @returns {Promise<{ categories: Array<{ name: string, planned: number, actual: number, remaining: number, pct_used: number }> }>}
 * @throws {Error} If the request fails or the server returns an error.
 */
export async function getBudget() {
  try {
    const response = await api.get("/api/budget");
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ?? "No se pudo cargar el presupuesto."
    );
  }
}

/**
 * Fetch expenses aggregated by category for a specific month.
 *
 * Results are sorted largest-first. Pass a person name to narrow the results
 * to a single person; omit it to get combined expenses for both people.
 *
 * @param {string} month  - Spanish month name, e.g. "Enero", "Marzo".
 * @param {string|null} person - Person name as it appears in the Sheets headers
 *                               (e.g. "Sofi", "Belmont"). Null for combined.
 * @returns {Promise<{ month: string, person: string|null, items: Array<{ category: string, total: number }> }>}
 * @throws {Error} If the request fails or the server returns an error.
 */
export async function getExpenses(month, person = null) {
  try {
    const params = { month };
    if (person !== null) params.person = person;

    const response = await api.get("/api/expenses", { params });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ?? `No se pudieron cargar los gastos de ${month}.`
    );
  }
}

/**
 * Fetch total spending per month in calendar order (Enero → Diciembre).
 *
 * Only months that have at least one recorded expense are included.
 * Useful for rendering a line chart of spending evolution throughout the year.
 *
 * @returns {Promise<{ trend: Array<{ month: string, total: number }> }>}
 * @throws {Error} If the request fails or the server returns an error.
 */
export async function getTrend() {
  try {
    const response = await api.get("/api/trend");
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ?? "No se pudo cargar la tendencia mensual."
    );
  }
}

/**
 * Fetch all individual transaction rows from Google Sheets.
 *
 * Optionally filter by month and/or person to reduce the payload.
 * The `tipo` field is 'ingreso' or 'gasto'; `fecha` is 'YYYY-MM-DD'.
 *
 * @param {string|null} month  - Spanish month name, e.g. "Mayo". Null for all months.
 * @param {string|null} person - Person name as in tab headers. Null for all people.
 * @returns {Promise<{ transactions: Array<{ id, fecha, categoria, descripcion, monto, persona, mes, tipo }> }>}
 * @throws {Error} If the request fails or the server returns an error.
 */
export async function getTransactions(month = null, person = null) {
  try {
    const params = {};
    if (month)  params.month  = month;
    if (person) params.person = person;
    const response = await api.get("/api/transactions", { params });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ?? "No se pudieron cargar las transacciones."
    );
  }
}

/**
 * Fetch the list of persons tracked in the household.
 *
 * Returns display names (as in sheet tab headers) and their lowercase IDs
 * for use as filter keys in the frontend.
 *
 * @returns {Promise<{ personas: Array<{ id: string, nombre: string }> }>}
 * @throws {Error} If the request fails or the server returns an error.
 */
export async function getPersonas() {
  try {
    const response = await api.get("/api/personas");
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.detail ?? "No se pudieron cargar los usuarios."
    );
  }
}
