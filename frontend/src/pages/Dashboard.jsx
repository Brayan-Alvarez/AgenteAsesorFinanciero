/**
 * Dashboard.jsx — Resumen mensual con KPIs, presupuesto, gráficas y recomendaciones IA.
 *
 * Datos:
 *   - KPIs, donut, tendencia, últimas transacciones → AppContext (Supabase transactions)
 *   - Categorías vs presupuesto, budget total → /api/summary/budget (Supabase)
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, PiggyBank, Plus, Sparkles, TrendingUp } from 'lucide-react';

import { useAppContext } from '../context/AppContext.jsx';
import { filterTxns } from '../data/seed.js';
import { getBudgetSummary } from '../api/client.js';
import Avatar from '../components/Avatar.jsx';
import DonutChart from '../components/DonutChart.jsx';
import MonthNav from '../components/MonthNav.jsx';
import TrendBarChart from '../components/TrendBarChart.jsx';
import UserToggle from '../components/UserToggle.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function fmt(n, { compact = false, sign = false } = {}) {
  if (n == null || isNaN(n)) return '$0';
  const abs = Math.abs(n);
  let s;
  if (compact && abs >= 1_000_000) s = `$${(n / 1_000_000).toFixed(1)}M`;
  else if (compact && abs >= 1_000) s = `$${Math.round(n / 1_000)}k`;
  else s = '$' + Math.round(n).toLocaleString('es-CO');
  if (sign && n > 0) s = '+' + s;
  return s;
}

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard({ openTxnForm }) {
  const { transactions, categories, subscriptions, userFilter, setUserFilter, getUser, isLoadingTxns } = useAppContext();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Budget summary from Supabase: [{ name, planned, actual, remaining, pct_used, color, icon }]
  const [budgetSummary,    setBudgetSummary]    = useState([]);
  const [isLoadingBudget,  setIsLoadingBudget]  = useState(false);

  useEffect(() => {
    async function fetchBudget() {
      setIsLoadingBudget(true);
      try {
        const userId = userFilter !== 'all' ? userFilter : null;
        const res    = await getBudgetSummary(year, month, userId);
        setBudgetSummary(res.categories || []);
      } catch (err) {
        console.error('Failed to fetch budget summary:', err);
        setBudgetSummary([]);
      } finally {
        setIsLoadingBudget(false);
      }
    }
    fetchBudget();
  }, [year, month, userFilter]);

  // Helper: look up category by ID from AppContext
  const getCatById = (id) =>
    categories.find(c => c.id === id) ?? { name: '?', icon: '📦', color: '#94a3b8' };

  // ── Current month transactions ─────────────────────────────────────────────
  const txnsMonth = useMemo(
    () => filterTxns(transactions, userFilter, year, month),
    [transactions, userFilter, year, month],
  );

  const incomeTotal  = txnsMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = txnsMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  // Savings = expense transactions in the "Ahorro" category (transfers to savings account)
  const savings      = txnsMonth.filter(t => t.type === 'expense' && t.category === 'Ahorro').reduce((s, t) => s + t.amount, 0);
  const balance      = incomeTotal - expenseTotal;

  // ── Budget totals from Supabase summary ────────────────────────────────────
  // /api/summary/budget only returns manually-set budget rows, so we add the
  // subscription auto-budget on top (same logic as Budget.jsx subsAmountForView).
  const subsCatId = useMemo(
    () => categories.find(c => c.name === 'Suscripciones')?.id,
    [categories],
  );
  const subsAutoTotal = useMemo(() => {
    if (!subsCatId) return 0;
    const userId = userFilter !== 'all' ? userFilter : null;
    return subscriptions
      .filter(s => s.category_id === subsCatId)
      .filter(s => !userId || !s.user_id || s.user_id === userId)
      .reduce((sum, s) => sum + s.amount, 0);
  }, [subscriptions, subsCatId, userFilter]);
  const budgetTotal = budgetSummary.reduce((s, c) => s + (c.planned || 0), 0) + subsAutoTotal;
  const budgetPct   = budgetTotal > 0 ? (expenseTotal / budgetTotal) * 100 : 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = (now.getMonth() + 1 === month && now.getFullYear() === year) ? now.getDate() : daysInMonth;
  const daysLeft    = daysInMonth - today;

  // ── Previous month delta ───────────────────────────────────────────────────
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevTxns  = useMemo(
    () => filterTxns(transactions, userFilter, prevYear, prevMonth),
    [transactions, userFilter, prevYear, prevMonth],
  );
  const prevExpense  = prevTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const expenseDelta = prevExpense > 0 ? ((expenseTotal - prevExpense) / prevExpense) * 100 : 0;

  // ── Spend by category (donut) ──────────────────────────────────────────────
  const spendByCat = useMemo(() => {
    const map = {};
    txnsMonth.filter(t => t.type === 'expense').forEach(t => {
      if (!map[t.categoryId]) {
        const cat = getCatById(t.categoryId);
        map[t.categoryId] = { value: 0, color: cat.color, label: cat.name, icon: cat.icon };
      }
      map[t.categoryId].value += t.amount;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [txnsMonth, categories]);

  const donutData = spendByCat.slice(0, 6).map(c => ({ value: c.value, color: c.color, label: c.label }));
  if (spendByCat.length > 6) {
    const rest = spendByCat.slice(6).reduce((s, c) => s + c.value, 0);
    donutData.push({ value: rest, color: '#3b3b5b', label: 'Otros' });
  }

  // ── 6-month trend (from AppContext transactions) ───────────────────────────
  const barData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      let m = month - (5 - i);
      let y = year;
      while (m <= 0) { m += 12; y--; }
      const t       = filterTxns(transactions, userFilter, y, m);
      const expense = t.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
      const sav     = t.filter(x => x.type === 'expense' && x.category === 'Ahorro').reduce((s, x) => s + x.amount, 0);
      return {
        label: MONTHS_SHORT[m - 1],
        segments: [
          { value: expense, color: '#6366f1', label: 'Gastos' },
          { value: sav,     color: '#34d399', label: 'Ahorro' },
        ],
      };
    });
  }, [transactions, userFilter, year, month]);

  const barMax = Math.max(...barData.map(d => d.segments.reduce((s, x) => s + x.value, 0))) * 1.1 || 1;

  // ── Categories vs budget (from Supabase summary) ───────────────────────────
  const catVsBudget = useMemo(() => {
    return budgetSummary
      .filter(c => c.planned > 0 || c.actual > 0)
      .sort((a, b) => b.pct_used - a.pct_used);
  }, [budgetSummary]);

  // ── AI insights (deterministic rules) ─────────────────────────────────────
  const aiInsights = useMemo(() => {
    const out = [];
    catVsBudget.forEach(c => {
      if (c.pct_used > 100 && c.planned > 0 && out.length < 2) {
        out.push({
          type: 'warn',
          icon: <AlertTriangle size={16} />,
          title: `Gasto excesivo en ${c.name}`,
          body: `Llevas ${fmt(c.actual, { compact: true })} de ${fmt(c.planned, { compact: true })} presupuestados (${Math.round(c.pct_used)}%). Considera frenar este rubro.`,
        });
      }
    });
    const projected = (expenseTotal / Math.max(today, 1)) * daysInMonth;
    if (projected > budgetTotal && budgetTotal > 0) {
      out.push({
        type: 'proj',
        icon: <TrendingUp size={16} />,
        title: 'Proyección del mes',
        body: `Al ritmo actual cerrarás en ${fmt(projected, { compact: true })}, ${fmt(projected - budgetTotal, { compact: true })} por encima del presupuesto.`,
      });
    }
    if (Math.abs(expenseDelta) > 10) {
      out.push({
        type: expenseDelta > 0 ? 'warn' : 'up',
        icon: expenseDelta > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />,
        title: `${expenseDelta > 0 ? 'Aumento' : 'Reducción'} vs ${MONTHS_LONG[prevMonth - 1]}`,
        body: `Tus gastos ${expenseDelta > 0 ? 'subieron' : 'bajaron'} ${Math.abs(expenseDelta).toFixed(0)}% comparado con el mes pasado (${fmt(prevExpense, { compact: true })}).`,
      });
    }
    if (spendByCat[0]) {
      out.push({
        type: 'tip',
        icon: <PiggyBank size={16} />,
        title: 'Sugerencia de ahorro',
        body: `Tu mayor gasto es ${spendByCat[0].label} (${fmt(spendByCat[0].value, { compact: true })}). Reducir 15% aquí liberaría ${fmt(spendByCat[0].value * 0.15, { compact: true })}.`,
      });
    }
    return out.slice(0, 4);
  }, [catVsBudget, expenseTotal, budgetTotal, expenseDelta, prevExpense, prevMonth, spendByCat, today, daysInMonth]);

  const recent = txnsMonth.slice(0, 6);

  if (isLoadingTxns) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
        <span>Cargando datos…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="page-title">
            Hola, {userFilter === 'all' ? 'pareja 💜' : (getUser(userFilter)?.name || '')}
          </h1>
          <div className="page-sub">{MONTHS_LONG[month - 1]} {year} · resumen del mes</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          <UserToggle value={userFilter} onChange={setUserFilter} />
          <button className="btn primary" onClick={() => openTxnForm()}>
            <Plus size={16} /> Nueva
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="kpi-label">Ingresos</div>
          <div className="kpi-value mono" style={{ color: 'var(--green)' }}>{fmt(incomeTotal, { compact: true })}</div>
          <div className="kpi-foot">{txnsMonth.filter(t => t.type === 'income').length} transacciones</div>
        </div>
        <div className="card">
          <div className="kpi-label">Gastos</div>
          <div className="kpi-value mono">{fmt(expenseTotal, { compact: true })}</div>
          <div className="kpi-foot">
            <span className={`pill ${expenseDelta > 0 ? 'down' : 'up'}`}>
              {expenseDelta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
              {Math.abs(expenseDelta).toFixed(0)}%
            </span>
            vs mes anterior
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Balance</div>
          <div className="kpi-value mono" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmt(balance, { compact: true, sign: true })}
          </div>
          <div className="kpi-foot">Ingresos − Gastos</div>
        </div>
        <div className="card">
          <div className="kpi-label">Ahorro</div>
          <div className="kpi-value mono" style={{ color: 'var(--accent)' }}>{fmt(savings, { compact: true })}</div>
          <div className="kpi-foot">{incomeTotal > 0 ? Math.round(savings / incomeTotal * 100) : 0}% de ingresos</div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Gastos vs presupuesto general</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em' }} className="mono">
              {fmt(expenseTotal, { compact: true })}{' '}
              <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>/ {fmt(budgetTotal, { compact: true })}</span>
            </div>
          </div>
          {isLoadingBudget ? (
            <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>Cargando…</span>
          ) : (
            <span className={`pill ${budgetPct > 100 ? 'down' : budgetPct > 85 ? 'warn' : 'up'}`}>
              {budgetPct.toFixed(0)}% usado
            </span>
          )}
        </div>
        <div className="bar" style={{ height: 10 }}>
          <div className="bar-fill" style={{
            width: `${Math.min(budgetPct, 100)}%`,
            background: budgetPct > 100 ? 'var(--red)' : budgetPct > 85 ? 'var(--amber)' : 'linear-gradient(90deg, #6366f1, #a78bfa)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-mute)' }}>
          <span>{fmt(Math.max(budgetTotal - expenseTotal, 0), { compact: true })} restante</span>
          <span>Faltan {Math.max(daysLeft, 0)} días</span>
        </div>
      </div>

      {/* Donut + AI insights */}
      <div className="grid grid-12" style={{ marginBottom: 20 }}>
        <div className="col-8">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Gastos por categoría</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'center' }}>
              <DonutChart
                data={donutData}
                centerLabel="Total mes"
                centerValue={fmt(expenseTotal, { compact: true })}
              />
              <div className="legend">
                {donutData.slice(0, 7).map((d, i) => (
                  <div key={i} className="legend-row">
                    <span className="cat-dot" style={{ background: d.color, width: 10, height: 10 }} />
                    <span className="name">{d.label}</span>
                    <span className="pct mono">{fmt(d.value, { compact: true })}</span>
                    <span style={{ color: 'var(--text-mute)', fontSize: 12, minWidth: 36, textAlign: 'right' }} className="mono">
                      {expenseTotal > 0 ? Math.round(d.value / expenseTotal * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-4">
          <div className="card" style={{ height: '100%' }}>
            <div className="card-head">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Sparkles size={14} /> Recomendaciones IA
              </div>
            </div>
            <div>
              {aiInsights.length === 0 && (
                <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>Sin alertas este mes 🎉</div>
              )}
              {aiInsights.map((ins, i) => (
                <div key={i} className="insight">
                  <div className={`insight-icon ${ins.type}`}>{ins.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="insight-title">{ins.title}</div>
                    <div className="insight-body">{ins.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trend + Categories vs Budget */}
      <div className="grid grid-12" style={{ marginBottom: 20 }}>
        <div className="col-6">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Tendencia 6 meses</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-dim)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1', display: 'inline-block' }} /> Gastos
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399', display: 'inline-block' }} /> Ahorro
                </span>
              </div>
            </div>
            <TrendBarChart data={barData} max={barMax} />
          </div>
        </div>

        <div className="col-6">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Categorías vs presupuesto</div>
            </div>
            {isLoadingBudget ? (
              <div style={{ color: 'var(--text-mute)', fontSize: 13, padding: '8px 0' }}>Cargando…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {catVsBudget.slice(0, 6).map(c => (
                  <div key={c.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="cat-dot" style={{ background: c.color, width: 9, height: 9 }} />
                        {c.icon} {c.name}
                      </span>
                      <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                        <span style={{ color: c.pct_used > 100 ? 'var(--red)' : 'var(--text)' }}>{fmt(c.actual, { compact: true })}</span>
                        <span> / {fmt(c.planned, { compact: true })}</span>
                      </span>
                    </div>
                    <div className="bar">
                      <div className="bar-fill" style={{
                        width: `${Math.min(c.pct_used, 100)}%`,
                        background: c.pct_used > 100 ? 'var(--red)' : c.pct_used > 85 ? 'var(--amber)' : c.color,
                      }} />
                    </div>
                  </div>
                ))}
                {catVsBudget.length === 0 && (
                  <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>Sin presupuesto configurado para este mes.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card flush">
        <div style={{ padding: '20px 22px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">Últimas transacciones</div>
          <a href="/transacciones" className="card-action">Ver todas →</a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Usuario</th>
              <th>Fecha</th>
              <th className="amt">Monto</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(t => {
              const u   = getUser(t.userId) ?? t.user;
              const cat = categories.find(c => c.id === t.categoryId)
                       ?? { name: t.category, icon: '📦', color: '#94a3b8' };
              return (
                <tr key={t.id} onClick={() => openTxnForm(t)} style={{ cursor: 'pointer' }}>
                  <td>{t.desc}</td>
                  <td>
                    <span className="cat-chip">
                      <span className="cat-dot" style={{ background: cat.color }} />
                      {cat.icon} {cat.name}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <Avatar user={u} /> {u?.name}
                    </span>
                  </td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                    {t.date.slice(8, 10)}/{t.date.slice(5, 7)}
                  </td>
                  <td className="amt mono" style={{ color: t.type === 'income' ? 'var(--green)' : 'var(--text)' }}>
                    {t.type === 'income' ? '+' : '−'}{fmt(t.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
