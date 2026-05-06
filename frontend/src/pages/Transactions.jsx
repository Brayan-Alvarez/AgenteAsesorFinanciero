/**
 * Transactions.jsx — Lista completa de transacciones filtrable por mes, usuario y categoría.
 * Datos: seed transactions del AppContext (CRUD interactivo).
 */

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';

import { useAppContext } from '../context/AppContext.jsx';
import { CATEGORIES, getCat, getUser } from '../data/categories.js';
import { filterTxns } from '../data/seed.js';
import { fmt } from './Dashboard.jsx';
import Avatar from '../components/Avatar.jsx';
import MonthNav from '../components/MonthNav.jsx';
import UserToggle from '../components/UserToggle.jsx';

const MONTHS_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

export default function Transactions({ openTxnForm }) {
  const { transactions, userFilter, setUserFilter } = useAppContext();

  const [year,      setYear]      = useState(2026);
  const [month,     setMonth]     = useState(5);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const txns = useMemo(() => {
    let list = filterTxns(transactions, userFilter, year, month);
    if (search)           list = list.filter(t => t.desc.toLowerCase().includes(search.toLowerCase()));
    if (catFilter !== 'all') list = list.filter(t => t.category === catFilter);
    return list;
  }, [transactions, userFilter, year, month, search, catFilter]);

  const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = txns.filter(t => t.type === 'income' && t.category === 'ingreso').reduce((s, t) => s + t.amount, 0);

  // Group by date descending
  const grouped = useMemo(() => {
    const g = {};
    txns.forEach(t => { (g[t.date] = g[t.date] || []).push(t); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [txns]);

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="page-title">Transacciones</h1>
          <div className="page-sub">{txns.length} movimientos · {MONTHS_LONG[month - 1]} {year}</div>
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
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="kpi-label">Ingresos del mes</div>
          <div className="kpi-value mono" style={{ color: 'var(--green)' }}>{fmt(totalIncome, { compact: true })}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Gastos del mes</div>
          <div className="kpi-value mono">{fmt(totalExpense, { compact: true })}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Balance</div>
          <div className="kpi-value mono" style={{ color: (totalIncome - totalExpense) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmt(totalIncome - totalExpense, { compact: true, sign: true })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)', pointerEvents: 'none' }} />
          <input
            className="input"
            placeholder="Buscar transacción..."
            style={{ paddingLeft: 36 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 'auto', minWidth: 180 }}
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

      {/* Grouped transaction list */}
      <div className="card flush">
        {grouped.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>
            No hay transacciones para mostrar
          </div>
        ) : grouped.map(([date, list]) => {
          const d        = new Date(date + 'T12:00:00');
          const dayTotal = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

          return (
            <div key={date}>
              {/* Day header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '14px 22px',
                background: 'var(--bg-2)',
                fontSize: 12, color: 'var(--text-mute)',
                fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)',
              }}>
                <span>{DAYS_SHORT[d.getDay()]} {d.getDate()} de {MONTHS_LONG[d.getMonth()]}</span>
                <span className="mono">−{fmt(dayTotal, { compact: true })}</span>
              </div>

              {/* Day rows */}
              <table>
                <tbody>
                  {list.map(t => {
                    const u   = getUser(t.userId);
                    const cat = getCat(t.category);
                    return (
                      <tr key={t.id} onClick={() => openTxnForm(t)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: 52 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: cat.color + '22', color: cat.color,
                            display: 'grid', placeItems: 'center', fontSize: 16,
                          }}>
                            {cat.icon}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{t.desc}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{cat.label}</div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
                            <Avatar user={u} /> {u?.name}
                          </span>
                        </td>
                        <td className="amt mono" style={{ color: t.type === 'income' ? 'var(--green)' : 'var(--text)', fontWeight: 500 }}>
                          {t.type === 'income' ? '+' : '−'}{fmt(t.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
