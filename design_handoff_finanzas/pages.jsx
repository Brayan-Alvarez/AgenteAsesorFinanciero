// Page-level components

const { fmt, monthName, monthLong, getCategory, getUser, filterTxns } = window.Helpers;
const { Avatar, UserToggle, MonthNav, CatChip, Modal, TxnForm, Donut, BarChart } = window.UI;

// ═══ Dashboard ═══════════════════════════════════════════════════════════════
function Dashboard({ state, setState, openTxnForm, dashboardLayout }) {
  const { transactions, budget } = state;
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);

  const txnsThisMonth = useMemo(
    () => filterTxns(transactions, state.userFilter, year, month),
    [transactions, state.userFilter, year, month]
  );

  const incomeTotal = txnsThisMonth.filter(t => t.type === 'income' && t.category === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = txnsThisMonth.filter(t => t.type === 'expense' || t.category === 'ahorro').reduce((s, t) => s + t.amount, 0);
  const savings = txnsThisMonth.filter(t => t.category === 'ahorro').reduce((s, t) => s + t.amount, 0);
  const balance = incomeTotal - expenseTotal;

  // Budget for this month - filter to relevant users
  const userMultiplier = state.userFilter === 'all' ? 2 : 1;
  const budgetTotal = Object.values(budget).reduce((s, m) => s + (m[month] || 0), 0) * userMultiplier;
  const budgetPct = budgetTotal > 0 ? (expenseTotal / budgetTotal) * 100 : 0;

  // Previous month for comparison
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevTxns = filterTxns(transactions, state.userFilter, prevYear, prevMonth);
  const prevExpense = prevTxns.filter(t => t.type === 'expense' || t.category === 'ahorro').reduce((s, t) => s + t.amount, 0);
  const expenseDelta = prevExpense > 0 ? ((expenseTotal - prevExpense) / prevExpense) * 100 : 0;

  // Spend by category
  const spendByCat = useMemo(() => {
    const map = {};
    txnsThisMonth.filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([id, value]) => ({ id, value, ...getCategory(id) }))
      .sort((a, b) => b.value - a.value);
  }, [txnsThisMonth]);

  const donutData = spendByCat.slice(0, 6).map(c => ({ value: c.value, color: c.color, label: c.label }));
  if (spendByCat.length > 6) {
    const rest = spendByCat.slice(6).reduce((s, c) => s + c.value, 0);
    donutData.push({ value: rest, color: '#3b3b5b', label: 'Otros' });
  }

  // Bar chart - last 6 months
  const barData = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) {
      let m = month - i; let y = year;
      while (m <= 0) { m += 12; y--; }
      const t = filterTxns(transactions, state.userFilter, y, m);
      const expense = t.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
      const savings = t.filter(x => x.category === 'ahorro').reduce((s, x) => s + x.amount, 0);
      arr.push({
        label: monthName(m),
        segments: [
          { value: expense, color: '#6366f1', label: 'Gastos' },
          { value: savings, color: '#34d399', label: 'Ahorro' },
        ]
      });
    }
    return arr;
  }, [transactions, state.userFilter, year, month]);
  const barMax = Math.max(...barData.map(d => d.segments.reduce((s, x) => s + x.value, 0))) * 1.1;

  // Categories vs budget
  const catVsBudget = useMemo(() => {
    return window.APP_DATA.CATEGORIES.filter(c => c.id !== 'ingreso').map(c => {
      const spent = txnsThisMonth.filter(t => t.category === c.id).reduce((s, t) => s + t.amount, 0);
      const budgeted = (budget[c.id]?.[month] || 0) * userMultiplier;
      return { ...c, spent, budgeted, pct: budgeted > 0 ? (spent / budgeted) * 100 : 0 };
    }).filter(c => c.spent > 0 || c.budgeted > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [txnsThisMonth, budget, month, userMultiplier]);

  // AI Insights
  const aiInsights = useMemo(() => {
    const out = [];
    catVsBudget.forEach(c => {
      if (c.pct > 100 && c.budgeted > 0) {
        out.push({
          type: 'warn',
          icon: <Icons.AlertTri size={16}/>,
          title: `Gasto excesivo en ${c.label}`,
          body: `Llevas ${fmt(c.spent, {compact:true})} de ${fmt(c.budgeted, {compact:true})} presupuestados (${Math.round(c.pct)}%). Considera frenar este rubro lo que resta del mes.`,
        });
      }
    });
    // Projection
    const today = new Date();
    const dayOfMonth = (today.getMonth() + 1 === month && today.getFullYear() === year) ? today.getDate() : 28;
    const daysInMonth = new Date(year, month, 0).getDate();
    const projected = (expenseTotal / Math.max(dayOfMonth, 1)) * daysInMonth;
    if (projected > budgetTotal && budgetTotal > 0) {
      out.push({
        type: 'proj',
        icon: <Icons.Trending size={16}/>,
        title: 'Proyección del mes',
        body: `Al ritmo actual, cerrarás el mes en ${fmt(projected, {compact:true})}, ${fmt(projected - budgetTotal, {compact:true})} por encima del presupuesto.`,
      });
    }
    // Comparison vs prev month
    if (Math.abs(expenseDelta) > 10) {
      out.push({
        type: expenseDelta > 0 ? 'warn' : 'up',
        icon: expenseDelta > 0 ? <Icons.ArrowUp size={16}/> : <Icons.ArrowDown size={16}/>,
        title: `${expenseDelta > 0 ? 'Aumento' : 'Reducción'} vs ${monthLong(prevMonth)}`,
        body: `Tus gastos ${expenseDelta > 0 ? 'subieron' : 'bajaron'} ${Math.abs(expenseDelta).toFixed(0)}% comparado con el mes pasado (${fmt(prevExpense, {compact:true})}).`,
      });
    }
    // Savings tip
    if (spendByCat[0]) {
      const top = spendByCat[0];
      out.push({
        type: 'tip',
        icon: <Icons.PiggyBank size={16}/>,
        title: 'Sugerencia de ahorro',
        body: `Tu mayor gasto este mes es ${top.label} (${fmt(top.value, {compact:true})}). Reducir 15% aquí te liberaría ${fmt(top.value * 0.15, {compact:true})} para ahorro.`,
      });
    }
    return out.slice(0, 4);
  }, [catVsBudget, expenseTotal, budgetTotal, expenseDelta, prevExpense, prevMonth, spendByCat, month, year]);

  // Recent txns
  const recent = txnsThisMonth.slice(0, 6);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Hola, {state.userFilter === 'all' ? 'pareja 💜' : (getUser(state.userFilter)?.name || '')}</h1>
          <div className="page-sub">{monthLong(month)} {year} · resumen del mes</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthNav year={year} month={month} onChange={(y,m) => { setYear(y); setMonth(m); }}/>
          <UserToggle value={state.userFilter} onChange={v => setState(s => ({...s, userFilter: v}))}/>
          <button className="btn primary" onClick={() => openTxnForm()}>
            <Icons.Plus size={16}/> Nueva
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="kpi-label">Ingresos</div>
          <div className="kpi-value mono" style={{ color: 'var(--green)' }}>{fmt(incomeTotal, {compact:true})}</div>
          <div className="kpi-foot">{txnsThisMonth.filter(t => t.category === 'ingreso').length} transacciones</div>
        </div>
        <div className="card">
          <div className="kpi-label">Gastos</div>
          <div className="kpi-value mono">{fmt(expenseTotal, {compact:true})}</div>
          <div className="kpi-foot">
            <span className={`pill ${expenseDelta > 0 ? 'down' : 'up'}`}>
              {expenseDelta > 0 ? <Icons.ArrowUp size={10}/> : <Icons.ArrowDown size={10}/>}
              {Math.abs(expenseDelta).toFixed(0)}%
            </span>
            vs mes anterior
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Balance</div>
          <div className="kpi-value mono" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmt(balance, {compact:true, sign:true})}
          </div>
          <div className="kpi-foot">Ingresos − Gastos</div>
        </div>
        <div className="card">
          <div className="kpi-label">Ahorro</div>
          <div className="kpi-value mono" style={{ color: 'var(--accent)' }}>{fmt(savings, {compact:true})}</div>
          <div className="kpi-foot">{incomeTotal > 0 ? Math.round(savings/incomeTotal*100) : 0}% de ingresos</div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Gastos vs presupuesto general</div>
            <div style={{fontSize: 22, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em'}} className="mono">
              {fmt(expenseTotal, {compact:true})} <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>/ {fmt(budgetTotal, {compact:true})}</span>
            </div>
          </div>
          <span className={`pill ${budgetPct > 100 ? 'down' : budgetPct > 85 ? 'warn' : 'up'}`}>
            {budgetPct.toFixed(0)}% usado
          </span>
        </div>
        <div className="bar" style={{ height: 10 }}>
          <div className="bar-fill" style={{
            width: `${Math.min(budgetPct, 100)}%`,
            background: budgetPct > 100 ? 'var(--red)' : budgetPct > 85 ? 'var(--amber)' : 'linear-gradient(90deg, #6366f1, #a78bfa)',
          }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-mute)' }}>
          <span>{fmt(Math.max(budgetTotal - expenseTotal, 0), {compact:true})} restante</span>
          <span>Faltan {new Date(year, month, 0).getDate() - new Date().getDate()} días</span>
        </div>
      </div>

      {/* Two-col: chart + AI */}
      <div className="grid grid-12" style={{ marginBottom: 20 }}>
        <div className="col-8">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Gastos por categoría</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'center' }}>
              <Donut data={donutData} centerLabel="Total mes" centerValue={fmt(expenseTotal, {compact:true})}/>
              <div className="legend">
                {donutData.slice(0, 7).map((d, i) => (
                  <div key={i} className="legend-row">
                    <span className="cat-dot" style={{ background: d.color, width: 10, height: 10 }}/>
                    <span className="name">{d.label}</span>
                    <span className="pct mono">{fmt(d.value, {compact:true})}</span>
                    <span style={{ color: 'var(--text-mute)', fontSize: 12, minWidth: 36, textAlign: 'right' }} className="mono">
                      {expenseTotal > 0 ? Math.round(d.value/expenseTotal*100) : 0}%
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
                <Icons.Sparkle size={14}/> Recomendaciones IA
              </div>
            </div>
            <div>
              {aiInsights.map((ins, i) => (
                <div key={i} className="insight">
                  <div className={`insight-icon ${ins.type}`}>{ins.icon}</div>
                  <div style={{minWidth:0}}>
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
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1' }}/> Gastos
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399' }}/> Ahorro
                </span>
              </div>
            </div>
            <BarChart data={barData} max={barMax || 1}/>
          </div>
        </div>
        <div className="col-6">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Categorías vs presupuesto</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {catVsBudget.slice(0, 6).map(c => (
                <div key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="cat-dot" style={{ background: c.color, width: 9, height: 9 }}/>
                      {c.label}
                    </span>
                    <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      <span style={{color: c.pct > 100 ? 'var(--red)' : 'var(--text)' }}>{fmt(c.spent, {compact:true})}</span>
                      <span> / {fmt(c.budgeted, {compact:true})}</span>
                    </span>
                  </div>
                  <div className="bar">
                    <div className="bar-fill" style={{
                      width: `${Math.min(c.pct, 100)}%`,
                      background: c.pct > 100 ? 'var(--red)' : c.pct > 85 ? 'var(--amber)' : c.color,
                    }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card flush">
        <div style={{ padding: '20px 22px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">Últimas transacciones</div>
          <button className="card-action" onClick={() => setState(s => ({...s, page: 'transactions'}))}>Ver todas →</button>
        </div>
        <table>
          <thead>
            <tr><th>Descripción</th><th>Categoría</th><th>Usuario</th><th>Fecha</th><th className="amt">Monto</th></tr>
          </thead>
          <tbody>
            {recent.map(t => {
              const u = getUser(t.userId);
              return (
                <tr key={t.id} onClick={() => openTxnForm(t)} style={{cursor:'pointer'}}>
                  <td>{t.desc}</td>
                  <td><CatChip catId={t.category}/></td>
                  <td><span style={{ display:'inline-flex', gap:8, alignItems:'center' }}><Avatar user={u}/> {u.name}</span></td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t.date.slice(8,10)}/{t.date.slice(5,7)}</td>
                  <td className={`amt mono`} style={{ color: t.type === 'income' ? 'var(--green)' : 'var(--text)' }}>
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

// ═══ Transactions Page ═══════════════════════════════════════════════════════
function TransactionsPage({ state, setState, openTxnForm }) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const txns = useMemo(() => {
    let list = filterTxns(state.transactions, state.userFilter, year, month);
    if (search) list = list.filter(t => t.desc.toLowerCase().includes(search.toLowerCase()));
    if (catFilter !== 'all') list = list.filter(t => t.category === catFilter);
    return list;
  }, [state.transactions, state.userFilter, year, month, search, catFilter]);

  const total = txns.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  const totalIn = txns.filter(t => t.type === 'income' && t.category === 'ingreso').reduce((s,t) => s+t.amount, 0);

  // Group by date
  const grouped = useMemo(() => {
    const g = {};
    txns.forEach(t => { (g[t.date] = g[t.date] || []).push(t); });
    return Object.entries(g).sort((a,b) => b[0].localeCompare(a[0]));
  }, [txns]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Transacciones</h1>
          <div className="page-sub">{txns.length} movimientos · {monthLong(month)} {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthNav year={year} month={month} onChange={(y,m) => { setYear(y); setMonth(m); }}/>
          <UserToggle value={state.userFilter} onChange={v => setState(s => ({...s, userFilter: v}))}/>
          <button className="btn primary" onClick={() => openTxnForm()}><Icons.Plus size={16}/> Nueva</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="kpi-label">Ingresos del mes</div>
          <div className="kpi-value mono" style={{ color: 'var(--green)' }}>{fmt(totalIn, {compact:true})}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Gastos del mes</div>
          <div className="kpi-value mono">{fmt(total, {compact:true})}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Balance</div>
          <div className="kpi-value mono" style={{ color: (totalIn-total) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {fmt(totalIn - total, {compact:true, sign:true})}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Icons.Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)' }}/>
          <input
            className="input"
            placeholder="Buscar transacción..."
            style={{ paddingLeft: 36 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {window.APP_DATA.CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

      {/* Grouped table */}
      <div className="card flush">
        {grouped.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-mute)' }}>
            No hay transacciones para mostrar
          </div>
        ) : grouped.map(([date, list]) => {
          const d = new Date(date + 'T12:00:00');
          const dayTotal = list.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
          return (
            <div key={date}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '14px 22px', background: 'var(--bg-2)',
                fontSize: 12, color: 'var(--text-mute)',
                fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
                borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)',
              }}>
                <span>{['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]} {d.getDate()} de {monthLong(d.getMonth()+1)}</span>
                <span className="mono">−{fmt(dayTotal, {compact:true})}</span>
              </div>
              <table>
                <tbody>
                  {list.map(t => {
                    const u = getUser(t.userId);
                    const cat = getCategory(t.category);
                    return (
                      <tr key={t.id} onClick={() => openTxnForm(t)} style={{ cursor:'pointer' }}>
                        <td style={{ width: 44 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: cat.color + '22', color: cat.color,
                            display: 'grid', placeItems: 'center', fontSize: 16
                          }}>{cat.icon}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{t.desc}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{cat.label}</div>
                        </td>
                        <td><span style={{ display:'inline-flex', gap:8, alignItems:'center', fontSize:13, color:'var(--text-dim)' }}><Avatar user={u}/> {u.name}</span></td>
                        <td className={`amt mono`} style={{ color: t.type === 'income' ? 'var(--green)' : 'var(--text)', fontWeight: 500 }}>
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

// ═══ Budget Page ═════════════════════════════════════════════════════════════
function BudgetPage({ state, setState }) {
  const [view, setView] = useState('category'); // 'category' or 'month'
  const [year, setYear] = useState(2026);

  const updateBudget = (catId, m, value) => {
    setState(s => ({
      ...s,
      budget: {
        ...s.budget,
        [catId]: { ...s.budget[catId], [m]: Number(value) || 0 }
      }
    }));
  };

  const cats = window.APP_DATA.CATEGORIES.filter(c => c.id !== 'ingreso');

  // Totals
  const monthTotals = {};
  for (let m = 1; m <= 12; m++) {
    monthTotals[m] = cats.reduce((s, c) => s + (state.budget[c.id]?.[m] || 0), 0);
  }
  const annualTotal = Object.values(monthTotals).reduce((s, v) => s + v, 0);

  // Spent vs budget by month
  const spentByMonth = useMemo(() => {
    const out = {};
    for (let m = 1; m <= 12; m++) {
      const t = filterTxns(state.transactions, state.userFilter, year, m);
      out[m] = t.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
    }
    return out;
  }, [state.transactions, state.userFilter, year]);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Presupuesto {year}</h1>
          <div className="page-sub">Total anual: <span className="mono" style={{color:'var(--text)'}}>{fmt(annualTotal, {compact:true})}</span> · {fmt(annualTotal/12, {compact:true})}/mes promedio</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg">
            <button className={view === 'category' ? 'active' : ''} onClick={() => setView('category')}>Por categoría</button>
            <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Por mes</button>
          </div>
          <UserToggle value={state.userFilter} onChange={v => setState(s => ({...s, userFilter: v}))}/>
        </div>
      </div>

      {view === 'category' ? (
        <div className="card flush">
          <div className="budget-table">
            <div className="budget-grid">
              <div className="hd">Categoría</div>
              {Array.from({length: 12}, (_, i) => (
                <div key={i} className="hd num-cell">{monthName(i+1)}</div>
              ))}
              <div className="hd num-cell">Total</div>

              {cats.map(c => {
                const rowTotal = Array.from({length:12}, (_,i) => state.budget[c.id]?.[i+1] || 0).reduce((s,v)=>s+v,0);
                return (
                  <React.Fragment key={c.id}>
                    <div className="row-cat">
                      <span className="cat-dot" style={{ background: c.color }}/>
                      {c.label}
                    </div>
                    {Array.from({length: 12}, (_, i) => {
                      const m = i + 1;
                      const v = state.budget[c.id]?.[m] || 0;
                      return (
                        <div key={m} className="num-cell">
                          <input
                            type="number"
                            value={v || ''}
                            onChange={e => updateBudget(c.id, m, e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      );
                    })}
                    <div className="num-cell total">{fmt(rowTotal, {compact:true})}</div>
                  </React.Fragment>
                );
              })}

              {/* Footer totals */}
              <div className="row-cat" style={{fontWeight: 600, borderTop: '2px solid var(--border-2)'}}>Total mes</div>
              {Array.from({length: 12}, (_, i) => {
                const m = i + 1;
                return (
                  <div key={m} className="num-cell total" style={{borderTop: '2px solid var(--border-2)'}}>{fmt(monthTotals[m], {compact:true})}</div>
                );
              })}
              <div className="num-cell total" style={{borderTop: '2px solid var(--border-2)', color: 'var(--accent)'}}>{fmt(annualTotal, {compact:true})}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-3">
          {Array.from({length: 12}, (_, i) => {
            const m = i + 1;
            const budgeted = monthTotals[m];
            const spent = spentByMonth[m];
            const pct = budgeted > 0 ? (spent / budgeted) * 100 : 0;
            return (
              <div key={m} className="card">
                <div className="card-head">
                  <div>
                    <div style={{fontSize: 11, color:'var(--text-mute)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{year}</div>
                    <div style={{fontSize: 18, fontWeight: 600, marginTop: 4}}>{monthLong(m)}</div>
                  </div>
                  <span className={`pill ${pct > 100 ? 'down' : pct > 85 ? 'warn' : 'up'}`}>{pct.toFixed(0)}%</span>
                </div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
                  {fmt(spent, {compact:true})}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 10 }} className="mono">
                  de {fmt(budgeted, {compact:true}) }
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{
                    width: `${Math.min(pct, 100)}%`,
                    background: pct > 100 ? 'var(--red)' : pct > 85 ? 'var(--amber)' : 'linear-gradient(90deg, #6366f1, #a78bfa)',
                  }}/>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }} className="mono">
                  <span>Restante</span>
                  <span style={{color: budgeted - spent < 0 ? 'var(--red)' : 'var(--text)'}}>
                    {fmt(budgeted - spent, {compact:true, sign: true})}
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

// ═══ AI Recommendations Page ═════════════════════════════════════════════════
function RecommendationsPage({ state, setState }) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);

  const txns = filterTxns(state.transactions, state.userFilter, year, month);
  const expense = txns.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  const income = txns.filter(t => t.category === 'ingreso').reduce((s,t) => s+t.amount, 0);
  const savings = txns.filter(t => t.category === 'ahorro').reduce((s,t) => s+t.amount, 0);

  const userMultiplier = state.userFilter === 'all' ? 2 : 1;
  const budgetTotal = Object.values(state.budget).reduce((s, m) => s + (m[month] || 0), 0) * userMultiplier;

  const byCat = {};
  txns.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category]||0) + t.amount; });
  const sortedCats = Object.entries(byCat).map(([id,v]) => ({id, v, ...getCategory(id)})).sort((a,b)=>b.v-a.v);

  // Generate recommendations
  const recs = [];

  // Overspending alerts
  window.APP_DATA.CATEGORIES.filter(c => c.id !== 'ingreso').forEach(c => {
    const spent = byCat[c.id] || 0;
    const budgeted = (state.budget[c.id]?.[month] || 0) * userMultiplier;
    if (budgeted > 0 && spent > budgeted) {
      recs.push({
        priority: 1,
        type: 'warn',
        icon: <Icons.AlertTri size={18}/>,
        title: `${c.label}: presupuesto excedido`,
        body: `Gastaste ${fmt(spent, {compact:true})} de los ${fmt(budgeted, {compact:true})} presupuestados (${Math.round((spent/budgeted)*100)}%). Sobrepaso de ${fmt(spent - budgeted, {compact:true})}.`,
        action: 'Ajustar presupuesto',
      });
    }
  });

  // Projection
  const today = new Date();
  const dayOfMonth = (today.getMonth()+1 === month && today.getFullYear() === year) ? today.getDate() : 28;
  const daysInMonth = new Date(year, month, 0).getDate();
  const projected = (expense / Math.max(dayOfMonth,1)) * daysInMonth;
  if (budgetTotal > 0) {
    recs.push({
      priority: 2,
      type: 'proj',
      icon: <Icons.Trending size={18}/>,
      title: 'Proyección al cierre del mes',
      body: `Al ritmo actual cerrarás en ${fmt(projected, {compact:true})}. ${projected > budgetTotal ? `Excederás el presupuesto en ${fmt(projected - budgetTotal, {compact:true})}.` : `Quedarás ${fmt(budgetTotal - projected, {compact:true})} bajo presupuesto. ¡Vas bien!`}`,
      action: 'Ver detalle',
    });
  }

  // Savings tip
  if (sortedCats[0]) {
    recs.push({
      priority: 3,
      type: 'tip',
      icon: <Icons.PiggyBank size={18}/>,
      title: `Reducir ${sortedCats[0].label}`,
      body: `Es tu mayor gasto este mes (${fmt(sortedCats[0].v, {compact:true})}). Recortar 20% liberaría ${fmt(sortedCats[0].v * 0.2, {compact:true})} para ahorro o pago de deudas.`,
      action: 'Crear meta',
    });
  }

  // Comparison
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevTxns = filterTxns(state.transactions, state.userFilter, prevYear, prevMonth);
  const prevExpense = prevTxns.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  if (prevExpense > 0) {
    const delta = expense - prevExpense;
    const deltaPct = (delta / prevExpense) * 100;
    recs.push({
      priority: 4,
      type: delta > 0 ? 'warn' : 'up',
      icon: delta > 0 ? <Icons.ArrowUp size={18}/> : <Icons.ArrowDown size={18}/>,
      title: `Comparación con ${monthLong(prevMonth)}`,
      body: `Gastos ${delta > 0 ? 'aumentaron' : 'disminuyeron'} ${Math.abs(deltaPct).toFixed(1)}% (${fmt(Math.abs(delta), {compact:true})}) frente a ${monthLong(prevMonth)}. ${delta > 0 ? 'Revisa qué cambió este mes.' : '¡Felicitaciones por la mejora!'}`,
      action: 'Ver comparación',
    });
  }

  // Savings rate
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  if (income > 0) {
    recs.push({
      priority: 5,
      type: savingsRate >= 20 ? 'up' : 'tip',
      icon: <Icons.Target size={18}/>,
      title: `Tasa de ahorro: ${savingsRate.toFixed(1)}%`,
      body: savingsRate >= 20
        ? `¡Excelente! Estás ahorrando ${savingsRate.toFixed(0)}% de tus ingresos, por encima del 20% recomendado.`
        : `Estás ahorrando ${savingsRate.toFixed(0)}% de tus ingresos. La meta saludable es 20%. Considera aumentar a ${fmt(income * 0.2, {compact:true})}/mes.`,
      action: 'Definir meta',
    });
  }

  // Subscriptions check
  const subs = byCat['suscripciones'] || 0;
  if (subs > 0) {
    recs.push({
      priority: 6,
      type: 'tip',
      icon: <Icons.Bell size={18}/>,
      title: 'Revisa tus suscripciones',
      body: `Llevas ${fmt(subs, {compact:true})} en suscripciones este mes. Cancelar las que no usas frecuentemente puede ahorrarte cientos de miles al año.`,
      action: 'Revisar',
    });
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title" style={{display:'flex', alignItems:'center', gap:10}}>
            <Icons.Sparkle size={26}/> Recomendaciones IA
          </h1>
          <div className="page-sub">Análisis inteligente · {monthLong(month)} {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthNav year={year} month={month} onChange={(y,m) => { setYear(y); setMonth(m); }}/>
          <UserToggle value={state.userFilter} onChange={v => setState(s => ({...s, userFilter: v}))}/>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(167,139,250,0.05))',
          borderColor: 'rgba(129,140,248,0.3)',
        }}>
          <div className="kpi-label" style={{display:'flex', gap:6, alignItems:'center'}}>
            <Icons.Sparkle size={12}/> Estado del mes
          </div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {budgetTotal > 0 && expense > budgetTotal ? 'Excediendo' :
             budgetTotal > 0 && expense > budgetTotal * 0.85 ? 'Atención' :
             'En curso'}
          </div>
          <div className="kpi-foot">
            {budgetTotal > 0 ? `${Math.round(expense/budgetTotal*100)}% del presupuesto usado` : 'Define tu presupuesto'}
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Tasa de ahorro</div>
          <div className="kpi-value mono" style={{color: 'var(--accent)'}}>{savingsRate.toFixed(1)}%</div>
          <div className="kpi-foot">Meta sugerida: 20%</div>
        </div>
        <div className="card">
          <div className="kpi-label">Recomendaciones activas</div>
          <div className="kpi-value">{recs.length}</div>
          <div className="kpi-foot">{recs.filter(r => r.type === 'warn').length} alertas · {recs.filter(r => r.type === 'tip').length} sugerencias</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {recs.sort((a,b)=>a.priority-b.priority).map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className={`insight-icon ${r.type}`} style={{ width: 44, height: 44, fontSize: 18 }}>{r.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{r.title}</div>
              <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.55 }}>{r.body}</div>
            </div>
            <button className="btn sm">{r.action} →</button>
          </div>
        ))}
      </div>
    </div>
  );
}

window.Pages = { Dashboard, TransactionsPage, BudgetPage, RecommendationsPage };
