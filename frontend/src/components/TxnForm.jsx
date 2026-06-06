import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext.jsx';
import Avatar from './Avatar.jsx';
import CategorySelector from './CategorySelector.jsx';

export default function TxnForm({ initial, onSave, onCancel, onDelete }) {
  const { users, categories, debtsBySubcategoryId } = useAppContext();

  // Only active categories are offered when creating/editing a transaction
  const activeCategories = categories.filter(c => c.is_active !== false);

  const today = new Date().toISOString().slice(0, 10);
  const defaultCategoryId = activeCategories[0]?.id ?? '';

  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        userId:        initial.userId,
        date:          initial.date,
        desc:          initial.desc,
        categoryId:    initial.categoryId ?? defaultCategoryId,
        subcategoryId: initial.subcategoryId ?? null,
        amount:        initial.amount,
        type:          initial.type,
        notes:         initial.notes ?? '',
      };
    }
    return {
      userId:        users[0]?.id ?? '',
      date:          today,
      desc:          '',
      categoryId:    defaultCategoryId,
      subcategoryId: null,
      amount:        '',
      type:          'expense',
      notes:         '',
    };
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!initial?.id;

  // If the selected subcategory belongs to a debt, show a badge and include debt_id on save
  const linkedDebt = form.subcategoryId ? debtsBySubcategoryId?.[form.subcategoryId] : null;

  const submit = (e) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;
    onSave({
      ...form,
      id:     initial?.id,
      amount: Number(form.amount),
      debtId: linkedDebt?.id ?? null,
    });
  };

  return (
    <form onSubmit={submit}>
      {/* User + Type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Usuario</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {users.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => set('userId', u.id)}
                className="btn"
                style={{
                  flex: 1, justifyContent: 'center',
                  background: form.userId === u.id ? 'var(--surface-2)' : 'var(--bg-2)',
                  borderColor: form.userId === u.id ? u.color : 'var(--border)',
                }}
              >
                <Avatar user={u} /> {u.name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Tipo</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['expense','Gasto','var(--red)','rgba(251,113,133,0.12)'],
              ['income','Ingreso','var(--green)','rgba(52,211,153,0.12)']].map(([val, label, color, bg]) => (
              <button
                key={val}
                type="button"
                onClick={() => set('type', val)}
                className="btn"
                style={{
                  flex: 1, justifyContent: 'center',
                  background: form.type === val ? bg : 'var(--bg-2)',
                  borderColor: form.type === val ? color : 'var(--border)',
                  color: form.type === val ? color : 'var(--text)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="field">
        <label className="field-label">Descripción</label>
        <input
          className="input"
          value={form.desc}
          onChange={e => set('desc', e.target.value)}
          placeholder="Ej: Almuerzo en El Corral"
          autoFocus
          required
        />
      </div>

      {/* Date + Amount */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Fecha</label>
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="field-label">Monto (COP)</label>
          <input
            type="number"
            className="input mono"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="0"
            min="0"
            required
          />
        </div>
      </div>

      {/* Category + subcategory in a single grouped dropdown */}
      <div className="field">
        <label className="field-label">Categoría</label>
        <CategorySelector
          categories={activeCategories}
          categoryId={form.categoryId}
          subcategoryId={form.subcategoryId}
          onChange={(catId, subId) => setForm(f => ({ ...f, categoryId: catId, subcategoryId: subId }))}
        />
        {/* Badge when the selected subcategory is linked to a debt */}
        {linkedDebt && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            padding: '7px 12px', borderRadius: 8,
            background: linkedDebt.color + '18',
            border: `1px solid ${linkedDebt.color}44`,
            fontSize: 12,
          }}>
            <span style={{ fontSize: 16 }}>💳</span>
            <div>
              <span style={{ fontWeight: 600, color: linkedDebt.color }}>{linkedDebt.name}</span>
              <span style={{ color: 'var(--text-mute)', marginLeft: 6 }}>
                Este pago se abonará a la deuda
                {linkedDebt.pending_amount > 0 && (
                  <> · Pendiente: <strong className="mono">${linkedDebt.pending_amount.toLocaleString('es-CO')}</strong></>
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="field">
        <label className="field-label">
          Notas <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(opcional)</span>
        </label>
        <input
          className="input"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Comentario adicional"
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 18 }}>
        {isEdit && onDelete ? (
          <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={onDelete}>
            <Trash2 size={14} /> Eliminar
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn primary">
            {isEdit ? 'Guardar' : 'Crear transacción'}
          </button>
        </div>
      </div>
    </form>
  );
}
