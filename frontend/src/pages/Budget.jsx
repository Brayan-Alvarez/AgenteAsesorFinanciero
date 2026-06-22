/**
 * Budget.jsx — Presupuesto mensual por categoría + gestión de deudas + suscripciones.
 *
 * Pestañas:
 *   "Presupuesto"   — Lista de categorías activas con monto y gasto.
 *                     Crear / eliminar categorías y subcategorías.
 *   "Deudas"        — Cards de deudas con abonos y barra de progreso.
 *   "Suscripciones" — Suscripciones recurrentes; generan transacciones automáticamente.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Edit2, Plus, RefreshCw, Trash2, TrendingUp, X } from 'lucide-react';

import { useAppContext } from '../context/AppContext.jsx';
import { filterTxns } from '../data/seed.js';
import {
  getBudgetSupabase, upsertBudget,
  getDebts, createDebt, deleteDebt, addDebtPayment, deleteDebtPayment,
  createCategory, deleteCategory, createSubcategory, deleteSubcategory,
  migrateCategory,
  createSubscription, updateSubscription, cancelSubscription,
  getIncome, upsertIncome, getIncomeHistory, seedIncomeHistory,
  createPrima, updatePrima, deletePrima, processPrimas,
} from '../api/client.js';
import { fmt } from './Dashboard.jsx';
import Avatar from '../components/Avatar.jsx';
import CategorySelector from '../components/CategorySelector.jsx';
import EmojiPicker from '../components/EmojiPicker.jsx';
import MonthNav from '../components/MonthNav.jsx';
import UserToggle from '../components/UserToggle.jsx';
import Modal from '../components/Modal.jsx';

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DEBT_COLORS = ['#dc2626','#f97316','#eab308','#22c55e','#6366f1','#ec4899','#06b6d4'];
const CAT_COLORS  = ['#f59e0b','#22c55e','#ef4444','#3b82f6','#14b8a6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#94a3b8'];

// ── Inline-editable budget cell ───────────────────────────────────────────────
function BudgetCell({ categoryId, amount, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(String(amount));
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

// ── Category creation form ────────────────────────────────────────────────────
function CategoryForm({ currentMaxOrder, onSave, onCancel }) {
  const [form, setForm] = useState({ icon: '📦', name: '', color: CAT_COLORS[0], type: 'variable' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim(), sort_order: currentMaxOrder + 1 });
  };

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label className="field-label">Icono</label>
        <EmojiPicker value={form.icon} onChange={v => set('icon', v)} />
      </div>

      <div className="field">
        <label className="field-label">Nombre</label>
        <input
          className="input"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Ej: Carro propio, Mascotas"
          autoFocus
          required
        />
      </div>

      <div className="field">
        <label className="field-label">Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CAT_COLORS.map(c => (
            <button
              key={c} type="button" onClick={() => set('color', c)}
              style={{
                width: 28, height: 28, borderRadius: '50%', background: c,
                border: 'none', cursor: 'pointer',
                outline: form.color === c ? `3px solid ${c}` : '3px solid transparent',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Tipo</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['variable','Variable'],
            ['fixed',   'Fijo']].map(([val, label]) => (
            <button
              key={val} type="button" className="btn"
              style={{
                flex: 1, justifyContent: 'center', fontSize: 13,
                borderColor: form.type === val ? 'var(--primary)' : 'var(--border)',
                background:  form.type === val ? 'var(--surface-2)' : 'var(--bg-2)',
              }}
              onClick={() => set('type', val)}
            >
              {form.type === val && <Check size={13} />} {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4 }}>
          {form.type === 'variable' ? 'Gastos que cambian mes a mes (comida, transporte...)' : 'Monto constante cada mes (arriendo, suscripciones...)'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary"><Plus size={14} /> Crear categoría</button>
      </div>
    </form>
  );
}

// ── Subcategory creation form ─────────────────────────────────────────────────
function SubcategoryForm({ parentCat, onSave, onCancel, error, saving }) {
  const [form, setForm] = useState({ icon: '📦', name: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <form onSubmit={submit}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 16, padding: '10px 14px',
        background: 'var(--bg-2)', borderRadius: 8, fontSize: 13,
      }}>
        <span style={{ fontSize: 20 }}>{parentCat.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Categoría padre</div>
          <div style={{ fontWeight: 500 }}>{parentCat.name}</div>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Icono</label>
        <EmojiPicker value={form.icon} onChange={v => set('icon', v)} />
      </div>

      <div className="field">
        <label className="field-label">Nombre de la subcategoría</label>
        <input
          className="input"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Ej: Mercado/supermercado, Rappi, Uber"
          autoFocus
          required
        />
      </div>

      {error && (
        <div style={{
          color: 'var(--red)', fontSize: 13, marginTop: 8,
          padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Guardando…' : <><Plus size={14} /> Crear subcategoría</>}
        </button>
      </div>
    </form>
  );
}

// ── Category migration form ───────────────────────────────────────────────────
function MigrationForm({ source, activeCategories, onMigrate, onCancel, saving, error, migrated }) {
  const [catId, setCatId] = useState(activeCategories[0]?.id ?? '');
  const [subId, setSubId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!catId) return;
    onMigrate(source.id, catId, subId);
  };

  return (
    <form onSubmit={submit}>
      {/* Source context */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
        borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', fontSize: 13,
      }}>
        <span style={{ fontSize: 20, opacity: 0.6 }}>{source.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Categoría eliminada
          </div>
          <div style={{ fontWeight: 500, color: 'var(--text-dim)' }}>{source.name}</div>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Mover transacciones a</label>
        <CategorySelector
          categories={activeCategories}
          categoryId={catId}
          subcategoryId={subId}
          onChange={(c, s) => { setCatId(c); setSubId(s); }}
        />
      </div>

      <div style={{
        fontSize: 12, color: 'var(--text-mute)', marginBottom: 16,
        padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6,
      }}>
        Todas las transacciones (incluidas las históricas) con la categoría
        &ldquo;{source.name}&rdquo; quedarán asignadas a la categoría seleccionada.
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
          {error}
        </div>
      )}
      {migrated !== null && (
        <div style={{ color: 'var(--green)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(52,211,153,0.1)', borderRadius: 6 }}>
          ✓ {migrated} transacciones migradas correctamente.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cerrar</button>
        {migrated === null && (
          <button type="submit" className="btn primary" disabled={saving || !catId}>
            {saving ? 'Migrando…' : 'Confirmar migración'}
          </button>
        )}
      </div>
    </form>
  );
}

// ── Amortization helpers (pure functions, no hooks) ───────────────────────────
function monthlyRate(annualRatePct) {
  return (1 + annualRatePct / 100) ** (1 / 12) - 1;
}

/**
 * Given the original principal (P), current remaining balance (B),
 * monthly installment (C) and annual effective rate (r %),
 * derives the number of installments already paid (n) via the French
 * amortization formula and returns total historical interest paid.
 *
 *   B = (P − C/m)·(1+m)^n + C/m  →  n = log((B − C/m)/(P − C/m)) / log(1+m)
 *   interest_paid = n·C − (P − B)
 */
function calcHistoricalInterest(P, B, C, r) {
  if (!r || !C || !P || P <= 0 || B >= P) return 0;
  const m = (1 + r / 100) ** (1 / 12) - 1;
  if (m <= 0) return 0;
  const factor = C / m;
  if (Math.abs(P - factor) < 1) return 0;
  const x = (B - factor) / (P - factor);
  if (x <= 0 || !isFinite(x)) return 0;
  const n = Math.log(x) / Math.log(1 + m);
  if (n <= 0 || !isFinite(n)) return 0;
  return Math.max(Math.round(n * C) - Math.round(P - B), 0);
}
function nextInstallmentBreakdown(debt) {
  if (!debt.installment_amount) return null;
  // Rate = 0 or not set → interest-free, full installment goes to capital
  if (!debt.annual_rate || debt.annual_rate === 0) {
    const capital = Math.min(debt.installment_amount, debt.pending_amount);
    return { capital, interest: 0, total: capital };
  }
  const rate     = monthlyRate(debt.annual_rate);
  const interest = Math.round(debt.pending_amount * rate);
  const capital  = Math.max(Math.min(debt.installment_amount - interest, debt.pending_amount), 0);
  return { capital, interest, total: capital + interest };
}

/**
 * Forward projection: given the current pending balance and installments,
 * calculates remaining months, future interest, total left to pay and
 * estimated payoff date.
 * For bi-weekly debts the monthly payment total = installment_1 + installment_2.
 */
function projectionStats(debt) {
  const balance = debt.pending_amount;
  if (!debt.installment_amount || balance <= 0) return null;

  // Total monthly outflow (1 or 2 payments per month)
  const monthlyPayment = debt.installment_amount +
    (debt.payment_day_2 ? (debt.installment_amount_2 || debt.installment_amount) : 0);

  const rate = debt.annual_rate || 0;
  let monthsRemaining, futureInterest;

  if (rate > 0) {
    const m     = monthlyRate(rate);
    const ratio = m * balance / monthlyPayment;
    if (ratio >= 1) return null; // installment too small — debt never paid off
    monthsRemaining = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + m));
    futureInterest  = Math.max(Math.round(monthsRemaining * monthlyPayment - balance), 0);
  } else {
    monthsRemaining = Math.ceil(balance / monthlyPayment);
    futureInterest  = 0;
  }

  // Estimated payoff calendar date
  const payoff = new Date();
  payoff.setDate(1); // normalize to 1st so month arithmetic works
  payoff.setMonth(payoff.getMonth() + monthsRemaining);

  const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const payoffLabel  = `${MONTHS_SHORT[payoff.getMonth()]} ${payoff.getFullYear()}`;

  return {
    monthsRemaining,
    futureInterest,
    totalToPayoff: balance + futureInterest,
    payoffLabel,
    monthlyPayment,
    hasRate: rate > 0,
  };
}

/**
 * Simulate the effect of a one-time extra capital payment.
 * Returns the comparison between current projection and post-payment projection.
 */
function simulateExtraPayment(debt, extraAmount) {
  if (!extraAmount || extraAmount <= 0 || !debt.installment_amount) return null;
  const balance = debt.pending_amount;
  if (extraAmount >= balance) {
    const current = projectionStats(debt);
    return {
      paysOff:       true,
      monthsSaved:   current?.monthsRemaining ?? 0,
      interestSaved: current?.futureInterest  ?? 0,
      currentMonths: current?.monthsRemaining ?? 0,
      newMonths:     0,
    };
  }
  const current   = projectionStats(debt);
  const projected = projectionStats({ ...debt, pending_amount: balance - extraAmount });
  if (!current || !projected) return null;
  return {
    paysOff:       false,
    currentMonths: current.monthsRemaining,
    newMonths:     projected.monthsRemaining,
    monthsSaved:   current.monthsRemaining - projected.monthsRemaining,
    interestSaved: current.futureInterest  - projected.futureInterest,
    newPayoffLabel: projected.payoffLabel,
    hasRate:        current.hasRate,
  };
}

// ── Debt card ─────────────────────────────────────────────────────────────────
function DebtCard({ debt, users, onAddPayment, onEdit, onDelete, onDeletePayment }) {
  const [expanded, setExpanded] = useState(false);
  const pct        = debt.total_amount > 0 ? (debt.total_capital_paid / debt.total_amount) * 100 : 0;
  const isPaid     = debt.status === 'paid' || debt.pending_amount === 0;
  const owner      = users.find(u => u.id === debt.user_id);
  const nextPayment = nextInstallmentBreakdown(debt);

  return (
    <div className="card" style={{ borderLeft: `4px solid ${debt.color}`, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{debt.name}</span>
              {isPaid && <span className="pill up" style={{ fontSize: 11 }}>Pagada ✓</span>}
              {debt.auto_pay && !isPaid && (() => {
                // Build "Auto · día 10 ($1M) y día 25 ($2M)" label
                const entries = [
                  debt.payment_day ? { day: debt.payment_day, amt: debt.installment_amount } : null,
                  debt.payment_day_2 ? { day: debt.payment_day_2, amt: debt.installment_amount_2 || debt.installment_amount } : null,
                ].filter(Boolean);
                const label = entries.map(e =>
                  `día ${e.day}${e.amt ? ` (${fmt(e.amt, { compact: true })})` : ''}`
                ).join(' y ');
                return (
                  <span style={{ fontSize: 11, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <RefreshCw size={10} />
                    Auto · {label}
                  </span>
                );
              })()}
            </div>
            {debt.description && (
              <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{debt.description}</div>
            )}
          </div>
          {owner && <Avatar user={owner} />}
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendiente</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: isPaid ? 'var(--green)' : 'var(--text)' }}>
              {fmt(debt.pending_amount, { compact: true })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Crédito original</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-dim)' }}>
              {fmt(debt.total_amount, { compact: true })}
            </div>
          </div>
          {debt.total_paid > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total pagado</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-dim)' }}>
                {fmt(debt.total_paid, { compact: true })}
              </div>
            </div>
          )}
        </div>

        {/* Progress bar — based on capital paid vs total */}
        <div className="bar" style={{ marginBottom: 6 }}>
          <div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: isPaid ? 'var(--green)' : debt.color }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }} className="mono">
          <span>{pct.toFixed(0)}% capital pagado</span>
          {debt.due_date && <span>Vence: {new Date(debt.due_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>

        {/* Capital/interest breakdown — always show once at least one payment is tracked */}
        {debt.total_capital_paid > 0 && (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 10, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-mute)' }}>
              Capital pagado: <span className="mono" style={{ color: 'var(--text-dim)' }}>{fmt(debt.total_capital_paid, { compact: true })}</span>
            </span>
            <span style={{ color: 'var(--text-mute)' }}>
              Intereses pagados:{' '}
              <span className="mono" style={{ color: debt.total_interest_paid > 0 ? 'var(--amber)' : 'var(--green)' }}>
                {fmt(debt.total_interest_paid, { compact: true })}
              </span>
              {debt.total_interest_paid === 0 && (
                <span style={{ color: 'var(--green)', marginLeft: 4 }}>✓ sin interés</span>
              )}
            </span>
          </div>
        )}

        {/* Next installment breakdown — shows each payment day separately when amounts differ */}
        {nextPayment && !isPaid && (() => {
          const hasTwoPayments = debt.payment_day_2;
          const amt2 = debt.installment_amount_2 || debt.installment_amount;
          const nextPayment2 = hasTwoPayments ? nextInstallmentBreakdown({ ...debt, installment_amount: amt2 }) : null;
          const monthlyTotal = nextPayment.total + (nextPayment2?.total ?? 0);

          return (
          <div style={{ fontSize: 12, marginBottom: 10, padding: '10px 12px', background: debt.color + '14', borderRadius: 8, border: `1px solid ${debt.color}33` }}>
            <div style={{ fontWeight: 600, color: debt.color, marginBottom: 6 }}>
              Pagos del mes · total {fmt(monthlyTotal, { compact: true })}
            </div>
            {/* Payment 1 */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: hasTwoPayments ? 4 : 0 }}>
              {hasTwoPayments && <span style={{ color: 'var(--text-dim)', minWidth: 48 }}>Día {debt.payment_day}:</span>}
              <span style={{ color: 'var(--text-mute)' }}>{fmt(nextPayment.total, { compact: true })}</span>
              <span style={{ color: 'var(--text-mute)' }}>K: <span className="mono">{fmt(nextPayment.capital, { compact: true })}</span></span>
              {nextPayment.interest > 0
                ? <span style={{ color: 'var(--text-mute)' }}>I: <span className="mono" style={{ color: 'var(--amber)' }}>{fmt(nextPayment.interest, { compact: true })}</span></span>
                : <span style={{ color: 'var(--green)' }}>Sin interés</span>}
            </div>
            {/* Payment 2 (only when configured) */}
            {hasTwoPayments && nextPayment2 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-dim)', minWidth: 48 }}>Día {debt.payment_day_2}:</span>
                <span style={{ color: 'var(--text-mute)' }}>{fmt(nextPayment2.total, { compact: true })}</span>
                <span style={{ color: 'var(--text-mute)' }}>K: <span className="mono">{fmt(nextPayment2.capital, { compact: true })}</span></span>
                {nextPayment2.interest > 0
                  ? <span style={{ color: 'var(--text-mute)' }}>I: <span className="mono" style={{ color: 'var(--amber)' }}>{fmt(nextPayment2.interest, { compact: true })}</span></span>
                  : <span style={{ color: 'var(--green)' }}>Sin interés</span>}
              </div>
            )}
            {debt.annual_rate > 0 && <span style={{ color: 'var(--text-mute)' }}>{debt.annual_rate}% EA</span>}
          </div>
          );
        })()}

        {/* ── Fase 1: Proyección hacia el futuro ──────────────────────────── */}
        {!isPaid && (() => {
          const proj = projectionStats(debt);
          if (!proj) return null;
          return (
            <div style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Proyección · si mantienes los pagos actuales
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Meses restantes</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                    {proj.monthsRemaining}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Fecha estimada de pago</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                    {proj.payoffLabel}
                  </div>
                </div>
                {proj.hasRate && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Intereses futuros</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--amber)' }}>
                      {fmt(proj.futureInterest, { compact: true })}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Total a pagar</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-dim)' }}>
                    {fmt(proj.totalToPayoff, { compact: true })}
                  </div>
                </div>
              </div>
              {proj.hasRate && (
                <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }} className="mono">
                  Cuota mensual {fmt(proj.monthlyPayment, { compact: true })} · {debt.annual_rate}% EA
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ display: 'flex', gap: 8 }}>
          {!isPaid && (
            <button className="btn primary" style={{ fontSize: 13 }} onClick={() => onAddPayment(debt)}>
              <Plus size={14} /> Abonar
            </button>
          )}
          <button className="btn ghost" style={{ fontSize: 13 }} onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {(debt.debt_payments?.length ?? 0)} abonos
          </button>
          <button className="btn" style={{ fontSize: 13 }} onClick={() => onEdit(debt)}>
            <Edit2 size={14} />
          </button>
          <button className="btn" style={{ color: 'var(--red)', marginLeft: 'auto', fontSize: 13 }} onClick={() => onDelete(debt.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
          {(debt.debt_payments ?? []).length === 0 ? (
            <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text-mute)' }}>Sin abonos registrados</div>
          ) : (
            [...(debt.debt_payments ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(p => {
              const paidBy = users.find(u => u.id === p.paid_by);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 80 }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
                      +{fmt(p.amount, { compact: true })}
                    </div>
                    {/* Capital/interest breakdown per payment */}
                    {p.capital_amount != null && (
                      <div style={{ fontSize: 10, color: 'var(--text-mute)' }} className="mono">
                        K:{fmt(p.capital_amount, { compact: true })}
                        {p.interest_amount > 0 && <> · I:{fmt(p.interest_amount, { compact: true })}</>}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-mute)', flex: 1 }}>
                    {p.description || '—'} · {new Date(p.date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    {p.payment_type === 'auto' && <span style={{ color: 'var(--primary)', marginLeft: 4 }}>🔄</span>}
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
    const amount = Number(form.amount);
    // Extra manual payments always go 100% to capital — no interest split.
    onSave(debt.id, { ...form, amount, capital_amount: amount, interest_amount: null });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 13 }}>
        Deuda: <strong>{debt.name}</strong> · Pendiente: <strong className="mono">{fmt(debt.pending_amount, { compact: true })}</strong>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        padding: '7px 12px', borderRadius: 8,
        background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)',
        fontSize: 12, color: 'var(--green)',
      }}>
        <Check size={13} style={{ flexShrink: 0 }} />
        Este abono va directamente a capital — reduce el saldo de la deuda sin intereses.
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

      {/* ── Fase 2: Simulación en vivo ──────────────────────────────────── */}
      {(() => {
        const sim = simulateExtraPayment(debt, Number(form.amount));
        if (!sim) return null;

        if (sim.paysOff) {
          return (
            <div style={{
              padding: '12px 14px', borderRadius: 8, marginBottom: 4,
              background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--green)', marginBottom: 4 }}>
                🎉 ¡Con este abono pagas la deuda por completo!
              </div>
              {sim.monthsSaved > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
                  Te ahorras <strong>{sim.monthsSaved} mes{sim.monthsSaved !== 1 ? 'es' : ''}</strong>
                  {sim.interestSaved > 0 && <> y <strong className="mono" style={{ color: 'var(--amber)' }}>{fmt(sim.interestSaved, { compact: true })}</strong> en intereses</>}.
                </div>
              )}
            </div>
          );
        }

        return (
          <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 4,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Simulación · efecto de este abono
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Sin abono</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-dim)' }}>
                  {sim.currentMonths} meses
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Con este abono</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--green)' }}>
                  {sim.newMonths} meses{sim.newPayoffLabel ? ` · ${sim.newPayoffLabel}` : ''}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Meses que adelantas</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: sim.monthsSaved > 0 ? 'var(--green)' : 'var(--text-mute)' }}>
                  {sim.monthsSaved > 0 ? `−${sim.monthsSaved} mes${sim.monthsSaved !== 1 ? 'es' : ''}` : 'sin cambio'}
                </div>
              </div>
              {sim.hasRate && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Intereses que te ahorras</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: sim.interestSaved > 0 ? 'var(--amber)' : 'var(--text-mute)' }} className="mono">
                    {sim.interestSaved > 0 ? fmt(sim.interestSaved, { compact: true }) : '$0'}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary">Registrar abono</button>
      </div>
    </form>
  );
}

// ── Shared debt form (create and edit) ───────────────────────────────────────
// initial = existing DebtOut object when editing, undefined when creating.
// Historical capital/interest are computed automatically from current_balance
// using French amortization math — the user never enters them manually.
function DebtForm({ initial, users, onSave, onCancel }) {
  const isEdit = !!initial;

  const [form, setForm] = useState(() => ({
    name:               initial?.name               ?? '',
    total_amount:       initial?.total_amount        ? String(initial.total_amount)       : '',
    // "current_balance": the real-world remaining balance right now.
    // For create: what the user currently owes. For edit: pre-fill from pending_amount.
    current_balance:    initial?.pending_amount      ? String(initial.pending_amount)      : '',
    user_id:            initial?.user_id             ?? (users[0]?.id ?? ''),
    description:        initial?.description         ?? '',
    color:              initial?.color               ?? DEBT_COLORS[0],
    due_date:           initial?.due_date            ?? '',
    auto_pay:             initial?.auto_pay              ?? false,
    installment_amount:   initial?.installment_amount    ? String(initial.installment_amount)    : '',
    installment_amount_2: initial?.installment_amount_2  ? String(initial.installment_amount_2)  : '',
    annual_rate:          initial?.annual_rate           ? String(initial.annual_rate)           : '',
    payment_day:          initial?.payment_day           ? String(initial.payment_day)           : '',
    payment_day_2:        initial?.payment_day_2         ? String(initial.payment_day_2)         : '',
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Live preview of calculated historical values.
  // B defaults to P when empty → "brand new debt, no prior payments".
  const P = Number(form.total_amount)       || 0;
  const B = form.current_balance !== '' ? (Number(form.current_balance) || 0) : P;
  const C = Number(form.installment_amount) || 0;
  const r = Number(form.annual_rate)        || 0;
  const previewCapital  = P > 0 && B >= 0 && B < P ? Math.round(P - B) : 0;
  const previewInterest = calcHistoricalInterest(P, B, C, r);

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !P) return;

    // Compute historical fields using the effective B (defaults to P when empty).
    let historical_capital_paid, historical_interest_paid;
    if (isEdit) {
      // In edit mode, subtract already-tracked payments so totals stay correct.
      const trackedCapital  = initial.total_capital_paid  - initial.historical_capital_paid;
      const trackedInterest = initial.total_interest_paid - initial.historical_interest_paid;
      historical_capital_paid  = Math.max(Math.round(P - B) - trackedCapital,  0);
      historical_interest_paid = Math.max(previewInterest  - trackedInterest, 0);
    } else {
      // Create mode: previewCapital = 0 when B = P (no prior payments — correct).
      historical_capital_paid  = previewCapital;
      historical_interest_paid = previewInterest;
    }

    onSave({
      name:                     form.name.trim(),
      total_amount:             P,
      user_id:                  form.user_id  || null,
      description:              form.description.trim() || null,
      color:                    form.color,
      due_date:                 form.due_date || null,
      auto_pay:                 form.auto_pay,
      installment_amount:       C || null,
      installment_amount_2:     Number(form.installment_amount_2) || null,
      annual_rate:              r || null,
      payment_day:              Number(form.payment_day)   || null,
      payment_day_2:            Number(form.payment_day_2) || null,
      historical_capital_paid,
      historical_interest_paid,
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label className="field-label">Nombre de la deuda</label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="Ej: Crédito de libre inversión, Préstamo carro" autoFocus required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Saldo original del crédito (COP)</label>
          <input type="number" className="input mono" value={form.total_amount}
            onChange={e => set('total_amount', e.target.value)} placeholder="0" min="1" required />
        </div>
        <div className="field">
          <label className="field-label">
            Saldo actual <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(vacío = deuda nueva, sin pagos previos)</span>
          </label>
          <input type="number" className="input mono" value={form.current_balance}
            onChange={e => set('current_balance', e.target.value)}
            placeholder="Dejar vacío si es deuda nueva" min="0" />
        </div>
      </div>

      {/* Live preview of auto-calculated historical values */}
      {P > 0 && B >= 0 && B < P && (
        <div style={{
          display: 'flex', gap: 16, fontSize: 12, padding: '8px 12px',
          background: 'var(--bg-2)', borderRadius: 8, marginBottom: 12,
        }}>
          <span style={{ color: 'var(--text-mute)' }}>
            Capital pagado: <strong className="mono" style={{ color: 'var(--text-dim)' }}>
              ${previewCapital.toLocaleString('es-CO')}
            </strong>
          </span>
          {previewInterest > 0 && (
            <span style={{ color: 'var(--text-mute)' }}>
              Intereses pagados: <strong className="mono" style={{ color: 'var(--amber)' }}>
                ${previewInterest.toLocaleString('es-CO')}
              </strong>
              <span style={{ marginLeft: 4 }}>(calculado con tasa EA)</span>
            </span>
          )}
          {previewInterest === 0 && r === 0 && (
            <span style={{ color: 'var(--text-mute)', fontStyle: 'italic' }}>
              Ingresa la tasa EA para calcular intereses históricos
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <label className="field-label">Fecha vencimiento <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
          <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEBT_COLORS.map(c => (
            <button key={c} type="button" onClick={() => set('color', c)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: form.color === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Descripción <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="Ej: Descuento por nómina, Banco Davivienda" />
      </div>

      {/* ── Auto-pay ──────────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.auto_pay ? 12 : 0 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>Cuota automática mensual</div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>Genera una transacción cada mes automáticamente</div>
          </div>
          <button type="button" className="btn"
            style={{ borderColor: form.auto_pay ? 'var(--primary)' : 'var(--border)', background: form.auto_pay ? 'var(--surface-2)' : 'var(--bg-2)', fontSize: 13 }}
            onClick={() => set('auto_pay', !form.auto_pay)}>
            {form.auto_pay ? <><Check size={13} /> Activada</> : 'Activar'}
          </button>
        </div>

        {form.auto_pay && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="field-label">Cuota por pago (COP)</label>
                <input type="number" className="input mono" value={form.installment_amount}
                  onChange={e => set('installment_amount', e.target.value)} placeholder="0" min="1" required={form.auto_pay} />
              </div>
              <div className="field">
                <label className="field-label">1er día de pago</label>
                <input type="number" className="input mono" value={form.payment_day}
                  onChange={e => set('payment_day', e.target.value)} placeholder="Ej: 1" min="1" max="31" />
              </div>
              <div className="field">
                <label className="field-label">Tasa EA % <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(0 = sin interés)</span></label>
                <input type="number" className="input mono" value={form.annual_rate}
                  onChange={e => set('annual_rate', e.target.value)} placeholder="0" step="0.01" min="0" />
              </div>
            </div>
            {/* Second payment — shown when user enters a second day */}
            <div style={{ marginTop: 8, padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10, color: 'var(--text-dim)' }}>
                2do pago del mes{' '}
                <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional — para pagos quincenales)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Día del 2do pago</label>
                  <input type="number" className="input mono" value={form.payment_day_2}
                    onChange={e => set('payment_day_2', e.target.value)}
                    placeholder="Ej: 25" min="1" max="31" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">
                    Monto del 2do pago{' '}
                    <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(vacío = igual al 1ro)</span>
                  </label>
                  <input type="number" className="input mono" value={form.installment_amount_2}
                    onChange={e => set('installment_amount_2', e.target.value)}
                    placeholder={form.installment_amount || 'Mismo monto'} min="1" />
                </div>
              </div>
            </div>
          </>
        )}
        {/* Always show rate when auto_pay is off — needed for historical interest calc */}
        {!form.auto_pay && (
          <div className="field" style={{ marginTop: 8 }}>
            <label className="field-label">Tasa EA % <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(para cálculo de intereses históricos)</span></label>
            <input type="number" className="input mono" value={form.annual_rate}
              onChange={e => set('annual_rate', e.target.value)} placeholder="Ej: 18.5" step="0.01" min="0" />
          </div>
        )}
        {r > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 4 }}>
            Tasa mensual efectiva ≈ {((r > 0 ? (1 + r/100)**(1/12) - 1 : 0) * 100).toFixed(3)}%
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary">
          {isEdit ? <><Check size={14} /> Guardar cambios</> : <><Plus size={14} /> Crear deuda</>}
        </button>
      </div>
    </form>
  );
}

const SUB_COLORS = ['#6366f1','#ec4899','#f97316','#22c55e','#06b6d4','#eab308','#8b5cf6','#ef4444'];

// ── Subscription creation form ────────────────────────────────────────────────
// No category selector: all subscriptions always go under the "Suscripciones" category.
// The backend auto-creates that category the first time if it doesn't exist.
function SubscriptionForm({ users, categories, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    icon: '🔄', name: '', amount: '',
    category_id: '', subcategory_id: null,  // '' = auto "Suscripciones"
    user_id: users[0]?.id ?? '', billing_day: 1,
    color: SUB_COLORS[0], start_date: today, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        name:           form.name.trim(),
        amount:         Number(form.amount),
        billing_day:    Number(form.billing_day),
        category_id:    form.category_id || null,    // null → backend uses "Suscripciones"
        subcategory_id: form.subcategory_id || null,
        user_id:        form.user_id || null,
        notes:          form.notes.trim() || null,
      });
    } catch (err) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Error desconocido');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Icono</label>
          <EmojiPicker value={form.icon} onChange={v => set('icon', v)} />
        </div>
        <div className="field">
          <label className="field-label">Nombre de la suscripción</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="Ej: Netflix, Spotify, iCloud" autoFocus required />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Monto mensual (COP)</label>
          <input type="number" className="input mono" value={form.amount}
            onChange={e => set('amount', e.target.value)} placeholder="0" min="1" required />
        </div>
        <div className="field">
          <label className="field-label">Día de cobro (1–31)</label>
          <input type="number" className="input mono" value={form.billing_day}
            onChange={e => set('billing_day', e.target.value)} min="1" max="31" required />
        </div>
      </div>

      {/* Category: empty = auto "Suscripciones", or pick any category */}
      <div className="field">
        <label className="field-label">
          Categoría <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(vacío = "Suscripciones" automático)</span>
        </label>
        <CategorySelector
          categories={categories}
          categoryId={form.category_id}
          subcategoryId={form.subcategory_id}
          onChange={(catId, subId) => setForm(f => ({ ...f, category_id: catId, subcategory_id: subId }))}
          placeholder="Suscripciones (automático)"
          allowClear
        />
      </div>

      {users.length > 0 && (
        <div className="field">
          <label className="field-label">
            Asignar a <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn"
              style={{ flex: 1, justifyContent: 'center', borderColor: !form.user_id ? 'var(--primary)' : 'var(--border)', background: !form.user_id ? 'var(--surface-2)' : 'var(--bg-2)', fontSize: 13 }}
              onClick={() => set('user_id', '')}>
              Pareja
            </button>
            {users.map(u => (
              <button key={u.id} type="button" className="btn"
                style={{ flex: 1, justifyContent: 'center', borderColor: form.user_id === u.id ? u.color : 'var(--border)', background: form.user_id === u.id ? 'var(--surface-2)' : 'var(--bg-2)' }}
                onClick={() => set('user_id', u.id)}>
                <Avatar user={u} /> {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label">Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SUB_COLORS.map(c => (
            <button key={c} type="button" onClick={() => set('color', c)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: form.color === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Fecha de inicio</label>
          <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Notas <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
          <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ej: Plan familiar, cuenta compartida" />
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Guardando…' : <><Plus size={14} /> Crear suscripción</>}
        </button>
      </div>
    </form>
  );
}

// ── Subscription edit form ────────────────────────────────────────────────────
// Edits only affect future transactions — past ones keep their original amount.
function SubscriptionEditForm({ sub, users, categories, onSave, onCancel }) {
  const [form, setForm] = useState({
    icon:           sub.icon,
    name:           sub.name,
    amount:         String(sub.amount),
    billing_day:    sub.billing_day,
    category_id:    sub.category_id ?? '',
    subcategory_id: sub.subcategory_id ?? null,
    user_id:        sub.user_id ?? '',
    color:          sub.color,
    notes:          sub.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        icon:           form.icon,
        name:           form.name.trim(),
        amount:         Number(form.amount),
        billing_day:    Number(form.billing_day),
        category_id:    form.category_id || null,
        subcategory_id: form.subcategory_id || null,
        user_id:        form.user_id || null,
        color:          form.color,
        notes:          form.notes.trim() || null,
      });
    } catch (err) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Error desconocido');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={{
        fontSize: 12, color: 'var(--text-mute)', marginBottom: 16,
        padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6,
      }}>
        Los cambios aplican solo a las transacciones futuras. Las ya creadas conservan su monto original.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Icono</label>
          <EmojiPicker value={form.icon} onChange={v => set('icon', v)} />
        </div>
        <div className="field">
          <label className="field-label">Nombre</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="Ej: Netflix, Spotify" autoFocus required />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Monto mensual (COP)</label>
          <input type="number" className="input mono" value={form.amount}
            onChange={e => set('amount', e.target.value)} placeholder="0" min="1" required />
        </div>
        <div className="field">
          <label className="field-label">Día de cobro (1–31)</label>
          <input type="number" className="input mono" value={form.billing_day}
            onChange={e => set('billing_day', e.target.value)} min="1" max="31" required />
        </div>
      </div>

      <div className="field">
        <label className="field-label">
          Categoría <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(vacío = "Suscripciones" automático)</span>
        </label>
        <CategorySelector
          categories={categories}
          categoryId={form.category_id}
          subcategoryId={form.subcategory_id}
          onChange={(catId, subId) => setForm(f => ({ ...f, category_id: catId, subcategory_id: subId }))}
          placeholder="Suscripciones (automático)"
          allowClear
        />
      </div>

      {users.length > 0 && (
        <div className="field">
          <label className="field-label">
            Asignar a <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn"
              style={{ flex: 1, justifyContent: 'center', fontSize: 13,
                borderColor: !form.user_id ? 'var(--primary)' : 'var(--border)',
                background:  !form.user_id ? 'var(--surface-2)' : 'var(--bg-2)' }}
              onClick={() => set('user_id', '')}>
              Pareja
            </button>
            {users.map(u => (
              <button key={u.id} type="button" className="btn"
                style={{ flex: 1, justifyContent: 'center',
                  borderColor: form.user_id === u.id ? u.color : 'var(--border)',
                  background:  form.user_id === u.id ? 'var(--surface-2)' : 'var(--bg-2)' }}
                onClick={() => set('user_id', u.id)}>
                <Avatar user={u} /> {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label">Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SUB_COLORS.map(c => (
            <button key={c} type="button" onClick={() => set('color', c)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none',
                cursor: 'pointer', outline: form.color === c ? `3px solid ${c}` : '3px solid transparent',
                outlineOffset: 2 }} />
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">Notas <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span></label>
        <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Ej: Plan familiar, cuenta compartida" />
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px',
          background: 'rgba(239,68,68,0.1)', borderRadius: 6, marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Guardando…' : <><Check size={14} /> Guardar cambios</>}
        </button>
      </div>
    </form>
  );
}

// ── Subscription card ─────────────────────────────────────────────────────────
function SubscriptionCard({ sub, users, categories, onEdit, onCancel }) {
  const user      = users.find(u => u.id === sub.user_id);
  const cat       = categories.find(c => c.id === sub.category_id);
  const startDate = new Date(sub.start_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="card" style={{ borderLeft: `4px solid ${sub.color}`, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: sub.color + '22', color: sub.color,
            display: 'grid', placeItems: 'center', fontSize: 20,
          }}>
            {sub.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{sub.name}</span>
              <span className="mono" style={{ fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                {fmt(sub.amount, { compact: true })}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-mute)' }}>/mes</span>
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Día {sub.billing_day} de cada mes</span>
              {user
                ? <span style={{ color: user.color, display: 'flex', alignItems: 'center', gap: 4 }}><Avatar user={user} />{user.name}</span>
                : <span>Pareja</span>}
              {cat && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{cat.icon}</span>
                  <span style={{ color: cat.color }}>{cat.name}</span>
                </span>
              )}
              <span style={{ fontSize: 11 }}>Desde {startDate}</span>
            </div>
            {sub.notes && (
              <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 3 }}>{sub.notes}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn" style={{ fontSize: 12 }} onClick={() => onEdit(sub)}>
            <Edit2 size={13} /> Editar
          </button>
          <button className="btn" style={{ color: 'var(--red)', fontSize: 12 }} onClick={() => onCancel(sub)}>
            <X size={13} /> Cancelar suscripción
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Prima form (create / edit) ────────────────────────────────────────────────
const MONTHS_PRIMA = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function PrimaForm({ userId, users, userIncome, initial, onSave, onCancel }) {
  const user    = users.find(u => u.id === userId);
  const [mode, setMode] = useState(initial?.salary_pct ? 'pct' : 'fixed');
  const [form, setForm] = useState({
    month:        initial?.month        ?? 6,
    payment_day:  initial?.payment_day  ?? 15,
    amount:       initial?.amount && !initial?.salary_pct ? String(initial.amount) : '',
    pct:          initial?.salary_pct   ? String(initial.salary_pct) : '50',
    description:  initial?.description  ?? 'Prima',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Computed COP amount when in pct mode
  const computedAmount = mode === 'pct' && form.pct && userIncome
    ? Math.round(userIncome * Number(form.pct) / 100)
    : null;

  const submit = async (e) => {
    e.preventDefault();
    const isPct = mode === 'pct';
    if (isPct ? !form.pct : !form.amount) return;
    setSaving(true);
    try {
      await onSave({
        user_id:     userId,
        month:       Number(form.month),
        payment_day: Number(form.payment_day) || 15,
        // For pct mode: store the computed snapshot; backend recomputes from income at process time
        amount:      isPct ? (computedAmount ?? 0) : Number(form.amount),
        salary_pct:  isPct ? Number(form.pct) : null,
        description: form.description.trim() || 'Prima',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8 }}>
          <Avatar user={user} />
          <div style={{ fontWeight: 500 }}>{user.name}</div>
        </div>
      )}

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['fixed', '💰 Monto fijo'], ['pct', '% del sueldo']].map(([val, label]) => (
          <button key={val} type="button" className="btn"
            style={{ flex: 1, justifyContent: 'center', borderColor: mode === val ? 'var(--primary)' : 'var(--border)', background: mode === val ? 'var(--surface-2)' : 'var(--bg-2)', fontSize: 13 }}
            onClick={() => setMode(val)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Mes en que se paga</label>
          <select className="input" value={form.month} onChange={e => set('month', Number(e.target.value))}>
            {MONTHS_PRIMA.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Día del mes</label>
          <input type="number" className="input mono" value={form.payment_day}
            onChange={e => set('payment_day', e.target.value)}
            min="1" max="31" />
        </div>
        {mode === 'fixed' ? (
          <div className="field">
            <label className="field-label">Monto (COP)</label>
            <input type="number" className="input mono" value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0" min="1" required autoFocus />
          </div>
        ) : (
          <div className="field">
            <label className="field-label">Porcentaje del sueldo</label>
            <div style={{ position: 'relative' }}>
              <input type="number" className="input mono" value={form.pct}
                onChange={e => set('pct', e.target.value)}
                placeholder="50" min="1" max="200" required autoFocus
                style={{ paddingRight: 36 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)', pointerEvents: 'none' }}>%</span>
            </div>
            {computedAmount !== null && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--primary)' }}>
                = {fmt(computedAmount)} este mes
              </div>
            )}
            {!userIncome && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-mute)' }}>
                Configura el ingreso primero para ver el valor calculado.
              </div>
            )}
          </div>
        )}
      </div>
      <div className="field">
        <label className="field-label">Descripción</label>
        <input className="input" value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ej: Prima legal, Prima extralegal" />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6 }}>
        {mode === 'pct'
          ? 'El monto se calcula automáticamente sobre el sueldo vigente cada vez que se genera.'
          : 'Se genera automáticamente como ingreso cada año en el mes seleccionado.'}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Guardando…' : initial ? <><Check size={14} /> Guardar</> : <><Plus size={14} /> Agregar prima</>}
        </button>
      </div>
    </form>
  );
}

// ── Editable income cell ──────────────────────────────────────────────────────
function IncomeCell({ amount, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState(String(amount));
  const inputRef = useRef();

  useEffect(() => { if (!editing) setVal(String(amount)); }, [amount, editing]);

  const commit = () => {
    setEditing(false);
    const num = parseInt(val.replace(/\D/g, ''), 10) || 0;
    onSave(num);
  };

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
        style={{ width: '100%', textAlign: 'right', fontSize: 22, fontWeight: 700, padding: '6px 10px' }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click para editar"
      style={{
        fontSize: 26, fontWeight: 700, cursor: 'pointer', padding: '6px 10px',
        borderRadius: 8, border: '1px dashed var(--border)',
        color: amount > 0 ? 'var(--text)' : 'var(--text-mute)',
        textAlign: 'right',
      }}
    >
      {amount > 0 ? fmt(amount) : <span style={{ fontSize: 14, fontWeight: 400 }}>Click para agregar ingreso</span>}
    </div>
  );
}

// ── Income card per user ──────────────────────────────────────────────────────
function UserIncomeCard({ user, amount, primaTotal, budgetForUser, totalIncome,
                          onSave, history, userPrimas, onAddPrima, onEditPrima, onDeletePrima }) {
  const [expanded, setExpanded] = useState(false);

  const effectiveAmount = amount + primaTotal;
  const pct   = effectiveAmount > 0 ? Math.min((budgetForUser / effectiveAmount) * 100, 200) : 0;
  const over  = budgetForUser > effectiveAmount && effectiveAmount > 0;
  const free  = effectiveAmount - budgetForUser;
  const share = totalIncome > 0 ? (effectiveAmount / totalIncome) * 100 : 0;

  return (
    <div className="card" style={{ borderLeft: `4px solid ${user.color}`, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Avatar user={user} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
            {totalIncome > 0 && effectiveAmount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>
                {share.toFixed(0)}% del ingreso total del hogar
              </div>
            )}
          </div>
          <TrendingUp size={18} style={{ color: user.color, flexShrink: 0 }} />
        </div>

        {/* Editable regular salary */}
        <div style={{ marginBottom: primaTotal > 0 ? 8 : 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Sueldo mensual
          </div>
          <IncomeCell amount={amount} onSave={(v) => onSave(user.id, v)} />
        </div>

        {/* Prima badge — only when this month has a prima */}
        {primaTotal > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: 14,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 8, fontSize: 13,
          }}>
            <span style={{ color: 'var(--primary)' }}>🎁 Prima este mes</span>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
              +{fmt(primaTotal, { compact: true })}
            </span>
          </div>
        )}

        {/* Budget vs effective income bar */}
        {effectiveAmount > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-mute)' }}>
                Presupuestado: <span className="mono" style={{ color: 'var(--text-dim)' }}>{fmt(budgetForUser, { compact: true })}</span>
              </span>
              <span className="mono" style={{ fontWeight: 600, color: over ? 'var(--red)' : 'var(--green)' }}>
                {over ? '−' : '+'}{fmt(Math.abs(free), { compact: true })} libres
              </span>
            </div>
            <div className="bar" style={{ marginBottom: 5 }}>
              <div className="bar-fill" style={{
                width: `${Math.min(pct, 100)}%`,
                background: over ? 'var(--red)' : pct > 85 ? 'var(--amber)' : user.color,
              }} />
            </div>
            <div style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--text-mute)' }} className="mono">
              {pct.toFixed(0)}% comprometido
              {primaTotal > 0 && (
                <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>
                  {' · '}sobre {fmt(effectiveAmount, { compact: true })} efectivos
                </span>
              )}
            </div>
          </div>
        )}

        {/* Configured primas list */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Primas
            </span>
            <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => onAddPrima(user.id)}>
              <Plus size={11} /> Agregar
            </button>
          </div>
          {userPrimas.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-mute)', fontStyle: 'italic' }}>Sin primas configuradas</div>
          ) : (
            userPrimas.map(p => {
              const displayAmt = p.salary_pct
                ? Math.round(amount * p.salary_pct / 100)
                : p.amount;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  fontSize: 12, borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>🎁</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{p.description}</div>
                    <div style={{ color: 'var(--text-mute)', fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {MONTHS_PRIMA[p.month - 1]} · día {p.payment_day ?? 15}
                      {p.salary_pct && (
                        <span style={{ background: 'var(--primary)22', color: 'var(--primary)', borderRadius: 99, padding: '0 5px', fontWeight: 600 }}>
                          {p.salary_pct}%
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--primary)', flexShrink: 0 }}>
                    {displayAmt > 0 ? fmt(displayAmt, { compact: true }) : `${p.salary_pct}% del sueldo`}
                  </span>
                  <button className="btn" style={{ padding: '2px 5px' }} onClick={() => onEditPrima(p)}>
                    <Edit2 size={11} />
                  </button>
                  <button className="btn" style={{ padding: '2px 5px', color: 'var(--red)' }} onClick={() => onDeletePrima(p.id)}>
                    <X size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* History toggle */}
        {history.length > 0 && (
          <button className="btn ghost" style={{ width: '100%', marginTop: 14, fontSize: 12 }}
            onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Historial de ingresos ({history.length})
          </button>
        )}
      </div>

      {/* History rows */}
      {expanded && history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
          {history.map(h => (
            <div key={h.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 20px', borderBottom: '1px solid var(--border)', fontSize: 12,
            }}>
              <span style={{ color: 'var(--text-mute)', flex: 1 }}>
                {new Date(h.changed_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}
                {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][h.month - 1]} {h.year}
              </span>
              {h.old_amount !== null && h.old_amount !== undefined && (
                <span className="mono" style={{ color: 'var(--text-mute)', textDecoration: 'line-through' }}>
                  {fmt(h.old_amount, { compact: true })}
                </span>
              )}
              <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                {fmt(h.new_amount, { compact: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Budget() {
  const {
    users, categories, transactions, subscriptions, debts: allDebts, userFilter, setUserFilter,
    reloadCategories, reloadTransactions,
    addCategoryLocal, addSubcategoryLocal, deactivateCategoryLocal, deactivateSubcategoryLocal,
    addSubscriptionLocal, removeSubscriptionLocal, updateSubscriptionLocal,
    primas, addPrimaLocal, updatePrimaLocal, removePrimaLocal,
  } = useAppContext();

  // Only show active categories in Budget. "Ingresos" is an income-tracking
  // category created automatically by the income system — it should never
  // appear as an expense budget row, so we hide it here.
  const activeCategories = useMemo(
    () => categories.filter(c => c.is_active !== false && c.name !== 'Ingresos'),
    [categories],
  );

  // ID of the auto-created "Ingresos" category so we can exclude any accidental
  // budget rows for it from all totals (income ≠ expense budget).
  const ingresosCatId = useMemo(
    () => categories.find(c => c.name === 'Ingresos')?.id,
    [categories],
  );

  const now = new Date();
  const [tab,   setTab]   = useState('budget');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [budgetRows,    setBudgetRows]    = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  // allBudgetRows: always all users, no userFilter — used in income tab so
  // both users' budget totals are visible regardless of who is selected.
  const [allBudgetRows, setAllBudgetRows] = useState([]);
  const [debts,        setDebts]        = useState([]);
  const [debtsLoading, setDebtsLoading] = useState(false);
  const [incomeRows,    setIncomeRows]    = useState([]);    // effective income per user
  const [incomeHistories, setIncomeHistories] = useState({}); // userId → history[]

  // Modals
  const [paymentTarget,  setPaymentTarget]  = useState(null);
  const [showDebtForm,   setShowDebtForm]   = useState(false);
  const [editingDebt,    setEditingDebt]    = useState(null);
  const [showCatForm,    setShowCatForm]    = useState(false);
  const [showSubForm,    setShowSubForm]    = useState(false); // subscription creation modal
  const [seedingIncome,  setSeedingIncome]  = useState(false);
  const [editingSub,     setEditingSub]     = useState(null);  // subscription being edited
  const [subFormCat,    setSubFormCat]    = useState(null); // category object for subcategory form
  const [subFormError,  setSubFormError]  = useState(null);
  const [subFormSaving, setSubFormSaving] = useState(false);

  // Prima modal state
  const [showPrimaForm,    setShowPrimaForm]    = useState(false);
  const [editingPrima,     setEditingPrima]     = useState(null);   // prima being edited, null = create
  const [primaTargetUser,  setPrimaTargetUser]  = useState(null);   // userId when creating

  // Migration modal state
  const [migrationSource,  setMigrationSource]  = useState(null); // deleted category being migrated
  const [migrationSaving,  setMigrationSaving]  = useState(false);
  const [migrationError,   setMigrationError]   = useState(null);
  const [migrationMigrated, setMigrationMigrated] = useState(null); // null = not done, N = count

  // ── Load budget ─────────────────────────────────────────────────────────────
  const loadBudget = useCallback(async () => {
    setBudgetLoading(true);
    try {
      const userId = userFilter !== 'all' ? userFilter : null;
      // Load filtered rows for the budget tab display + all-users rows for income tab.
      const [filtered, all] = await Promise.all([
        getBudgetSupabase(year, month, userId),
        userId ? getBudgetSupabase(year, month, null) : null,
      ]);
      setBudgetRows(filtered);
      setAllBudgetRows(all ?? filtered); // when userFilter='all', filtered already has everyone
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

  // Income: load always (needed for budget-tab alert) and reload on year/month change.
  useEffect(() => {
    getIncome(year, month)
      .then(rows => setIncomeRows(rows))
      .catch(err => console.error('Failed to load income:', err));
  }, [year, month]);

  // Load income history lazily when the income tab opens (per user).
  useEffect(() => {
    if (tab !== 'income') return;
    Promise.all(
      users.map(u =>
        getIncomeHistory(u.id)
          .then(hist => ({ userId: u.id, hist }))
          .catch(() => ({ userId: u.id, hist: [] }))
      )
    ).then(results => {
      const map = {};
      results.forEach(({ userId, hist }) => { map[userId] = hist; });
      setIncomeHistories(map);
    });
  }, [tab, users]);

  // ── Spent per category and subcategory (from AppContext) ─────────────────────
  const spentByCategory = useMemo(() => {
    const monthTxns = filterTxns(transactions, userFilter, year, month).filter(t => t.type === 'expense');
    const out = {};
    monthTxns.forEach(t => { out[t.categoryId] = (out[t.categoryId] ?? 0) + t.amount; });
    return out;
  }, [transactions, userFilter, year, month]);

  const spentBySubcategory = useMemo(() => {
    const monthTxns = filterTxns(transactions, userFilter, year, month).filter(t => t.type === 'expense');
    const out = {};
    monthTxns.forEach(t => {
      if (t.subcategoryId) out[t.subcategoryId] = (out[t.subcategoryId] ?? 0) + t.amount;
    });
    return out;
  }, [transactions, userFilter, year, month]);

  // Per-user spent per category — only computed in all-users view (used for the breakdown column).
  const spentByCategoryAndUser = useMemo(() => {
    if (userFilter !== 'all') return {};
    const monthTxns = filterTxns(transactions, 'all', year, month).filter(t => t.type === 'expense');
    const out = {};
    monthTxns.forEach(t => {
      if (!out[t.categoryId]) out[t.categoryId] = {};
      out[t.categoryId][t.userId] = (out[t.categoryId][t.userId] ?? 0) + t.amount;
    });
    return out;
  }, [transactions, userFilter, year, month]);

  // Inactive (deleted) categories that still have transactions in the current year view.
  const deletedCatsWithActivity = useMemo(() => {
    const inactiveCats = categories.filter(c => c.is_active === false);
    return inactiveCats
      .map(cat => {
        const yearTxns = filterTxns(transactions, userFilter, year, null).filter(
          t => t.type === 'expense' && t.categoryId === cat.id
        );
        return { cat, count: yearTxns.length, spent: yearTxns.reduce((s, t) => s + t.amount, 0) };
      })
      .filter(item => item.count > 0);
  }, [categories, transactions, userFilter, year]);

  const budgetMap = useMemo(() => {
    const rows = ingresosCatId
      ? budgetRows.filter(r => r.category_id !== ingresosCatId)
      : budgetRows;
    if (userFilter === 'all') {
      const map = {};
      rows.forEach(row => {
        if (!map[row.category_id]) map[row.category_id] = { total: 0, byUser: {} };
        map[row.category_id].total += row.amount;
        map[row.category_id].byUser[row.user_id] = row.amount;
      });
      return map;
    }
    const map = {};
    rows.forEach(row => { map[row.category_id] = row.amount; });
    return map;
  }, [budgetRows, userFilter, ingresosCatId]);

  const getBudgetAmount = (catId) =>
    userFilter === 'all' ? (budgetMap[catId]?.total ?? 0) : (budgetMap[catId] ?? 0);

  // The "Suscripciones" category: its budget is auto-calculated from subscriptions
  // that don't have a specific category assigned (i.e. they fall back to this one).
  // Subscriptions with a custom category (e.g. Carro propio) count toward that
  // category's spending instead — the user budgets those manually.
  const subscriptionsCat = useMemo(
    () => activeCategories.find(c => c.name === 'Suscripciones'),
    [activeCategories],
  );

  // Only subscriptions that actually live in the "Suscripciones" category count
  // toward its auto-budget. Custom-category subs affect their own category's spending.
  const totalMonthlySubscriptions = useMemo(
    () => subscriptions
      .filter(sub => subscriptionsCat && sub.category_id === subscriptionsCat.id)
      .reduce((s, sub) => s + sub.amount, 0),
    [subscriptions, subscriptionsCat],
  );

  // Per-user totals — same filter: only "Suscripciones" category subs.
  // Subs with no owner (user_id = null / "Pareja") appear in every individual
  // user's budget — they're shared costs so each person sees them.
  const subscriptionsByUser = useMemo(() => {
    const map = {};
    subscriptions
      .filter(sub => subscriptionsCat && sub.category_id === subscriptionsCat.id)
      .forEach(sub => {
        if (sub.user_id) {
          map[sub.user_id] = (map[sub.user_id] || 0) + sub.amount;
        } else {
          users.forEach(u => {
            map[u.id] = (map[u.id] || 0) + sub.amount;
          });
        }
      });
    return map;
  }, [subscriptions, subscriptionsCat, users]);

  // How much of the subscription total belongs to the currently selected user/view.
  // All-users view → full household total. Individual view → only that user's subs.
  const subsAmountForView = useMemo(() => {
    if (userFilter === 'all') return totalMonthlySubscriptions;
    return subscriptionsByUser[userFilter] || 0;
  }, [userFilter, subscriptionsByUser, totalMonthlySubscriptions]);

  // Custom-category subs: auto-budget contribution per category, respecting userFilter.
  // Excludes subs in "Suscripciones" (those are handled by subsAmountForView above).
  // Individual view: only subs owned by the selected user.
  // All-users view: all subs regardless of owner.
  const customSubAmountByCategory = useMemo(() => {
    const map = {};
    subscriptions
      .filter(sub => !subscriptionsCat || sub.category_id !== subscriptionsCat.id)
      .forEach(sub => {
        if (!sub.category_id) return;
        if (userFilter !== 'all' && sub.user_id !== userFilter) return;
        map[sub.category_id] = (map[sub.category_id] || 0) + sub.amount;
      });
    return map;
  }, [subscriptions, subscriptionsCat, userFilter]);

  const totalCustomSubsForView = useMemo(
    () => Object.values(customSubAmountByCategory).reduce((s, v) => s + v, 0),
    [customSubAmountByCategory],
  );

  // Household total of custom-category subs — used in income tab (always all users).
  const totalCustomSubsAllUsers = useMemo(
    () => subscriptions
      .filter(sub => !subscriptionsCat || sub.category_id !== subscriptionsCat.id)
      .reduce((s, sub) => s + sub.amount, 0),
    [subscriptions, subscriptionsCat],
  );

  // ── Debt auto-budget: monthly installment amounts per category ─────────────
  // Mirrors the subscription auto-budget pattern. Each active auto-pay debt
  // contributes its monthly total (1 or 2 installments) to the budget of
  // whatever category its subcategory lives under (usually "Finanzas y deudas").
  // Individual view: only debts owned by the selected user.
  // All-users view: all active debts.
  const debtBudgetByCategory = useMemo(() => {
    const map = {};
    // Build subcategory_id → category_id lookup from loaded categories
    const subToCat = {};
    categories.forEach(cat => {
      (cat.subcategories || []).forEach(sub => { subToCat[sub.id] = cat.id; });
    });

    (allDebts || []).forEach(debt => {
      if (!debt.auto_pay || debt.status !== 'active' || !debt.installment_amount) return;
      if (debt.pending_amount <= 0) return;
      if (userFilter !== 'all' && debt.user_id && debt.user_id !== userFilter) return;

      // Only apply auto-budget from the month the debt was created — avoids inflating
      // past months where the user had already budgeted for the debt manually.
      if (debt.created_at) {
        const created = new Date(debt.created_at);
        const createdYear  = created.getFullYear();
        const createdMonth = created.getMonth() + 1;
        if (year < createdYear || (year === createdYear && month < createdMonth)) return;
      }

      const monthly = debt.installment_amount +
        (debt.payment_day_2 ? (debt.installment_amount_2 || debt.installment_amount) : 0);

      // Resolve category via subcategory lookup
      const catId = debt.subcategory_id ? subToCat[debt.subcategory_id] : null;
      if (catId) map[catId] = (map[catId] || 0) + monthly;
    });
    return map;
  }, [allDebts, categories, userFilter, year, month]);

  const totalDebtBudgetForView = useMemo(
    () => Object.values(debtBudgetByCategory).reduce((s, v) => s + v, 0),
    [debtBudgetByCategory],
  );

  const totalDebtBudgetAllUsers = useMemo(() => {
    const subToCat = {};
    categories.forEach(cat => {
      (cat.subcategories || []).forEach(sub => { subToCat[sub.id] = cat.id; });
    });
    const map = {};
    (allDebts || []).forEach(debt => {
      if (!debt.auto_pay || debt.status !== 'active' || !debt.installment_amount) return;
      if (debt.pending_amount <= 0) return;
      // Same created_at guard as debtBudgetByCategory
      if (debt.created_at) {
        const created = new Date(debt.created_at);
        const createdYear  = created.getFullYear();
        const createdMonth = created.getMonth() + 1;
        if (year < createdYear || (year === createdYear && month < createdMonth)) return;
      }
      const monthly = debt.installment_amount +
        (debt.payment_day_2 ? (debt.installment_amount_2 || debt.installment_amount) : 0);
      const catId = debt.subcategory_id ? subToCat[debt.subcategory_id] : null;
      if (catId) map[catId] = (map[catId] || 0) + monthly;
    });
    return Object.values(map).reduce((s, v) => s + v, 0);
  }, [allDebts, categories, year, month]);

  const totalBudget = useMemo(() => {
    const manual = Object.values(budgetMap).reduce((s, v) => s + (userFilter === 'all' ? v.total : v), 0);
    return manual + (subscriptionsCat ? subsAmountForView : 0) + totalCustomSubsForView + totalDebtBudgetForView;
  }, [budgetMap, userFilter, subscriptionsCat, subsAmountForView, totalCustomSubsForView, totalDebtBudgetForView]);

  // All-users budget total — used in income tab regardless of who is selected.
  const totalBudgetAllUsers = useMemo(() => {
    const catTotals = {};
    allBudgetRows
      .filter(r => !ingresosCatId || r.category_id !== ingresosCatId)
      .forEach(r => { catTotals[r.category_id] = (catTotals[r.category_id] || 0) + r.amount; });
    const manual = Object.values(catTotals).reduce((s, v) => s + v, 0);
    return manual + (subscriptionsCat ? totalMonthlySubscriptions : 0) + totalCustomSubsAllUsers + totalDebtBudgetAllUsers;
  }, [allBudgetRows, ingresosCatId, subscriptionsCat, totalMonthlySubscriptions, totalCustomSubsAllUsers, totalDebtBudgetAllUsers]);
  const totalSpent  = useMemo(() => Object.values(spentByCategory).reduce((s, v) => s + v, 0), [spentByCategory]);

  // True when the user is viewing a month strictly before today's month.
  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);

  // Inactive (deleted) categories that still have a budgeted amount for the viewed past month.
  // Only computed for past months — in the current month deleted categories should stay hidden.
  const archivedCatsWithBudget = useMemo(() => {
    if (!isPastMonth) return [];
    return categories
      .filter(c => c.is_active === false && budgetMap[c.id] !== undefined)
      .map(cat => {
        const budgetAmt = userFilter === 'all'
          ? (budgetMap[cat.id]?.total ?? 0)
          : (budgetMap[cat.id] ?? 0);
        const spent = spentByCategory[cat.id] ?? 0;
        return { cat, budgetAmt, spent };
      })
      .filter(({ budgetAmt }) => budgetAmt > 0);
  }, [categories, budgetMap, userFilter, isPastMonth, spentByCategory]);

  // ── Budget save — optimistic update ─────────────────────────────────────────
  const handleBudgetSave = useCallback(async (categoryId, amount) => {
    if (userFilter === 'all') return;
    // Update local state immediately so there's no loading flash.
    setBudgetRows(prev => {
      const existing = prev.find(r => r.category_id === categoryId && r.user_id === userFilter);
      if (existing) {
        return prev.map(r =>
          r.category_id === categoryId && r.user_id === userFilter ? { ...r, amount } : r
        );
      }
      return [...prev, { category_id: categoryId, user_id: userFilter, year, month, amount }];
    });
    // Persist in the background — no loading indicator needed.
    try {
      await upsertBudget({ category_id: categoryId, user_id: userFilter, year, month, amount });
    } catch (err) {
      console.error('Failed to save budget:', err);
      // Revert optimistic update on error by reloading the real state.
      await loadBudget();
    }
  }, [userFilter, year, month, loadBudget]);

  // ── Category actions ─────────────────────────────────────────────────────────
  const handleCreateCategory = async (data) => {
    try {
      const newCat = await createCategory(data);
      setShowCatForm(false);
      addCategoryLocal(newCat); // appends only the new row — no full re-render
    } catch (err) { console.error('Failed to create category:', err); }
  };

  const handleDeleteCategory = async (cat) => {
    if (!confirm(`¿Desactivar la categoría "${cat.name}"?\n\nLas transacciones existentes conservan su categoría, pero ya no aparecerá como opción al crear nuevas.`)) return;
    try {
      await deleteCategory(cat.id);
      deactivateCategoryLocal(cat.id); // marks only this row as inactive
    } catch (err) { console.error('Failed to delete category:', err); }
  };

  // ── Subcategory actions ──────────────────────────────────────────────────────
  const handleCreateSubcategory = async (catId, data) => {
    setSubFormError(null);
    setSubFormSaving(true);
    try {
      const newSub = await createSubcategory(catId, data);
      setSubFormCat(null);
      setSubFormError(null);
      addSubcategoryLocal(catId, newSub); // adds only the new sub-row inside its parent
    } catch (err) {
      console.error('Failed to create subcategory:', err);
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Error desconocido';
      setSubFormError(`No se pudo crear la subcategoría: ${msg}`);
    } finally {
      setSubFormSaving(false);
    }
  };

  const handleDeleteSubcategory = async (subId, subName) => {
    if (!confirm(`¿Eliminar la subcategoría "${subName}"?\n\nLas transacciones que la tienen asignada no se ven afectadas.`)) return;
    try {
      await deleteSubcategory(subId);
      deactivateSubcategoryLocal(subId); // hides only this sub-row
    } catch (err) { console.error('Failed to delete subcategory:', err); }
  };

  // ── Migration action ─────────────────────────────────────────────────────────
  const handleMigrate = async (fromId, toId, toSubId) => {
    setMigrationSaving(true);
    setMigrationError(null);
    try {
      const { migrated } = await migrateCategory(fromId, toId, toSubId);
      setMigrationMigrated(migrated);
      // Reload so the Eliminadas section updates and Transactions page reflects new categories
      await reloadTransactions();
    } catch (err) {
      console.error('Migration failed:', err);
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Error desconocido';
      setMigrationError(`No se pudo migrar: ${msg}`);
    } finally {
      setMigrationSaving(false);
    }
  };

  const closeMigrationModal = () => {
    setMigrationSource(null);
    setMigrationError(null);
    setMigrationMigrated(null);
  };

  // ── Debt actions ─────────────────────────────────────────────────────────────
  const handleCreateDebt    = async (data)           => { try { await createDebt(data); setShowDebtForm(false); await Promise.all([loadDebts(), reloadCategories()]); } catch (err) { console.error(err); alert(`Error al crear la deuda: ${err?.response?.data?.detail ?? err?.message ?? err}`); } };
  const handleEditDebt      = async (data)           => { try { await updateDebt(editingDebt.id, data); setEditingDebt(null); await loadDebts(); } catch (err) { console.error(err); alert(`Error al guardar: ${err?.response?.data?.detail ?? err?.message ?? err}`); } };
  const handleDeleteDebt    = async (id)             => { if (!confirm('¿Eliminar esta deuda y todos sus abonos?')) return; try { await deleteDebt(id); await loadDebts(); } catch (err) { console.error(err); } };
  const handleAddPayment    = async (debtId, data)   => { try { await addDebtPayment(debtId, data); setPaymentTarget(null); await loadDebts(); } catch (err) { console.error(err); } };
  const handleDeletePayment = async (paymentId)      => { try { await deleteDebtPayment(paymentId); await loadDebts(); } catch (err) { console.error(err); } };

  // ── Subscription actions ─────────────────────────────────────────────────────
  const handleCreateSubscription = async (data) => {
    const created = await createSubscription(data);
    setShowSubForm(false);
    addSubscriptionLocal(created);
    // If the "Suscripciones" category didn't exist locally, the backend may have
    // just created it — reload categories so the budget row appears immediately.
    if (!subscriptionsCat) await reloadCategories();
  };

  const handleEditSubscription = async (data) => {
    const updated = await updateSubscription(editingSub.id, data);
    updateSubscriptionLocal(updated);
    setEditingSub(null);
  };

  const handleCancelSubscription = async (sub) => {
    if (!confirm(`¿Cancelar la suscripción "${sub.name}"?\n\nSe guardará la fecha de cancelación para preservar el historial. Las transacciones ya creadas no se eliminarán.`)) return;
    try {
      const cancelled = await cancelSubscription(sub.id);
      removeSubscriptionLocal(cancelled.id);
    } catch (err) { console.error('Failed to cancel subscription:', err); }
  };

  // ── Income actions ───────────────────────────────────────────────────────────
  const handleIncomeSave = useCallback(async (userId, amount) => {
    // Optimistic update
    setIncomeRows(prev => {
      const exists = prev.find(r => r.user_id === userId);
      if (exists) return prev.map(r => r.user_id === userId ? { ...r, amount } : r);
      return [...prev, { user_id: userId, year, month, amount }];
    });
    try {
      await upsertIncome({ user_id: userId, year, month, amount });
      // Refresh history for this user
      getIncomeHistory(userId)
        .then(hist => setIncomeHistories(prev => ({ ...prev, [userId]: hist })))
        .catch(() => {});
    } catch (err) {
      console.error('Failed to save income:', err);
      // Revert by reloading
      getIncome(year, month).then(setIncomeRows).catch(() => {});
    }
  }, [year, month]);

  // Income computed values
  const incomeMap = useMemo(() => {
    const map = {};
    incomeRows.forEach(r => { map[r.user_id] = r.amount; });
    return map;
  }, [incomeRows]);

  // Primas for the currently viewed month, grouped by user
  const primasThisMonth = useMemo(
    () => primas.filter(p => p.month === month),
    [primas, month],
  );

  const primasAmountByUser = useMemo(() => {
    const map = {};
    primasThisMonth.forEach(p => {
      if (!p.user_id) return;
      // If salary_pct is set, compute from the user's base income (incomeMap excludes primas)
      const amt = p.salary_pct
        ? Math.round((incomeMap[p.user_id] || 0) * p.salary_pct / 100)
        : p.amount;
      map[p.user_id] = (map[p.user_id] || 0) + amt;
    });
    return map;
  }, [primasThisMonth, incomeMap]);

  // Effective income = regular salary + primas for this month
  const effectiveIncomeMap = useMemo(() => {
    const map = { ...incomeMap };
    Object.entries(primasAmountByUser).forEach(([uid, amt]) => {
      map[uid] = (map[uid] || 0) + amt;
    });
    return map;
  }, [incomeMap, primasAmountByUser]);

  const totalIncome = useMemo(
    () => Object.values(effectiveIncomeMap).reduce((s, v) => s + v, 0),
    [effectiveIncomeMap],
  );

  // Budget per user for the income tab — always uses allBudgetRows (all users, no filter).
  const budgetPerUser = useMemo(() => {
    const map = {};
    allBudgetRows.forEach(r => {
      if (r.user_id) map[r.user_id] = (map[r.user_id] || 0) + r.amount;
    });
    // Add each user's own subscriptions only (not split evenly — each user owns their subs)
    if (subscriptionsCat) {
      Object.entries(subscriptionsByUser).forEach(([uid, amt]) => {
        map[uid] = (map[uid] || 0) + amt;
      });
    }
    // Add auto-pay debt installments per owner (same created_at guard as debtBudgetByCategory)
    (allDebts || []).forEach(debt => {
      if (!debt.auto_pay || debt.status !== 'active' || !debt.installment_amount) return;
      if (debt.pending_amount <= 0) return;
      if (!debt.user_id) return; // shared debts have no individual owner to attribute to
      if (debt.created_at) {
        const created = new Date(debt.created_at);
        const cy = created.getFullYear();
        const cm = created.getMonth() + 1;
        if (year < cy || (year === cy && month < cm)) return;
      }
      const monthly = debt.installment_amount +
        (debt.payment_day_2 ? (debt.installment_amount_2 || debt.installment_amount) : 0);
      map[debt.user_id] = (map[debt.user_id] || 0) + monthly;
    });
    return map;
  }, [allBudgetRows, subscriptionsCat, subscriptionsByUser, allDebts, year, month]);

  const totalPending = debts.reduce((s, d) => s + d.pending_amount, 0);
  const totalDebt    = debts.reduce((s, d) => s + d.total_amount, 0);

  const maxSortOrder = useMemo(() => Math.max(...categories.map(c => c.sort_order || 0), 0), [categories]);

  // ── Prima actions ─────────────────────────────────────────────────────────────
  const handleAddPrima = useCallback((userId) => {
    setPrimaTargetUser(userId);
    setEditingPrima(null);
    setShowPrimaForm(true);
  }, []);

  const handleEditPrima = useCallback((prima) => {
    setPrimaTargetUser(prima.user_id);
    setEditingPrima(prima);
    setShowPrimaForm(true);
  }, []);

  const handleDeletePrima = useCallback(async (id) => {
    if (!confirm('¿Eliminar esta prima?')) return;
    await deletePrima(id);
    removePrimaLocal(id);
  }, [removePrimaLocal]);

  const handleSavePrima = useCallback(async (data) => {
    try {
      if (editingPrima) {
        const updated = await updatePrima(editingPrima.id, data);
        updatePrimaLocal(updated);
      } else {
        const created = await createPrima(data);
        addPrimaLocal(created);
        // Process immediately so the income transaction appears right away
        await processPrimas(year, month).catch(() => {});
      }
      setShowPrimaForm(false);
      setEditingPrima(null);
    } catch (err) {
      alert(`Error al guardar la prima: ${err?.response?.data?.detail ?? err?.message ?? err}`);
    }
  }, [editingPrima, updatePrimaLocal, addPrimaLocal, year, month]);

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1 className="page-title">Presupuesto</h1>
          <div className="page-sub">{MONTHS_LONG[month - 1]} {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {(tab === 'budget' || tab === 'income') && (
            <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          )}
          {tab !== 'income' && <UserToggle value={userFilter} onChange={setUserFilter} />}
        </div>
      </div>

      {/* Tabs */}
      <div className="seg" style={{ marginBottom: 20, width: 'fit-content' }}>
        <button className={tab === 'budget' ? 'active' : ''} onClick={() => setTab('budget')}>Presupuesto</button>
        <button className={tab === 'income' ? 'active' : ''} onClick={() => setTab('income')}>
          <TrendingUp size={13} style={{ marginRight: 5 }} />
          Ingresos
        </button>
        <button className={tab === 'debts'  ? 'active' : ''} onClick={() => setTab('debts')}>Deudas</button>
        <button className={tab === 'subs'   ? 'active' : ''} onClick={() => setTab('subs')}>
          <RefreshCw size={13} style={{ marginRight: 5 }} />
          Suscripciones
          {subscriptions.length > 0 && (
            <span style={{
              marginLeft: 6, background: 'var(--primary)', color: '#fff',
              fontSize: 10, fontWeight: 700, borderRadius: 99,
              padding: '1px 6px', lineHeight: 1.6,
            }}>
              {subscriptions.length}
            </span>
          )}
        </button>
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

          {/* Alert: total household budget exceeds total household income */}
          {totalIncome > 0 && totalBudgetAllUsers > totalIncome && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 18px', marginBottom: 16,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
            }}>
              <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--red)' }}>
                  Presupuesto del hogar supera los ingresos
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>
                  Presupuestado <strong className="mono">{fmt(totalBudgetAllUsers, { compact: true })}</strong> · Ingresos <strong className="mono">{fmt(totalIncome, { compact: true })}</strong> · Déficit <strong className="mono" style={{ color: 'var(--red)' }}>{fmt(totalBudgetAllUsers - totalIncome, { compact: true })}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Category list */}
          <div className="card flush">
            {/* Header row — budget column wider in all-users view to fit per-user breakdown */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: userFilter === 'all' ? '1fr 160px 150px 140px' : '1fr 120px 120px 140px',
              gap: 12, padding: '10px 20px',
              fontSize: 11, color: 'var(--text-mute)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--border)', background: 'var(--bg-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Categoría</span>
                <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setShowCatForm(true)}>
                  <Plus size={12} /> Nueva
                </button>
              </div>
              <span style={{ textAlign: 'right' }}>Presupuesto</span>
              <span style={{ textAlign: 'right' }}>Gastado</span>
              <span>Progreso</span>
            </div>

            {budgetLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Cargando…</div>
            ) : activeCategories.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>
                Sin categorías — crea la primera con el botón "Nueva"
              </div>
            ) : activeCategories.map(cat => {
              const isSubsCat = subscriptionsCat && cat.id === subscriptionsCat.id;
              const manualBudget    = isSubsCat ? 0 : getBudgetAmount(cat.id);
              // Auto-budget from custom-category subscriptions for this category.
              const customSubForCat = isSubsCat ? 0 : (customSubAmountByCategory[cat.id] ?? 0);
              // Auto-budget from active auto-pay debt installments for this category.
              const debtForCat      = isSubsCat ? 0 : (debtBudgetByCategory[cat.id] ?? 0);
              const budgeted = isSubsCat ? subsAmountForView : manualBudget + customSubForCat + debtForCat;
              // For the all-users breakdown column, use subscriptionsByUser for the subs category
              // (no manual budget rows exist for it, so byUser would otherwise be empty).
              const byUser   = userFilter === 'all' ? (budgetMap[cat.id]?.byUser ?? {}) : null;
              const effectiveByUser = isSubsCat ? subscriptionsByUser : byUser;
              const spent    = spentByCategory[cat.id] ?? 0;
              // pct: real percentage (may exceed 100 when over budget — shown in text)
              // pctBar: clamped to 100 for the bar width
              const pct      = budgeted > 0 ? (spent / budgeted) * 100 : 0;
              const pctBar   = Math.min(pct, 100);
              const over     = budgeted > 0 && spent > budgeted;
              const activeSubs = (cat.subcategories || []).filter(s => s.is_active !== false);

              return (
                <div key={cat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Category row */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: userFilter === 'all' ? '1fr 160px 150px 140px' : '1fr 120px 120px 140px',
                    gap: 12, padding: '12px 20px', alignItems: 'center',
                  }}>
                    {/* Name + controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: cat.color + '22', color: cat.color,
                        display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0,
                      }}>
                        {cat.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{cat.name}</div>
                        {/* Auto-budget badge — "Suscripciones" category */}
                        {isSubsCat && subsAmountForView > 0 && (() => {
                          const subsSubs = subscriptions.filter(s => s.category_id === subscriptionsCat?.id);
                          const count = userFilter === 'all'
                            ? subsSubs.length
                            : subsSubs.filter(s => s.user_id === userFilter).length;
                          return count > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <RefreshCw size={10} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: 'var(--primary)' }}>
                                {count} activa{count !== 1 ? 's' : ''} · automático
                              </span>
                            </div>
                          ) : null;
                        })()}
                        {/* Auto-budget badge — custom-category subs */}
                        {!isSubsCat && customSubForCat > 0 && (() => {
                          const catSubs = subscriptions.filter(s =>
                            s.category_id === cat.id &&
                            (userFilter === 'all' || s.user_id === userFilter)
                          );
                          return catSubs.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <RefreshCw size={10} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: 'var(--primary)' }}>
                                {catSubs.length} recurrente{catSubs.length !== 1 ? 's' : ''} · automático
                              </span>
                            </div>
                          ) : null;
                        })()}
                        {/* Auto-budget badge — active auto-pay debts */}
                        {!isSubsCat && debtForCat > 0 && (() => {
                          const catDebts = (allDebts || []).filter(d =>
                            d.auto_pay && d.status === 'active' && d.pending_amount > 0 &&
                            d.subcategory_id &&
                            categories.some(c => c.id === cat.id && (c.subcategories || []).some(s => s.id === d.subcategory_id)) &&
                            (userFilter === 'all' || !d.user_id || d.user_id === userFilter)
                          );
                          return catDebts.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <span style={{ fontSize: 10, flexShrink: 0 }}>💳</span>
                              <span style={{ fontSize: 11, color: 'var(--amber)' }}>
                                {catDebts.length} deuda{catDebts.length !== 1 ? 's' : ''} · automático
                              </span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                      {/* Action buttons — no delete for subscriptions category */}
                      {!isSubsCat && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            className="btn"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            title="Añadir subcategoría"
                            onClick={() => setSubFormCat(cat)}
                          >
                            <Plus size={11} /> Sub
                          </button>
                          <button
                            className="btn"
                            style={{ color: 'var(--text-mute)', padding: '3px 8px' }}
                            title="Desactivar categoría"
                            onClick={() => handleDeleteCategory(cat)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Budget cell — in all-users view: total + per-user breakdown */}
                    <div style={{ textAlign: 'right' }}>
                      {userFilter === 'all' ? (
                        <div>
                          {/* Total */}
                          <span className="mono" style={{ fontSize: 13, color: budgeted > 0 ? 'var(--text)' : 'var(--text-mute)' }}>
                            {budgeted > 0 ? fmt(budgeted, { compact: true }) : '—'}
                          </span>

                          {/* Stacked proportion bar */}
                          {budgeted > 0 && effectiveByUser && Object.keys(effectiveByUser).length > 1 && (
                            <div style={{ display: 'flex', height: 3, borderRadius: 99, overflow: 'hidden', marginTop: 5, marginBottom: 4 }}>
                              {Object.entries(effectiveByUser).map(([uid, amt]) => {
                                const u = users.find(u => u.id === uid);
                                return u ? (
                                  <div key={uid} style={{ width: `${(amt / budgeted) * 100}%`, background: u.color }} />
                                ) : null;
                              })}
                            </div>
                          )}

                          {/* Per-user amounts */}
                          {effectiveByUser && Object.entries(effectiveByUser).map(([uid, amt]) => {
                            const u = users.find(u => u.id === uid);
                            const pct = budgeted > 0 ? Math.round((amt / budgeted) * 100) : 0;
                            return u ? (
                              <div key={uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{u.name}</span>
                                <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmt(amt, { compact: true })}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-mute)', minWidth: 26 }}>({pct}%)</span>
                              </div>
                            ) : null;
                          })}
                          {/* Auto portion from custom-category subs (all-users view) */}
                          {!isSubsCat && customSubForCat > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 4 }}>
                              <RefreshCw size={9} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                              <span className="mono" style={{ fontSize: 11, color: 'var(--primary)' }}>
                                +{fmt(customSubForCat, { compact: true })} subs
                              </span>
                            </div>
                          )}
                          {/* Auto portion from debt installments (all-users view) */}
                          {!isSubsCat && debtForCat > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 }}>
                              <span style={{ fontSize: 9 }}>💳</span>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>
                                +{fmt(debtForCat, { compact: true })} deudas
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <BudgetCell
                            categoryId={cat.id}
                            amount={isSubsCat ? budgeted : manualBudget}
                            editable={!isSubsCat}
                            onSave={handleBudgetSave}
                          />
                          {/* Auto portion from recurring subscriptions */}
                          {customSubForCat > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 }}>
                              <RefreshCw size={9} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                              <span className="mono" style={{ fontSize: 11, color: 'var(--primary)' }}>
                                +{fmt(customSubForCat, { compact: true })}
                              </span>
                            </div>
                          )}
                          {/* Auto portion from active debt installments */}
                          {debtForCat > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 }}>
                              <span style={{ fontSize: 9 }}>💳</span>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>
                                +{fmt(debtForCat, { compact: true })}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Spent — in all-users view shows per-user breakdown */}
                    <div style={{ textAlign: 'right' }}>
                      <span className="mono" style={{ fontSize: 13, color: over ? 'var(--red)' : 'var(--text-dim)' }}>
                        {spent > 0 ? fmt(spent, { compact: true }) : '—'}
                      </span>
                      {userFilter === 'all' && users.map(u => {
                        const uSpent = spentByCategoryAndUser[cat.id]?.[u.id] ?? 0;
                        return (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{u.name}</span>
                            <span className="mono" style={{ fontSize: 11, color: uSpent > 0 ? 'var(--text-dim)' : 'var(--text-mute)' }}>
                              {uSpent > 0 ? fmt(uSpent, { compact: true }) : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar */}
                    <div>
                      {budgeted > 0 ? (
                        <>
                          <div className="bar" style={{ marginBottom: 4 }}>
                            <div className="bar-fill" style={{
                              width: `${pctBar}%`,
                              background: over ? 'var(--red)' : pct > 85 ? 'var(--amber)' : `linear-gradient(90deg, ${cat.color}, ${cat.color}aa)`,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--text-mute)', fontWeight: over ? 600 : 400 }} className="mono">
                            {pct.toFixed(0)}%{over && ' ↑ sobre presupuesto'}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
                          {isSubsCat ? '—' : userFilter === 'all' ? '—' : 'Click en presupuesto para agregar'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Subcategory rows — same 4-column grid as category row */}
                  {activeSubs.map(sub => {
                    const subSpent = spentBySubcategory[sub.id] ?? 0;
                    const subPct   = spent > 0 ? (subSpent / spent) * 100 : 0;
                    return (
                      <div
                        key={sub.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: userFilter === 'all' ? '1fr 160px 150px 140px' : '1fr 120px 120px 140px',
                          gap: 12,
                          padding: '5px 20px',
                          background: 'var(--bg-2)',
                          borderTop: '1px solid var(--border)',
                          alignItems: 'center',
                        }}
                      >
                        {/* Name — indented to align under category name text */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 42, minWidth: 0 }}>
                          <span style={{ fontSize: 13, flexShrink: 0 }}>{sub.icon || '·'}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sub.name}
                          </span>
                          <button
                            className="btn"
                            style={{ color: 'var(--text-mute)', padding: '2px 5px', fontSize: 11, flexShrink: 0 }}
                            title="Eliminar subcategoría"
                            onClick={() => handleDeleteSubcategory(sub.id, sub.name)}
                          >
                            <X size={11} />
                          </button>
                        </div>

                        {/* Budget — no per-subcategory budget */}
                        <div />

                        {/* Spent */}
                        <div style={{ textAlign: 'right' }}>
                          <span className="mono" style={{ fontSize: 12, color: subSpent > 0 ? 'var(--text-dim)' : 'var(--text-mute)' }}>
                            {subSpent > 0 ? fmt(subSpent, { compact: true }) : '—'}
                          </span>
                        </div>

                        {/* % of category total */}
                        <div>
                          {subSpent > 0 && spent > 0 ? (
                            <>
                              <div className="bar" style={{ height: 4, marginBottom: 3 }}>
                                <div className="bar-fill" style={{ width: `${Math.min(subPct, 100)}%`, height: 4, background: cat.color + '88' }} />
                              </div>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                                {subPct.toFixed(0)}% del total
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>Sin gastos</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Archived categories: inactive cats with a budget entry in this past month */}
            {!budgetLoading && archivedCatsWithBudget.length > 0 && (
              <>
                <div style={{
                  padding: '7px 20px', background: 'var(--bg-2)',
                  borderTop: '2px dashed var(--border)',
                  fontSize: 11, color: 'var(--text-mute)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Categorías archivadas
                </div>
                {archivedCatsWithBudget.map(({ cat, budgetAmt, spent }) => {
                  const pct  = budgetAmt > 0 ? (spent / budgetAmt) * 100 : 0;
                  const over = budgetAmt > 0 && spent > budgetAmt;
                  return (
                    <div key={cat.id} style={{
                      display: 'grid',
                      gridTemplateColumns: userFilter === 'all' ? '1fr 160px 150px 140px' : '1fr 120px 120px 140px',
                      gap: 12, padding: '12px 20px', alignItems: 'center',
                      borderBottom: '1px solid var(--border)', opacity: 0.7,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: cat.color + '22', color: cat.color,
                          display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0,
                        }}>
                          {cat.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-dim)', textDecoration: 'line-through' }}>
                            {cat.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>Archivada</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                          {fmt(budgetAmt, { compact: true })}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="mono" style={{ fontSize: 13, color: over ? 'var(--red)' : 'var(--text-dim)' }}>
                          {spent > 0 ? fmt(spent, { compact: true }) : '—'}
                        </span>
                      </div>
                      <div>
                        {budgetAmt > 0 && (
                          <>
                            <div className="bar" style={{ marginBottom: 4 }}>
                              <div className="bar-fill" style={{
                                width: `${Math.min(pct, 100)}%`,
                                background: over ? 'var(--red)' : 'var(--text-mute)',
                              }} />
                            </div>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                              {pct.toFixed(0)}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {userFilter === 'all' && (
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-mute)', textAlign: 'center' }}>
              Selecciona un usuario para editar los montos presupuestados
            </p>
          )}

          {/* ── Deleted categories that still have transactions ── */}
          {deletedCatsWithActivity.length > 0 && (
            <div className="card flush" style={{ marginTop: 20, borderColor: 'rgba(239,68,68,0.35)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 20px', background: 'rgba(239,68,68,0.06)',
                borderBottom: '1px solid rgba(239,68,68,0.2)',
              }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--red)' }}>
                    Categorías eliminadas con transacciones
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-mute)', marginLeft: 10 }}>
                    este año · migra sus transacciones para limpiar el historial
                  </span>
                </div>
              </div>

              {deletedCatsWithActivity.map(({ cat, count, spent }) => (
                <div
                  key={cat.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: userFilter === 'all' ? '1fr 160px 150px 140px' : '1fr 120px 120px 140px',
                    gap: 12, padding: '12px 20px', alignItems: 'center',
                    borderBottom: '1px solid var(--border)', opacity: 0.85,
                  }}
                >
                  {/* Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(239,68,68,0.1)', color: 'var(--red)',
                      display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0,
                    }}>
                      {cat.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-dim)', textDecoration: 'line-through' }}>
                        {cat.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                        {count} transacción{count !== 1 ? 'es' : ''} este año
                      </div>
                    </div>
                  </div>

                  {/* No budget */}
                  <div />

                  {/* Spent */}
                  <div style={{ textAlign: 'right' }}>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                      {fmt(spent, { compact: true })}
                    </span>
                  </div>

                  {/* Migrate button */}
                  <div>
                    <button
                      className="btn"
                      style={{ fontSize: 12, borderColor: 'var(--red)', color: 'var(--red)' }}
                      onClick={() => { setMigrationSource(cat); setMigrationMigrated(null); setMigrationError(null); }}
                    >
                      Migrar →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── INCOME TAB ────────────────────────────────────────────────────────── */}
      {tab === 'income' && (
        <>
          {/* One-time seed button — generates income transactions for all historical months */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              className="btn"
              style={{ fontSize: 13 }}
              disabled={seedingIncome}
              onClick={async () => {
                setSeedingIncome(true);
                try {
                  const { created } = await seedIncomeHistory();
                  if (created > 0) {
                    await reloadTransactions();
                    alert(`✓ Se crearon ${created} transacciones de ingreso para el historial.`);
                  } else {
                    alert('El historial ya estaba al día — no se crearon transacciones nuevas.');
                  }
                } catch (err) {
                  alert(`Error: ${err?.response?.data?.detail ?? err?.message ?? err}`);
                } finally {
                  setSeedingIncome(false);
                }
              }}
            >
              {seedingIncome ? 'Generando…' : '💰 Generar ingresos históricos'}
            </button>
          </div>

          {/* KPIs — always use all-users totals regardless of userFilter */}
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="kpi-label">Ingresos totales</div>
              <div className="kpi-value mono">{fmt(totalIncome, { compact: true })}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Presupuestado</div>
              <div className="kpi-value mono" style={{ color: totalBudgetAllUsers > totalIncome && totalIncome > 0 ? 'var(--red)' : 'var(--text)' }}>
                {fmt(totalBudgetAllUsers, { compact: true })}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Libre sin presupuestar</div>
              <div className="kpi-value mono" style={{ color: totalIncome - totalBudgetAllUsers < 0 ? 'var(--red)' : 'var(--green)' }}>
                {totalIncome > 0 ? fmt(totalIncome - totalBudgetAllUsers, { compact: true, sign: true }) : '—'}
              </div>
            </div>
          </div>

          {/* Distribution bar — % of income committed to budget */}
          {totalIncome > 0 && (
            <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
                <span>Comprometido en presupuesto</span>
                <span className="mono" style={{ fontWeight: 600, color: totalBudgetAllUsers > totalIncome ? 'var(--red)' : 'var(--text)' }}>
                  {Math.round((totalBudgetAllUsers / totalIncome) * 100)}%
                </span>
              </div>
              <div className="bar" style={{ height: 10 }}>
                <div className="bar-fill" style={{
                  width: `${Math.min((totalBudgetAllUsers / totalIncome) * 100, 100)}%`,
                  height: 10,
                  background: totalBudgetAllUsers > totalIncome ? 'var(--red)' : totalBudgetAllUsers / totalIncome > 0.85 ? 'var(--amber)' : 'var(--primary)',
                }} />
              </div>
              {totalBudgetAllUsers > totalIncome && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <AlertTriangle size={13} />
                  Presupuesto excede ingresos en {fmt(totalBudgetAllUsers - totalIncome, { compact: true })}
                </div>
              )}
            </div>
          )}

          {/* Per-user income cards */}
          {users.length === 0 ? (
            <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>
              Cargando usuarios…
            </div>
          ) : (
            <div className="grid grid-2">
              {users.map(u => (
                <UserIncomeCard
                  key={u.id}
                  user={u}
                  amount={incomeMap[u.id] ?? 0}
                  primaTotal={primasAmountByUser[u.id] ?? 0}
                  budgetForUser={budgetPerUser[u.id] ?? 0}
                  totalIncome={totalIncome}
                  onSave={handleIncomeSave}
                  history={incomeHistories[u.id] ?? []}
                  userPrimas={primas.filter(p => p.user_id === u.id)}
                  onAddPrima={handleAddPrima}
                  onEditPrima={handleEditPrima}
                  onDeletePrima={handleDeletePrima}
                />
              ))}
            </div>
          )}

          {/* Prima create / edit modal */}
          <Modal
            open={showPrimaForm}
            title={editingPrima ? 'Editar prima' : 'Agregar prima'}
            onClose={() => { setShowPrimaForm(false); setEditingPrima(null); }}
          >
            {showPrimaForm && (
              <PrimaForm
                userId={primaTargetUser}
                users={users}
                userIncome={incomeMap[primaTargetUser] ?? 0}
                initial={editingPrima}
                onSave={handleSavePrima}
                onCancel={() => { setShowPrimaForm(false); setEditingPrima(null); }}
              />
            )}
          </Modal>

          {totalIncome === 0 && (
            <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7 }}>
              · Haz click en el campo de ingreso de cada persona para configurarlo.<br/>
              · El ingreso se guarda con carry-forward: configuras en Mayo y aplica a todos los meses del año hasta que lo actualices.<br/>
              · Al actualizar (ej. por un aumento de sueldo) quedará registrado en el historial.
            </div>
          )}
        </>
      )}

      {/* ── DEBTS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'debts' && (
        <>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn primary" onClick={() => setShowDebtForm(true)}>
              <Plus size={16} /> Nueva deuda
            </button>
          </div>

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
                  onEdit={setEditingDebt}
                  onDelete={handleDeleteDebt}
                  onDeletePayment={handleDeletePayment}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SUBS TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'subs' && (
        <>
          {/* KPIs */}
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="kpi-label">Suscripciones activas</div>
              <div className="kpi-value">{subscriptions.length}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Gasto mensual fijo</div>
              <div className="kpi-value mono">{fmt(totalMonthlySubscriptions, { compact: true })}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Gasto anual estimado</div>
              <div className="kpi-value mono" style={{ color: 'var(--text-dim)' }}>
                {fmt(totalMonthlySubscriptions * 12, { compact: true })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn primary" onClick={() => setShowSubForm(true)}>
              <Plus size={16} /> Nueva suscripción
            </button>
          </div>

          {subscriptions.length === 0 ? (
            <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Sin suscripciones registradas</div>
              <div style={{ fontSize: 13 }}>Añade Netflix, Spotify u otras suscripciones recurrentes.<br/>Se cobrarán automáticamente como transacciones cada mes.</div>
            </div>
          ) : (
            <div className="grid grid-2">
              {subscriptions.map(sub => (
                <SubscriptionCard
                  key={sub.id}
                  sub={sub}
                  users={users}
                  categories={categories}
                  onEdit={setEditingSub}
                  onCancel={handleCancelSubscription}
                />
              ))}
            </div>
          )}

          <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>¿Cómo funcionan las suscripciones?</div>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7 }}>
              · Cada mes, al llegar el día de cobro configurado, se crea automáticamente una transacción de gasto.<br/>
              · Las transacciones aparecen en la lista de movimientos marcadas con el ícono 🔄.<br/>
              · Al cancelar una suscripción se guarda la fecha — las transacciones anteriores no se modifican.<br/>
              · El presupuesto de las categorías con suscripciones muestra el monto automático en la columna de suscripciones.
            </div>
          </div>
        </>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <Modal open={!!paymentTarget} onClose={() => setPaymentTarget(null)} title="Registrar abono">
        {paymentTarget && (
          <PaymentForm debt={paymentTarget} users={users} onSave={handleAddPayment} onCancel={() => setPaymentTarget(null)} />
        )}
      </Modal>

      <Modal open={showDebtForm} onClose={() => setShowDebtForm(false)} title="Nueva deuda">
        <DebtForm users={users} onSave={handleCreateDebt} onCancel={() => setShowDebtForm(false)} />
      </Modal>

      <Modal open={!!editingDebt} onClose={() => setEditingDebt(null)} title={`Editar — ${editingDebt?.name ?? ''}`}>
        {editingDebt && (
          <DebtForm initial={editingDebt} users={users} onSave={handleEditDebt} onCancel={() => setEditingDebt(null)} />
        )}
      </Modal>

      <Modal open={showCatForm} onClose={() => setShowCatForm(false)} title="Nueva categoría">
        <CategoryForm
          currentMaxOrder={maxSortOrder}
          onSave={handleCreateCategory}
          onCancel={() => setShowCatForm(false)}
        />
      </Modal>

      <Modal open={!!migrationSource} onClose={closeMigrationModal} title="Migrar transacciones">
        {migrationSource && (
          <MigrationForm
            source={migrationSource}
            activeCategories={activeCategories}
            onMigrate={handleMigrate}
            onCancel={closeMigrationModal}
            saving={migrationSaving}
            error={migrationError}
            migrated={migrationMigrated}
          />
        )}
      </Modal>

      <Modal open={!!subFormCat} onClose={() => { setSubFormCat(null); setSubFormError(null); }} title="Nueva subcategoría">
        {subFormCat && (
          <SubcategoryForm
            parentCat={subFormCat}
            onSave={(data) => handleCreateSubcategory(subFormCat.id, data)}
            onCancel={() => { setSubFormCat(null); setSubFormError(null); }}
            error={subFormError}
            saving={subFormSaving}
          />
        )}
      </Modal>

      <Modal open={showSubForm} onClose={() => setShowSubForm(false)} title="Nueva suscripción">
        {showSubForm && (
          <SubscriptionForm
            users={users}
            categories={activeCategories}
            onSave={handleCreateSubscription}
            onCancel={() => setShowSubForm(false)}
          />
        )}
      </Modal>

      <Modal open={!!editingSub} onClose={() => setEditingSub(null)} title={`Editar — ${editingSub?.name ?? ''}`}>
        {editingSub && (
          <SubscriptionEditForm
            sub={editingSub}
            users={users}
            categories={activeCategories}
            onSave={handleEditSubscription}
            onCancel={() => setEditingSub(null)}
          />
        )}
      </Modal>
    </div>
  );
}
