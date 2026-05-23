/**
 * Budget.jsx — Presupuesto mensual por categoría + gestión de deudas.
 *
 * Pestañas:
 *   "Presupuesto" — Lista de categorías con monto presupuestado y gastado.
 *                   Edición inline por usuario. Vista Pareja suma ambos montos.
 *   "Deudas"      — Cards de deudas con abonos y barra de progreso.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';

import { useAppContext } from '../context/AppContext.jsx';
import { filterTxns } from '../data/seed.js';
import {
  getBudgetSupabase, upsertBudget,
  getDebts, createDebt, deleteDebt, addDebtPayment, deleteDebtPayment,
} from '../api/client.js';
import { fmt } from './Dashboard.jsx';
import Avatar from '../components/Avatar.jsx';
import MonthNav from '../components/MonthNav.jsx';
import UserToggle from '../components/UserToggle.jsx';
import Modal from '../components/Modal.jsx';

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const DEBT_COLORS = ['#dc2626','#f97316','#eab308','#22c55e','#6366f1','#ec4899','#06b6d4'];

// ── Inline-editable budget amount cell ───────────────────────────────────────
function BudgetCell({ categoryId, amount, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(String(amount));
  const inputRef = useRef();

  useEffect(() => { if (!editing) setVal(String(amount)); }, [amount, editing]);

  const commit = () => {
    setEditing(false);
    const num = parseInt(val.replace(/\D/g, ''), 10) || 0;
    onSave(categoryId, num);
  };

  if (!editable) {
    return (
      <span className="mono" style={{ fontSize: 13, color: amount > 0 ? 'var(--text)' : 'var(--text-mute)' }}>
        {amount > 0 ? fmt(amount, { compact: true }) : '—'}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="input mono"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') inputRef.current.blur(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        style={{ width: 110, textAlign: 'right', padding: '3px 8px', fontSize: 13 }}
      />
    );
  }

  return (
    <span
      className="mono"
      onClick={() => setEditing(true)}
      title="Click para editar"
      style={{
        fontSize: 13, cursor: 'pointer', padding: '3px 8px', borderRadius: 6,
        border: '1px dashed var(--border)',
        color: amount > 0 ? 'var(--text)' : 'var(--text-mute)',
      }}
    >
      {amount > 0 ? fmt(amount, { compact: true }) : '+ Agregar'}
    </span>
  );
}

// ── Debt card ─────────────────────────────────────────────────────────────────
function DebtCard({ debt, users, onAddPayment, onDelete, onDeletePayment }) {
  const [expanded, setExpanded] = useState(false);
  const pct     = debt.total_amount > 0 ? ((debt.total_amount - debt.pending_amount) / debt.total_amount) * 100 : 0;
  const isPaid  = debt.status === 'paid' || debt.pending_amount === 0;
  const owner   = users.find(u => u.id === debt.user_id);

  return (
    <div className="card" style={{ borderLeft: `4px solid ${debt.color}`, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{debt.name}</span>
              {isPaid && (
                <span className="pill up" style={{ fontSize: 11 }}>Pagada ✓</span>
              )}
            </div>
            {debt.description && (
              <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{debt.description}</div>
            )}
          </div>
          {owner && <Avatar user={owner} />}
        </div>

        {/* Amounts */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendiente</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: isPaid ? 'var(--green)' : 'var(--text)' }}>
              {fmt(debt.pending_amount, { compact: true })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-dim)' }}>
              {fmt(debt.total_amount, { compact: true })}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bar" style={{ marginBottom: 8 }}>
          <div className="bar-fill" style={{
            width: `${Math.min(pct, 100)}%`,
            background: isPaid ? 'var(--green)' : debt.color,
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', display: 'flex', justifyContent: 'space-between', marginBottom: 14 }} className="mono">
          <span>{pct.toFixed(0)}% pagado</span>
          {debt.due_date && <span>Vence: {new Date(debt.due_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isPaid && (
            <button className="btn primary" style={{ fontSize: 13 }} onClick={() => onAddPayment(debt)}>
              <Plus size={14} /> Abonar
            </button>
          )}
          <button
            className="btn ghost"
            style={{ fontSize: 13 }}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {(debt.debt_payments?.length ?? 0)} abonos
          </button>
          <button className="btn" style={{ color: 'var(--red)', marginLeft: 'auto', fontSize: 13 }} onClick={() => onDelete(debt.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Payment history */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
          {(debt.debt_payments ?? []).length === 0 ? (
            <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text-mute)' }}>Sin abonos registrados</div>
          ) : (
            [...(debt.debt_payments ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(p => {
              const paidBy = users.find(u => u.id === p.paid_by);
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 20px', borderBottom: '1px solid var(--border)',
                }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', minWidth: 90 }}>
                    +{fmt(p.amount, { compact: true })}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-mute)', flex: 1 }}>
                    {p.description || '—'} · {new Date(p.date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                  </span>
                  {paidBy && <Avatar user={paidBy} />}
                  <button className="btn" style={{ color: 'var(--text-mute)', padding: '2px 6px' }} onClick={() => onDeletePayment(p.id, debt.id)}>
                    <X size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Payment form ──────────────────────────────────────────────────────────────
function PaymentForm({ debt, users, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ amount: '', date: today, paid_by: users[0]?.id ?? '', description: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.amount) return;
    onSave(debt.id, { ...form, amount: Number(form.amount) });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 13 }}>
        Deuda: <strong>{debt.name}</strong> · Pendiente: <strong className="mono">{fmt(debt.pending_amount, { compact: true })}</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Monto del abono (COP)</label>
          <input type="number" className="input mono" value={form.amount}
            onChange={e => set('amount', e.target.value)} placeholder="0" min="1" required autoFocus />
        </div>
        <div className="field">
          <label className="field-label">Fecha</label>
          <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Quién paga</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {users.map(u => (
            <button key={u.id} type="button" className="btn"
              style={{ flex: 1, justifyContent: 'center', borderColor: form.paid_by === u.id ? u.color : 'var(--border)', background: form.paid_by === u.id ? 'var(--surface-2)' : 'var(--bg-2)' }}
              onClick={() => set('paid_by', u.id)}>
              <Avatar user={u} /> {u.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Descripción <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ej: Cuota 3 de 12" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary">Registrar abono</button>
      </div>
    </form>
  );
}

// ── New debt form ─────────────────────────────────────────────────────────────
function DebtForm({ users, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', total_amount: '', user_id: users[0]?.id ?? '', description: '',
    color: DEBT_COLORS[0], due_date: '', interest_rate: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.total_amount) return;
    onSave({
      ...form,
      total_amount:  Number(form.total_amount),
      interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
      due_date:      form.due_date || null,
      user_id:       form.user_id || null,
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label className="field-label">Nombre de la deuda</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="Ej: Tarjeta Visa, Préstamo carro" autoFocus required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Monto total (COP)</label>
          <input type="number" className="input mono" value={form.total_amount}
            onChange={e => set('total_amount', e.target.value)} placeholder="0" min="1" required />
        </div>
        <div className="field">
          <label className="field-label">Fecha vencimiento <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
          <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Propietario</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {users.map(u => (
            <button key={u.id} type="button" className="btn"
              style={{ flex: 1, justifyContent: 'center', borderColor: form.user_id === u.id ? u.color : 'var(--border)', background: form.user_id === u.id ? 'var(--surface-2)' : 'var(--bg-2)' }}
              onClick={() => set('user_id', u.id)}>
              <Avatar user={u} /> {u.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEBT_COLORS.map(c => (
            <button key={c} type="button" onClick={() => set('color', c)}
              style={{
                width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                outline: form.color === c ? `3px solid ${c}` : '3px solid transparent',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Descripción <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="Ej: Crédito de libre inversión Bancolombia" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary"><Plus size={14} /> Crear deuda</button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Budget() {
  const { users, categories, transactions, userFilter, setUserFilter } = useAppContext();

  const now = new Date();
  const [tab,   setTab]   = useState('budget');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Budget rows from Supabase
  const [budgetRows,    setBudgetRows]    = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(false);

  // Debts from Supabase
  const [debts,        setDebts]        = useState([]);
  const [debtsLoading, setDebtsLoading] = useState(false);

  // Modals
  const [paymentTarget, setPaymentTarget] = useState(null); // debt object for payment modal
  const [showDebtForm,  setShowDebtForm]  = useState(false);

  // ── Load budget ─────────────────────────────────────────────────────────────
  const loadBudget = useCallback(async () => {
    setBudgetLoading(true);
    try {
      // For Pareja view, load all users' rows (no user_id filter)
      const userId = userFilter !== 'all' ? userFilter : null;
      const rows = await getBudgetSupabase(year, month, userId);
      setBudgetRows(rows);
    } catch (err) {
      console.error('Failed to load budget:', err);
    } finally {
      setBudgetLoading(false);
    }
  }, [year, month, userFilter]);

  useEffect(() => { loadBudget(); }, [loadBudget]);

  // ── Load debts ──────────────────────────────────────────────────────────────
  const loadDebts = useCallback(async () => {
    setDebtsLoading(true);
    try {
      const userId = userFilter !== 'all' ? userFilter : null;
      setDebts(await getDebts(userId));
    } catch (err) {
      console.error('Failed to load debts:', err);
    } finally {
      setDebtsLoading(false);
    }
  }, [userFilter]);

  useEffect(() => { if (tab === 'debts') loadDebts(); }, [tab, loadDebts]);

  // ── Spent per category this month (from AppContext transactions) ─────────────
  const spentByCategory = useMemo(() => {
    const monthTxns = filterTxns(transactions, userFilter, year, month)
      .filter(t => t.type === 'expense');
    const out = {};
    monthTxns.forEach(t => {
      out[t.categoryId] = (out[t.categoryId] ?? 0) + t.amount;
    });
    return out;
  }, [transactions, userFilter, year, month]);

  // ── Budget lookup ────────────────────────────────────────────────────────────
  const budgetMap = useMemo(() => {
    if (userFilter === 'all') {
      // Group by category, sum per user
      const map = {};
      budgetRows.forEach(row => {
        if (!map[row.category_id]) map[row.category_id] = { total: 0, byUser: {} };
        map[row.category_id].total += row.amount;
        map[row.category_id].byUser[row.user_id] = row.amount;
      });
      return map;
    }
    // Individual: map category_id → amount
    const map = {};
    budgetRows.forEach(row => { map[row.category_id] = row.amount; });
    return map;
  }, [budgetRows, userFilter]);

  function getBudgetAmount(catId) {
    if (userFilter === 'all') return budgetMap[catId]?.total ?? 0;
    return budgetMap[catId] ?? 0;
  }

  // ── Budget totals ────────────────────────────────────────────────────────────
  const totalBudget = useMemo(() => Object.values(budgetMap).reduce((s, v) => {
    return s + (userFilter === 'all' ? v.total : v);
  }, 0), [budgetMap, userFilter]);

  const totalSpent = useMemo(() => Object.values(spentByCategory).reduce((s, v) => s + v, 0), [spentByCategory]);

  // ── Upsert budget cell ───────────────────────────────────────────────────────
  const handleBudgetSave = useCallback(async (categoryId, amount) => {
    if (userFilter === 'all') return;
    try {
      await upsertBudget({ category_id: categoryId, user_id: userFilter, year, month, amount });
      await loadBudget();
    } catch (err) {
      console.error('Failed to save budget:', err);
    }
  }, [userFilter, year, month, loadBudget]);

  // ── Debt actions ─────────────────────────────────────────────────────────────
  const handleCreateDebt = async (data) => {
    try {
      await createDebt(data);
      setShowDebtForm(false);
      await loadDebts();
    } catch (err) { console.error(err); }
  };

  const handleDeleteDebt = async (id) => {
    if (!confirm('¿Eliminar esta deuda y todos sus abonos?')) return;
    try {
      await deleteDebt(id);
      await loadDebts();
    } catch (err) { console.error(err); }
  };

  const handleAddPayment = async (debtId, data) => {
    try {
      await addDebtPayment(debtId, data);
      setPaymentTarget(null);
      await loadDebts();
    } catch (err) { console.error(err); }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await deleteDebtPayment(paymentId);
      await loadDebts();
    } catch (err) { console.error(err); }
  };

  // ── Derived debt totals ──────────────────────────────────────────────────────
  const totalPending = debts.reduce((s, d) => s + d.pending_amount, 0);
  const totalDebt    = debts.reduce((s, d) => s + d.total_amount,   0);

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="page-title">Presupuesto</h1>
          <div className="page-sub">{MONTHS_LONG[month - 1]} {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {tab === 'budget' && (
            <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          )}
          <UserToggle value={userFilter} onChange={setUserFilter} />
        </div>
      </div>

      {/* Tabs */}
      <div className="seg" style={{ marginBottom: 20, width: 'fit-content' }}>
        <button className={tab === 'budget' ? 'active' : ''} onClick={() => setTab('budget')}>Presupuesto</button>
        <button className={tab === 'debts'  ? 'active' : ''} onClick={() => setTab('debts')}>Deudas</button>
      </div>

      {/* ── BUDGET TAB ────────────────────────────────────────────────────────── */}
      {tab === 'budget' && (
        <>
          {/* KPIs */}
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="kpi-label">Presupuestado</div>
              <div className="kpi-value mono">{fmt(totalBudget, { compact: true })}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Gastado</div>
              <div className="kpi-value mono" style={{ color: totalSpent > totalBudget ? 'var(--red)' : 'var(--text)' }}>
                {fmt(totalSpent, { compact: true })}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Disponible</div>
              <div className="kpi-value mono" style={{ color: (totalBudget - totalSpent) < 0 ? 'var(--red)' : 'var(--green)' }}>
                {fmt(totalBudget - totalSpent, { compact: true, sign: true })}
              </div>
            </div>
          </div>

          {/* Category list */}
          <div className="card flush">
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 120px 140px',
              gap: 12, padding: '10px 20px',
              fontSize: 11, color: 'var(--text-mute)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-2)',
            }}>
              <span>Categoría</span>
              <span style={{ textAlign: 'right' }}>Presupuesto</span>
              <span style={{ textAlign: 'right' }}>Gastado</span>
              <span>Progreso</span>
            </div>

            {budgetLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Cargando…</div>
            ) : categories.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Sin categorías</div>
            ) : categories.map(cat => {
              const budgeted = getBudgetAmount(cat.id);
              const spent    = spentByCategory[cat.id] ?? 0;
              const pct      = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;
              const over     = budgeted > 0 && spent > budgeted;

              // For Pareja view, show each user's contribution
              const byUser   = userFilter === 'all' ? (budgetMap[cat.id]?.byUser ?? {}) : null;

              return (
                <div key={cat.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 120px 140px',
                  gap: 12, padding: '14px 20px',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {/* Category name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: cat.color + '22', color: cat.color,
                      display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0,
                    }}>
                      {cat.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{cat.name}</div>
                      {byUser && Object.keys(byUser).length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                          {Object.entries(byUser).map(([uid, amt]) => {
                            const u = users.find(u => u.id === uid);
                            return u ? (
                              <span key={uid} style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                                <span style={{ color: u.color }}>●</span> {u.name}: {fmt(amt, { compact: true })}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Budget amount (editable in individual view) */}
                  <div style={{ textAlign: 'right' }}>
                    <BudgetCell
                      categoryId={cat.id}
                      amount={budgeted}
                      editable={userFilter !== 'all'}
                      onSave={handleBudgetSave}
                    />
                  </div>

                  {/* Spent */}
                  <div style={{ textAlign: 'right' }}>
                    <span className="mono" style={{ fontSize: 13, color: over ? 'var(--red)' : 'var(--text-dim)' }}>
                      {spent > 0 ? fmt(spent, { compact: true }) : '—'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    {budgeted > 0 ? (
                      <>
                        <div className="bar" style={{ marginBottom: 4 }}>
                          <div className="bar-fill" style={{
                            width: `${pct}%`,
                            background: over
                              ? 'var(--red)'
                              : pct > 85
                                ? 'var(--amber)'
                                : `linear-gradient(90deg, ${cat.color}, ${cat.color}aa)`,
                          }} />
                        </div>
                        <span style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--text-mute)' }} className="mono">
                          {pct.toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
                        {userFilter === 'all' ? '—' : 'Click en presupuesto para agregar'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {userFilter === 'all' && (
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-mute)', textAlign: 'center' }}>
              Selecciona un usuario para editar los montos presupuestados
            </p>
          )}
        </>
      )}

      {/* ── DEBTS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'debts' && (
        <>
          {/* Debt KPIs */}
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="kpi-label">Deuda total</div>
              <div className="kpi-value mono">{fmt(totalDebt, { compact: true })}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Pendiente</div>
              <div className="kpi-value mono" style={{ color: totalPending > 0 ? 'var(--red)' : 'var(--green)' }}>
                {fmt(totalPending, { compact: true })}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Pagado</div>
              <div className="kpi-value mono" style={{ color: 'var(--green)' }}>
                {fmt(totalDebt - totalPending, { compact: true })}
              </div>
            </div>
          </div>

          {/* Add debt button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn primary" onClick={() => setShowDebtForm(true)}>
              <Plus size={16} /> Nueva deuda
            </button>
          </div>

          {/* Debt cards */}
          {debtsLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>Cargando deudas…</div>
          ) : debts.length === 0 ? (
            <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>
              Sin deudas registradas 🎉
            </div>
          ) : (
            <div className="grid grid-2">
              {debts.map(debt => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  users={users}
                  onAddPayment={setPaymentTarget}
                  onDelete={handleDeleteDebt}
                  onDeletePayment={handleDeletePayment}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <Modal open={!!paymentTarget} onClose={() => setPaymentTarget(null)} title="Registrar abono">
        {paymentTarget && (
          <PaymentForm
            debt={paymentTarget}
            users={users}
            onSave={handleAddPayment}
            onCancel={() => setPaymentTarget(null)}
          />
        )}
      </Modal>

      <Modal open={showDebtForm} onClose={() => setShowDebtForm(false)} title="Nueva deuda">
        <DebtForm
          users={users}
          onSave={handleCreateDebt}
          onCancel={() => setShowDebtForm(false)}
        />
      </Modal>
    </div>
  );
}
