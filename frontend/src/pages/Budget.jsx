/**
 * Budget.jsx — Vista del presupuesto anual.
 *
 * Dos modos:
 *   "Por categoría" — grilla editable categoría × mes.
 *   "Por mes"       — 12 cards con gasto vs presupuesto + barra de progreso.
 *
 * Datos: seed budget del AppContext (editable inline).
 */

import { useMemo, useState } from 'react';

import { useAppContext } from '../context/AppContext.jsx';
import { CATEGORIES } from '../data/categories.js';
import { filterTxns } from '../data/seed.js';
import { fmt } from './Dashboard.jsx';
import UserToggle from '../components/UserToggle.jsx';

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const cats = CATEGORIES.filter(c => c.id !== 'ingreso');

export default function Budget() {
  const { transactions, budget, userFilter, setUserFilter, updateBudget } = useAppContext();

  const [view, setView] = useState('category');
  const [year, setYear] = useState(new Date().getFullYear());

  const userMultiplier = userFilter === 'all' ? 2 : 1;

  // Monthly budget totals
  const monthTotals = useMemo(() => {
    const out = {};
    for (let m = 1; m <= 12; m++) {
      out[m] = cats.reduce((s, c) => s + (budget[c.id]?.[m] || 0), 0) * userMultiplier;
    }
    return out;
  }, [budget, userMultiplier]);

  const annualTotal = Object.values(monthTotals).reduce((s, v) => s + v, 0);

  // Actual spend per month
  const spentByMonth = useMemo(() => {
    const out = {};
    for (let m = 1; m <= 12; m++) {
      const t = filterTxns(transactions, userFilter, year, m);
      out[m] = t.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
    }
    return out;
  }, [transactions, userFilter, year]);

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="page-title">Presupuesto {year}</h1>
          <div className="page-sub">
            Total anual:{' '}
            <span className="mono" style={{ color: 'var(--text)' }}>{fmt(annualTotal, { compact: true })}</span>
            {' · '}{fmt(annualTotal / 12, { compact: true })}/mes promedio
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg">
            <button className={view === 'category' ? 'active' : ''} onClick={() => setView('category')}>Por categoría</button>
            <button className={view === 'month'    ? 'active' : ''} onClick={() => setView('month')}>Por mes</button>
          </div>
          <UserToggle value={userFilter} onChange={setUserFilter} />
        </div>
      </div>

      {/* Category view — editable grid */}
      {view === 'category' && (
        <div className="card flush">
          <div className="budget-table">
            <div className="budget-grid">
              {/* Header */}
              <div className="hd">Categoría</div>
              {MONTHS_SHORT.map(m => (
                <div key={m} className="hd num-cell">{m}</div>
              ))}
              <div className="hd num-cell">Total</div>

              {/* Rows */}
              {cats.map(c => {
                const rowTotal = Array.from({ length: 12 }, (_, i) => (budget[c.id]?.[i + 1] || 0) * userMultiplier).reduce((s, v) => s + v, 0);
                return (
                  <div key={c.id} style={{ display: 'contents' }}>
                    <div className="row-cat">
                      <span className="cat-dot" style={{ background: c.color }} />
                      {c.label}
                    </div>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1;
                      const v = (budget[c.id]?.[m] || 0) * userMultiplier;
                      return (
                        <div key={m} className="num-cell">
                          <input
                            type="number"
                            value={v || ''}
                            onChange={e => updateBudget(c.id, m, e.target.value / userMultiplier)}
                            placeholder="0"
                          />
                        </div>
                      );
                    })}
                    <div className="num-cell total">{fmt(rowTotal, { compact: true })}</div>
                  </div>
                );
              })}

              {/* Footer totals */}
              <div className="row-cat" style={{ fontWeight: 600, borderTop: '2px solid var(--border-2)' }}>Total mes</div>
              {Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                return (
                  <div key={m} className="num-cell total" style={{ borderTop: '2px solid var(--border-2)' }}>
                    {fmt(monthTotals[m], { compact: true })}
                  </div>
                );
              })}
              <div className="num-cell total" style={{ borderTop: '2px solid var(--border-2)', color: 'var(--accent)' }}>
                {fmt(annualTotal, { compact: true })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Month view — 12 cards */}
      {view === 'month' && (
        <div className="grid grid-3">
          {Array.from({ length: 12 }, (_, i) => {
            const m        = i + 1;
            const budgeted = monthTotals[m];
            const spent    = spentByMonth[m];
            const pct      = budgeted > 0 ? (spent / budgeted) * 100 : 0;
            const remaining = budgeted - spent;

            return (
              <div key={m} className="card">
                <div className="card-head">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{year}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{MONTHS_LONG[i]}</div>
                  </div>
                  <span className={`pill ${pct > 100 ? 'down' : pct > 85 ? 'warn' : 'up'}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
                  {fmt(spent, { compact: true })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 10 }} className="mono">
                  de {fmt(budgeted, { compact: true })}
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{
                    width: `${Math.min(pct, 100)}%`,
                    background: pct > 100 ? 'var(--red)' : pct > 85 ? 'var(--amber)' : 'linear-gradient(90deg, #6366f1, #a78bfa)',
                  }} />
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }} className="mono">
                  <span>Restante</span>
                  <span style={{ color: remaining < 0 ? 'var(--red)' : 'var(--text)' }}>
                    {fmt(remaining, { compact: true, sign: true })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
