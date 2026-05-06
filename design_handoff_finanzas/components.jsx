// Shared components and helpers

const { useState, useMemo, useEffect, useRef } = React;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n, opts = {}) => {
  const { compact = false, sign = false } = opts;
  if (n == null || isNaN(n)) return '$0';
  const abs = Math.abs(n);
  let formatted;
  if (compact && abs >= 1000000) {
    formatted = `$${(n / 1000000).toFixed(1)}M`;
  } else if (compact && abs >= 1000) {
    formatted = `$${Math.round(n / 1000)}k`;
  } else {
    formatted = '$' + Math.round(n).toLocaleString('es-CO');
  }
  if (sign && n > 0) formatted = '+' + formatted;
  return formatted;
};

const monthName = (m) => ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1];
const monthLong = (m) => ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1];

const getCategory = (id) => window.APP_DATA.CATEGORIES.find(c => c.id === id) || window.APP_DATA.CATEGORIES.find(c => c.id === 'otros');
const getUser = (id) => window.APP_DATA.USERS.find(u => u.id === id);

// Filter txns by user filter ('all', 'belmont', 'sofi') and month
const filterTxns = (txns, userFilter, year, month) => {
  return txns.filter(t => {
    const d = new Date(t.date + 'T12:00:00');
    if (year != null && d.getFullYear() !== year) return false;
    if (month != null && d.getMonth() + 1 !== month) return false;
    if (userFilter !== 'all' && t.userId !== userFilter) return false;
    return true;
  });
};

// ─── Avatar ──────────────────────────────────────────────────────────────────
const Avatar = ({ user, size = 'sm' }) => {
  if (!user) return null;
  return (
    <span className={`avatar ${size === 'lg' ? 'lg' : ''}`} style={{ background: user.color }}>
      {user.avatar}
    </span>
  );
};

// ─── User Toggle (segmented) ─────────────────────────────────────────────────
const UserToggle = ({ value, onChange }) => {
  const opts = [
    { id: 'all', label: 'Conjunto', users: window.APP_DATA.USERS },
    { id: 'belmont', label: 'Belmont', user: getUser('belmont') },
    { id: 'sofi', label: 'Sofi', user: getUser('sofi') },
  ];
  return (
    <div className="seg">
      {opts.map(o => (
        <button
          key={o.id}
          className={value === o.id ? 'active' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.user ? <Avatar user={o.user}/> : (
            <span style={{display:'inline-flex', gap:-4}}>
              <Avatar user={window.APP_DATA.USERS[0]}/>
              <span style={{marginLeft:-6}}><Avatar user={window.APP_DATA.USERS[1]}/></span>
            </span>
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
};

// ─── Month Navigator ─────────────────────────────────────────────────────────
const MonthNav = ({ year, month, onChange }) => {
  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };
  return (
    <div className="month-nav">
      <button onClick={prev} aria-label="Anterior"><Icons.ChevronLeft size={16}/></button>
      <div className="lbl">{monthLong(month)} {year}</div>
      <button onClick={next} aria-label="Siguiente"><Icons.ChevronRight size={16}/></button>
    </div>
  );
};

// ─── Category chip ───────────────────────────────────────────────────────────
const CatChip = ({ catId }) => {
  const cat = getCategory(catId);
  return (
    <span className="cat-chip">
      <span className="cat-dot" style={{ background: cat.color }}/>
      {cat.label}
    </span>
  );
};

// ─── Modal ───────────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children, footer }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button className="btn icon ghost" onClick={onClose}><Icons.X size={16}/></button>
        </div>
        {children}
        {footer && <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
};

// ─── Transaction Form ────────────────────────────────────────────────────────
const TxnForm = ({ initial, onSave, onCancel, onDelete }) => {
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState(initial || {
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
      type: (form.category === 'ingreso' || form.category === 'ahorro') && form.type !== 'expense' ? 'income' : form.type,
    });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="field-label">Usuario</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {window.APP_DATA.USERS.map(u => (
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
                <Avatar user={u}/> {u.name}
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
              style={{ flex: 1, justifyContent: 'center',
                background: form.type === 'expense' ? 'rgba(251,113,133,0.12)' : 'var(--bg-2)',
                borderColor: form.type === 'expense' ? 'var(--red)' : 'var(--border)',
                color: form.type === 'expense' ? 'var(--red)' : 'var(--text)' }}
            >Gasto</button>
            <button
              type="button"
              onClick={() => set('type', 'income')}
              className="btn"
              style={{ flex: 1, justifyContent: 'center',
                background: form.type === 'income' ? 'rgba(52,211,153,0.12)' : 'var(--bg-2)',
                borderColor: form.type === 'income' ? 'var(--green)' : 'var(--border)',
                color: form.type === 'income' ? 'var(--green)' : 'var(--text)' }}
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
          {window.APP_DATA.CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 18 }}>
        {isEdit && onDelete ? (
          <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={onDelete}>
            <Icons.Trash size={14}/> Eliminar
          </button>
        ) : <span/>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn primary">
            {isEdit ? 'Guardar' : 'Crear transacción'}
          </button>
        </div>
      </div>
    </form>
  );
};

// ─── Donut Chart (SVG) ───────────────────────────────────────────────────────
const Donut = ({ data, total, centerLabel, centerValue }) => {
  const size = 180; const r = 70; const stroke = 18; const cx = size / 2; const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="donut-wrap" style={{width: size, height: size}}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke}/>
        {data.map((d, i) => {
          const len = (d.value / sum) * circumference;
          const dasharray = `${len} ${circumference - len}`;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="donut-center">
        <div>
          <div className="lbl">{centerLabel}</div>
          <div className="val mono">{centerValue}</div>
        </div>
      </div>
    </div>
  );
};

// ─── Bar Chart (last N months) ───────────────────────────────────────────────
const BarChart = ({ data, max }) => {
  return (
    <div className="barchart">
      {data.map((d, i) => (
        <div key={i} className="bcol">
          <div className="b-stack">
            {d.segments.map((s, j) => (
              <div
                key={j}
                className="b-seg"
                style={{
                  flexBasis: `${(s.value / max) * 100}%`,
                  background: s.color,
                }}
                title={`${s.label}: ${fmt(s.value, {compact: true})}`}
              />
            ))}
          </div>
          <div className="blbl">{d.label}</div>
        </div>
      ))}
    </div>
  );
};

window.Helpers = { fmt, monthName, monthLong, getCategory, getUser, filterTxns };
window.UI = { Avatar, UserToggle, MonthNav, CatChip, Modal, TxnForm, Donut, BarChart };
