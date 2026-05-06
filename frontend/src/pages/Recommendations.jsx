/**
 * Recommendations.jsx — Análisis IA con recomendaciones determinísticas.
 *
 * En producción: enviar el resumen mensual a la API /api/chat con un prompt
 * de financial coach y renderizar la respuesta aquí.
 *
 * Por ahora: reglas determinísticas sobre los datos seed (idénticas al prototipo).
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Bell, PiggyBank, Sparkles, Target, TrendingUp } from 'lucide-react';

import { useAppContext } from '../context/AppContext.jsx';
import { CATEGORIES } from '../data/categories.js';
import { filterTxns } from '../data/seed.js';
import { fmt } from './Dashboard.jsx';
import MonthNav from '../components/MonthNav.jsx';
import UserToggle from '../components/UserToggle.jsx';

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function Recommendations() {
  const { transactions, budget, userFilter, setUserFilter } = useAppContext();

  const [year,  setYear]  = useState(2026);
  const [month, setMonth] = useState(5);

  const userMultiplier = userFilter === 'all' ? 2 : 1;

  const txns   = useMemo(() => filterTxns(transactions, userFilter, year, month), [transactions, userFilter, year, month]);
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income  = txns.filter(t => t.category === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const savings = txns.filter(t => t.category === 'ahorro').reduce((s, t) => s + t.amount, 0);

  const budgetTotal = Object.values(budget).reduce((s, m) => s + (m[month] || 0), 0) * userMultiplier;

  const byCat = useMemo(() => {
    const map = {};
    txns.filter(t => t.type === 'expense').forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [txns]);

  const sortedCats = Object.entries(byCat)
    .map(([id, v]) => ({ id, v, ...CATEGORIES.find(c => c.id === id) }))
    .sort((a, b) => b.v - a.v);

  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevTxns  = useMemo(() => filterTxns(transactions, userFilter, prevYear, prevMonth), [transactions, userFilter, prevYear, prevMonth]);
  const prevExpense = prevTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // Days
  const now        = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth  = (now.getMonth() + 1 === month && now.getFullYear() === year) ? now.getDate() : 28;
  const projected   = (expense / Math.max(dayOfMonth, 1)) * daysInMonth;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  // Build recommendations
  const recs = useMemo(() => {
    const out = [];

    // Overspending
    CATEGORIES.filter(c => c.id !== 'ingreso').forEach(c => {
      const spent    = byCat[c.id] || 0;
      const budgeted = (budget[c.id]?.[month] || 0) * userMultiplier;
      if (budgeted > 0 && spent > budgeted) {
        out.push({
          priority: 1,
          type: 'warn',
          icon: <AlertTriangle size={18} />,
          title: `${c.label}: presupuesto excedido`,
          body: `Gastaste ${fmt(spent, { compact: true })} de los ${fmt(budgeted, { compact: true })} presupuestados (${Math.round((spent / budgeted) * 100)}%). Sobrepaso de ${fmt(spent - budgeted, { compact: true })}.`,
          action: 'Ajustar presupuesto',
        });
      }
    });

    // Projection
    if (budgetTotal > 0) {
      out.push({
        priority: 2,
        type: 'proj',
        icon: <TrendingUp size={18} />,
        title: 'Proyección al cierre del mes',
        body: `Al ritmo actual cerrarás en ${fmt(projected, { compact: true })}. ${projected > budgetTotal
          ? `Excederás el presupuesto en ${fmt(projected - budgetTotal, { compact: true })}.`
          : `Quedarás ${fmt(budgetTotal - projected, { compact: true })} bajo presupuesto. ¡Vas bien!`}`,
        action: 'Ver detalle',
      });
    }

    // Savings tip
    if (sortedCats[0]) {
      out.push({
        priority: 3,
        type: 'tip',
        icon: <PiggyBank size={18} />,
        title: `Reducir ${sortedCats[0].label}`,
        body: `Es tu mayor gasto este mes (${fmt(sortedCats[0].v, { compact: true })}). Recortar 20% liberaría ${fmt(sortedCats[0].v * 0.2, { compact: true })} para ahorro o pago de deudas.`,
        action: 'Crear meta',
      });
    }

    // Month comparison
    if (prevExpense > 0) {
      const delta    = expense - prevExpense;
      const deltaPct = (delta / prevExpense) * 100;
      out.push({
        priority: 4,
        type: delta > 0 ? 'warn' : 'up',
        icon: delta > 0 ? <ArrowUp size={18} /> : <ArrowDown size={18} />,
        title: `Comparación con ${MONTHS_LONG[prevMonth - 1]}`,
        body: `Gastos ${delta > 0 ? 'aumentaron' : 'disminuyeron'} ${Math.abs(deltaPct).toFixed(1)}% (${fmt(Math.abs(delta), { compact: true })}) frente a ${MONTHS_LONG[prevMonth - 1]}. ${delta > 0 ? 'Revisa qué cambió este mes.' : '¡Felicitaciones por la mejora!'}`,
        action: 'Ver comparación',
      });
    }

    // Savings rate
    if (income > 0) {
      out.push({
        priority: 5,
        type: savingsRate >= 20 ? 'up' : 'tip',
        icon: <Target size={18} />,
        title: `Tasa de ahorro: ${savingsRate.toFixed(1)}%`,
        body: savingsRate >= 20
          ? `¡Excelente! Estás ahorrando ${savingsRate.toFixed(0)}% de tus ingresos, por encima del 20% recomendado.`
          : `Estás ahorrando ${savingsRate.toFixed(0)}% de tus ingresos. La meta saludable es 20%. Considera aumentar a ${fmt(income * 0.2, { compact: true })}/mes.`,
        action: 'Definir meta',
      });
    }

    // Subscriptions
    const subs = byCat['suscripciones'] || 0;
    if (subs > 0) {
      out.push({
        priority: 6,
        type: 'tip',
        icon: <Bell size={18} />,
        title: 'Revisa tus suscripciones',
        body: `Llevas ${fmt(subs, { compact: true })} en suscripciones este mes. Cancelar las que no usas puede ahorrarte cientos de miles al año.`,
        action: 'Revisar',
      });
    }

    return out.sort((a, b) => a.priority - b.priority);
  }, [byCat, budget, budgetTotal, expense, income, prevExpense, projected, savingsRate, sortedCats, month, userMultiplier, prevMonth]);

  const warns = recs.filter(r => r.type === 'warn').length;
  const tips  = recs.filter(r => r.type === 'tip').length;

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={26} /> Recomendaciones IA
          </h1>
          <div className="page-sub">Análisis inteligente · {MONTHS_LONG[month - 1]} {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          <UserToggle value={userFilter} onChange={setUserFilter} />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(167,139,250,0.05))',
          borderColor: 'rgba(129,140,248,0.3)',
        }}>
          <div className="kpi-label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Sparkles size={12} /> Estado del mes
          </div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {budgetTotal > 0 && expense > budgetTotal ? 'Excediendo'
              : budgetTotal > 0 && expense > budgetTotal * 0.85 ? 'Atención'
              : 'En curso'}
          </div>
          <div className="kpi-foot">
            {budgetTotal > 0 ? `${Math.round(expense / budgetTotal * 100)}% del presupuesto usado` : 'Define tu presupuesto'}
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Tasa de ahorro</div>
          <div className="kpi-value mono" style={{ color: 'var(--accent)' }}>{savingsRate.toFixed(1)}%</div>
          <div className="kpi-foot">Meta sugerida: 20%</div>
        </div>
        <div className="card">
          <div className="kpi-label">Recomendaciones activas</div>
          <div className="kpi-value">{recs.length}</div>
          <div className="kpi-foot">{warns} alertas · {tips} sugerencias</div>
        </div>
      </div>

      {/* Recommendation cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {recs.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className={`insight-icon ${r.type}`} style={{ width: 44, height: 44, fontSize: 18, flexShrink: 0 }}>
              {r.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{r.title}</div>
              <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.55 }}>{r.body}</div>
            </div>
            <button className="btn sm" style={{ flexShrink: 0 }}>{r.action} →</button>
          </div>
        ))}
      </div>
    </div>
  );
}
