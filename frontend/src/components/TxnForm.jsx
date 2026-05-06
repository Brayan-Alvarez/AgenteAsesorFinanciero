import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CATEGORIES, USERS } from '../data/categories.js';
import Avatar from './Avatar.jsx';

export default function TxnForm({ initial, onSave, onCancel, onDelete }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(initial ?? {
    userId: 'belmont',
    date: today,
    desc: '',
    category: 'almuerzos',
    amount: '',
    type: 'expense',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!initial?.id;

  const submit = (e) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;
    onSave({
      ...form,
      amount: Number(form.amount),
      type: (form.category === 'ingreso' || form.category === 'ahorro') && form.type !== 'expense'
        ? 'income'
        : form.type,
    });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Usuario</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {USERS.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => set('userId', u.id)}
                className="btn"
                style={{
                  flex: 1,
                  justifyContent: 'center',
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
            <button
              type="button"
              onClick={() => set('type', 'expense')}
              className="btn"
              style={{
                flex: 1, justifyContent: 'center',
                background: form.type === 'expense' ? 'rgba(251,113,133,0.12)' : 'var(--bg-2)',
                borderColor: form.type === 'expense' ? 'var(--red)' : 'var(--border)',
                color: form.type === 'expense' ? 'var(--red)' : 'var(--text)',
              }}
            >Gasto</button>
            <button
              type="button"
              onClick={() => set('type', 'income')}
              className="btn"
              style={{
                flex: 1, justifyContent: 'center',
                background: form.type === 'income' ? 'rgba(52,211,153,0.12)' : 'var(--bg-2)',
                borderColor: form.type === 'income' ? 'var(--green)' : 'var(--border)',
                color: form.type === 'income' ? 'var(--green)' : 'var(--text)',
              }}
            >Ingreso</button>
          </div>
        </div>
      </div>

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

      <div className="field">
        <label className="field-label">Categoría</label>
        <select
          className="select"
          value={form.category}
          onChange={e => set('category', e.target.value)}
        >
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

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
