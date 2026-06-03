/**
 * Transactions.jsx — Lista completa de transacciones filtrable por mes, usuario y categoría.
 *
 * Multi-select: click en el ícono de categoría para seleccionar.
 * Con items seleccionados aparece una barra flotante con:
 *   - Duplicar al mes siguiente (mismo día, mismos campos)
 *   - Eliminar seleccionadas
 * Sin selección, click en fila abre el modal de edición (donde también está el botón eliminar).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, Search, Trash2, X } from 'lucide-react';

import { useAppContext } from '../context/AppContext.jsx';
import { filterTxns } from '../data/seed.js';
import { fmt } from './Dashboard.jsx';
import Avatar from '../components/Avatar.jsx';
import MonthNav from '../components/MonthNav.jsx';
import UserToggle from '../components/UserToggle.jsx';

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// Advance a date by one month, clamping the day to the last day of the new month.
function nextMonthDate(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export default function Transactions({ openTxnForm }) {
  const {
    transactions, categories, userFilter, setUserFilter, getUser, isLoadingTxns,
    addTransaction, deleteTransaction,
  } = useAppContext();

  const now = new Date();
  const [year,      setYear]      = useState(now.getFullYear());
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('all');

  // ── Selection state ───────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [hoveredId,   setHoveredId]   = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  // Clear selection whenever filters change so stale ids don't linger.
  useEffect(() => { setSelectedIds(new Set()); }, [year, month, userFilter, catFilter, search]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Filtered transactions ─────────────────────────────────────────────────────
  const txns = useMemo(() => {
    let list = filterTxns(transactions, userFilter, year, month);
    if (search)              list = list.filter(t => t.desc.toLowerCase().includes(search.toLowerCase()));
    if (catFilter !== 'all') list = list.filter(t => t.categoryId === catFilter);
    return list;
  }, [transactions, userFilter, year, month, search, catFilter]);

  const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const grouped = useMemo(() => {
    const g = {};
    txns.forEach(t => { (g[t.date] = g[t.date] || []).push(t); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [txns]);

  // ── Bulk actions ──────────────────────────────────────────────────────────────
  const duplicateToNextMonth = useCallback(async () => {
    const selected = txns.filter(t => selectedIds.has(t.id));
    setDuplicating(true);
    try {
      await Promise.all(selected.map(t =>
        addTransaction({
          userId:        t.userId,
          date:          nextMonthDate(t.date),
          categoryId:    t.categoryId,
          subcategoryId: t.subcategoryId ?? null,
          desc:          t.desc,
          amount:        t.amount,
          type:          t.type,
          notes:         t.notes ?? null,
        })
      ));
      clearSelection();
    } catch (err) {
      console.error('Failed to duplicate transactions:', err);
    } finally {
      setDuplicating(false);
    }
  }, [txns, selectedIds, addTransaction, clearSelection]);

  const deleteSelected = useCallback(async () => {
    const n = selectedIds.size;
    if (!confirm(`¿Eliminar ${n} transacción${n !== 1 ? 'es' : ''}? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedIds].map(id => deleteTransaction(id)));
      clearSelection();
    } catch (err) {
      console.error('Failed to delete transactions:', err);
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, deleteTransaction, clearSelection]);

  if (isLoadingTxns) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
        <span>Cargando transacciones…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hasSelection = selectedIds.size > 0;

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
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
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
                    const u       = getUser(t.userId) ?? t.user;
                    const cat     = categories.find(c => c.id === t.categoryId)
                                 ?? { name: t.category, icon: '📦', color: '#94a3b8' };
                    const isSelected = selectedIds.has(t.id);
                    const isHovered  = hoveredId === t.id;

                    return (
                      <tr
                        key={t.id}
                        onClick={() => hasSelection ? toggleSelect(t.id) : openTxnForm(t)}
                        onMouseEnter={() => setHoveredId(t.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'var(--primary)0d' : undefined,
                        }}
                      >
                        {/* Category icon — becomes a checkmark on hover/select */}
                        <td style={{ width: 52 }}>
                          <div
                            onClick={e => { e.stopPropagation(); toggleSelect(t.id); }}
                            title={isSelected ? 'Deseleccionar' : 'Seleccionar'}
                            style={{
                              width: 34, height: 34, borderRadius: 9,
                              display: 'grid', placeItems: 'center', fontSize: 16,
                              cursor: 'pointer',
                              transition: 'background 0.15s',
                              background: isSelected
                                ? 'var(--primary)'
                                : (isHovered || hasSelection)
                                  ? cat.color + '44'
                                  : cat.color + '22',
                              color: isSelected ? '#fff' : cat.color,
                              outline: isSelected ? `2px solid var(--primary)` : 'none',
                              outlineOffset: 2,
                            }}
                          >
                            {isSelected
                              ? <Check size={16} />
                              : (isHovered || hasSelection)
                                ? <Check size={14} style={{ opacity: 0.4 }} />
                                : cat.icon}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 500 }}>
                            {t.desc}
                            {t.subscriptionId && (
                              <span title="Pago automático de suscripción" style={{
                                fontSize: 10, background: 'var(--primary)22', color: 'var(--primary)',
                                border: '1px solid var(--primary)44', borderRadius: 99,
                                padding: '1px 6px', fontWeight: 600, flexShrink: 0,
                              }}>
                                🔄 sub
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{cat.name}</div>
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

      {/* ── Floating bulk-action bar ───────────────────────────────────────────── */}
      {hasSelection && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          zIndex: 100, whiteSpace: 'nowrap',
        }}>
          {/* Count */}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', minWidth: 24 }}>
            {selectedIds.size}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-mute)', marginRight: 4 }}>
            seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>

          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

          {/* Duplicate */}
          <button
            className="btn"
            style={{ fontSize: 13 }}
            onClick={duplicateToNextMonth}
            disabled={duplicating || deleting}
          >
            <Copy size={14} />
            {duplicating ? 'Duplicando…' : 'Duplicar al mes siguiente'}
          </button>

          {/* Delete */}
          <button
            className="btn"
            style={{ fontSize: 13, color: 'var(--red)' }}
            onClick={deleteSelected}
            disabled={duplicating || deleting}
          >
            <Trash2 size={14} />
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

          {/* Clear */}
          <button
            className="btn ghost"
            style={{ padding: '6px 8px' }}
            onClick={clearSelection}
            title="Cancelar selección"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
