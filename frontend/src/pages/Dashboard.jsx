/**
 * Dashboard.jsx — Financial dashboard with 4 Recharts visualizations.
 *
 * Layout: 2×2 CSS Grid.
 *
 * Chart 1 (top-left):  Bar chart — annual budget vs actual spend per category.
 * Chart 2 (top-right): Line chart — total spending per month (trend).
 * Chart 3 (bot-left):  Pie chart  — expense breakdown by category for selected month.
 * Chart 4 (bot-right): Bar chart  — spend comparison between Sofi and Belmont for selected month.
 *
 * State strategy:
 *   budgetData, trendData  — read from AppContext (fetched once on app start).
 *   expensesCache          — read/written via AppContext; each month+person combo
 *                            is fetched at most once per session.
 *   selectedMonth          — local UI state (no value in sharing it globally).
 *   expensesLoading/Error  — local (only relevant while this component is active).
 */

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAppContext } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  planned:  "#6366f1",
  actual:   "#f59e0b",
  trend:    "#10b981",
  person1:  "#3b82f6",
  person2:  "#ec4899",
  pie: [
    "#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ec4899",
    "#8b5cf6", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  ],
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const PEOPLE = ["Sofi", "Belmont"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCOP = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const formatCOPShort = (amount) => {
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000)     return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
};

const copTooltipFormatter = (value) => [formatCOP(value), ""];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState() {
  return <div style={styles.emptyState}><span>Cargando datos…</span></div>;
}

function EmptyState() {
  return <div style={styles.emptyState}><span>No hay datos disponibles</span></div>;
}

function ErrorState({ message }) {
  return <div style={{ ...styles.emptyState, color: "#ef4444" }}><span>⚠ {message}</span></div>;
}

// ---------------------------------------------------------------------------
// Chart 1 — Budget vs Actual
// ---------------------------------------------------------------------------

function BudgetChart({ data, loading, error }) {
  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
        <YAxis tickFormatter={formatCOPShort} tick={{ fontSize: 11 }} width={72} />
        <Tooltip formatter={copTooltipFormatter} />
        <Legend verticalAlign="top" />
        <Bar dataKey="planned" name="Presupuestado" fill={COLORS.planned} radius={[3, 3, 0, 0]} />
        <Bar dataKey="actual"  name="Gastado"       fill={COLORS.actual}  radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart 2 — Monthly trend
// ---------------------------------------------------------------------------

function TrendChart({ data, loading, error }) {
  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatCOPShort} tick={{ fontSize: 11 }} width={72} />
        <Tooltip formatter={copTooltipFormatter} />
        <Legend verticalAlign="top" />
        <Line
          type="monotone"
          dataKey="total"
          name="Total gastado"
          stroke={COLORS.trend}
          strokeWidth={2.5}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart 3 — Expense breakdown for selected month (pie)
// ---------------------------------------------------------------------------

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {name.length > 10 ? `${name.slice(0, 9)}…` : name}
    </text>
  );
}

function ExpensePieChart({ data, loading, error }) {
  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!data || data.length === 0) return <EmptyState />;

  const pieData = data.map((item) => ({ name: item.category, value: item.total }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={120}
          labelLine={false}
          label={PieLabel}
        >
          {pieData.map((_, index) => (
            <Cell key={index} fill={COLORS.pie[index % COLORS.pie.length]} />
          ))}
        </Pie>
        <Tooltip formatter={copTooltipFormatter} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart 4 — People comparison for selected month
// ---------------------------------------------------------------------------

function mergeByCategory(expensesPerson1, expensesPerson2) {
  const map = {};
  for (const item of expensesPerson1) {
    map[item.category] = { category: item.category, [PEOPLE[0]]: item.total, [PEOPLE[1]]: 0 };
  }
  for (const item of expensesPerson2) {
    if (map[item.category]) {
      map[item.category][PEOPLE[1]] = item.total;
    } else {
      map[item.category] = { category: item.category, [PEOPLE[0]]: 0, [PEOPLE[1]]: item.total };
    }
  }
  return Object.values(map).sort(
    (a, b) => (b[PEOPLE[0]] + b[PEOPLE[1]]) - (a[PEOPLE[0]] + a[PEOPLE[1]])
  );
}

function PeopleComparisonChart({ dataPerson1, dataPerson2, loading, error }) {
  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;

  const merged = mergeByCategory(dataPerson1 ?? [], dataPerson2 ?? []);
  if (merged.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={merged} margin={{ top: 8, right: 16, left: 8, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="category" tick={{ fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
        <YAxis tickFormatter={formatCOPShort} tick={{ fontSize: 11 }} width={72} />
        <Tooltip formatter={copTooltipFormatter} />
        <Legend verticalAlign="top" />
        <Bar dataKey={PEOPLE[0]} name={PEOPLE[0]} fill={COLORS.person1} radius={[3, 3, 0, 0]} />
        <Bar dataKey={PEOPLE[1]} name={PEOPLE[1]} fill={COLORS.person2} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // Budget and trend come from AppContext — already fetched, no re-fetching.
  const {
    budgetData,
    trendData,
    isLoadingData,
    dataError,
    expensesCache,
    fetchExpenses,
  } = useAppContext();

  // selectedMonth is local UI state — no need to share it globally.
  const currentMonthIndex = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[currentMonthIndex]);

  // Expenses loading/error are local because they only matter while
  // this component is active and a month-specific fetch is in flight.
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError,   setExpensesError]   = useState(null);

  // Derive the cache keys for the current month selection so we can read
  // the cached expense arrays without prop-drilling the full cache.
  const keyCombined = `${selectedMonth}|all`;
  const keyPerson1  = `${selectedMonth}|${PEOPLE[0]}`;
  const keyPerson2  = `${selectedMonth}|${PEOPLE[1]}`;

  // Fetch expenses for the selected month whenever it changes.
  // fetchExpenses() is a no-op if the data is already in the cache.
  useEffect(() => {
    // Only show a spinner if at least one of the three combos is missing.
    const allCached =
      expensesCache[keyCombined] !== undefined &&
      expensesCache[keyPerson1]  !== undefined &&
      expensesCache[keyPerson2]  !== undefined;

    if (allCached) return;

    setExpensesLoading(true);
    setExpensesError(null);

    Promise.all([
      fetchExpenses(selectedMonth),
      fetchExpenses(selectedMonth, PEOPLE[0]),
      fetchExpenses(selectedMonth, PEOPLE[1]),
    ])
      .catch((err) => setExpensesError(err.message))
      .finally(() => setExpensesLoading(false));
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read current month's data from the cache (empty array until fetched).
  const expensesCombined = expensesCache[keyCombined] ?? [];
  const expensesPerson1  = expensesCache[keyPerson1]  ?? [];
  const expensesPerson2  = expensesCache[keyPerson2]  ?? [];

  return (
    <div style={styles.page}>
      {/* Page header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Dashboard Financiero</h1>

        <div style={styles.monthSelector}>
          <label htmlFor="month-select" style={styles.label}>Mes:</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={styles.select}
          >
            {MONTHS.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2×2 chart grid */}
      <div style={styles.grid}>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Presupuesto vs Gasto real (anual)</h2>
          <BudgetChart
            data={budgetData}
            loading={isLoadingData}
            error={dataError}
          />
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Tendencia mensual</h2>
          <TrendChart
            data={trendData}
            loading={isLoadingData}
            error={dataError}
          />
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Gastos por categoría — {selectedMonth}</h2>
          <ExpensePieChart
            data={expensesCombined}
            loading={expensesLoading}
            error={expensesError}
          />
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Comparación por persona — {selectedMonth}</h2>
          <PeopleComparisonChart
            dataPerson1={expensesPerson1}
            dataPerson2={expensesPerson2}
            loading={expensesLoading}
            error={expensesError}
          />
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    padding: "24px",
    fontFamily: "system-ui, sans-serif",
    backgroundColor: "#f9fafb",
    minHeight: "100%",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "24px",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  monthSelector: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#374151",
  },
  select: {
    padding: "6px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    backgroundColor: "#fff",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "24px",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "20px 24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  },
  cardTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#374151",
    marginTop: 0,
    marginBottom: "16px",
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    color: "#9ca3af",
    fontSize: "0.95rem",
  },
};
