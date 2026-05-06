// Main App shell

const { Dashboard, TransactionsPage, BudgetPage, RecommendationsPage } = window.Pages;
const { Modal, TxnForm, Avatar } = window.UI;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentHue": 248,
  "density": "comfortable",
  "showCharts": true
}/*EDITMODE-END*/;

function App() {
  const [state, setState] = useState({
    page: 'dashboard',
    userFilter: 'all',
    transactions: window.APP_DATA.transactions,
    budget: window.APP_DATA.budget,
  });
  const [tx, setTx] = useState({ open: false, data: null });
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Apply tweaks
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', `oklch(0.74 0.18 ${tweaks.accentHue})`);
    root.style.setProperty('--primary-2', `oklch(0.65 0.21 ${tweaks.accentHue})`);
    root.style.setProperty('--accent', `oklch(0.78 0.16 ${(tweaks.accentHue + 32) % 360})`);
    root.style.setProperty('--primary-soft', `oklch(0.74 0.18 ${tweaks.accentHue} / 0.12)`);
    if (tweaks.density === 'compact') {
      root.style.setProperty('--radius', '10px');
      root.style.setProperty('--radius-lg', '14px');
    } else {
      root.style.setProperty('--radius', '14px');
      root.style.setProperty('--radius-lg', '20px');
    }
  }, [tweaks]);

  const openTxnForm = (txn = null) => setTx({ open: true, data: txn });
  const closeTxnForm = () => setTx({ open: false, data: null });

  const saveTxn = (data) => {
    setState(s => {
      if (data.id) {
        return { ...s, transactions: s.transactions.map(t => t.id === data.id ? data : t) };
      } else {
        const newId = Math.max(...s.transactions.map(t => t.id)) + 1;
        return { ...s, transactions: [{ ...data, id: newId }, ...s.transactions]
          .sort((a,b) => new Date(b.date) - new Date(a.date)) };
      }
    });
    closeTxnForm();
  };

  const deleteTxn = () => {
    setState(s => ({ ...s, transactions: s.transactions.filter(t => t.id !== tx.data.id) }));
    closeTxnForm();
  };

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: <Icons.Home size={18}/> },
    { id: 'transactions', label: 'Transacciones', icon: <Icons.List size={18}/> },
    { id: 'budget', label: 'Presupuesto', icon: <Icons.Wallet size={18}/> },
    { id: 'recommendations', label: 'IA Insights', icon: <Icons.Sparkle size={18}/> },
  ];

  const renderPage = () => {
    switch (state.page) {
      case 'dashboard': return <Dashboard state={state} setState={setState} openTxnForm={openTxnForm}/>;
      case 'transactions': return <TransactionsPage state={state} setState={setState} openTxnForm={openTxnForm}/>;
      case 'budget': return <BudgetPage state={state} setState={setState}/>;
      case 'recommendations': return <RecommendationsPage state={state} setState={setState}/>;
      default: return null;
    }
  };

  return (
    <div className="app">
      {/* Sidebar (desktop) */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">$</div>
          <div>
            <div className="brand-name">Finanzas</div>
            <div className="brand-sub">Belmont & Sofi</div>
          </div>
        </div>
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${state.page === item.id ? 'active' : ''}`}
            onClick={() => setState(s => ({...s, page: item.id}))}
          >
            <span className="ico">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div className="nav-divider"/>
        <div style={{padding: '4px 10px'}}>
          <div style={{fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10}}>Usuarios</div>
          {window.APP_DATA.USERS.map(u => (
            <div key={u.id} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0'}}>
              <Avatar user={u} size="lg"/>
              <span style={{fontSize: 14, fontWeight: 500}}>{u.name}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {renderPage()}
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        <button className={state.page === 'dashboard' ? 'active' : ''} onClick={() => setState(s => ({...s, page: 'dashboard'}))}>
          <span className="ico"><Icons.Home size={22}/></span>
          Inicio
        </button>
        <button className={state.page === 'transactions' ? 'active' : ''} onClick={() => setState(s => ({...s, page: 'transactions'}))}>
          <span className="ico"><Icons.List size={22}/></span>
          Movs
        </button>
        <button className="fab" onClick={() => openTxnForm()}>
          <Icons.Plus size={22}/>
        </button>
        <button className={state.page === 'budget' ? 'active' : ''} onClick={() => setState(s => ({...s, page: 'budget'}))}>
          <span className="ico"><Icons.Wallet size={22}/></span>
          Presup.
        </button>
        <button className={state.page === 'recommendations' ? 'active' : ''} onClick={() => setState(s => ({...s, page: 'recommendations'}))}>
          <span className="ico"><Icons.Sparkle size={22}/></span>
          IA
        </button>
      </nav>

      {/* Transaction modal */}
      <Modal open={tx.open} onClose={closeTxnForm} title={tx.data?.id ? 'Editar transacción' : 'Nueva transacción'}>
        <TxnForm
          initial={tx.data}
          onSave={saveTxn}
          onCancel={closeTxnForm}
          onDelete={tx.data?.id ? deleteTxn : undefined}
        />
      </Modal>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Apariencia">
          <window.TweakSlider
            label="Acento (hue)"
            value={tweaks.accentHue}
            min={0} max={360} step={4}
            unit="°"
            onChange={v => setTweak('accentHue', v)}
          />
          <window.TweakRadio
            label="Densidad"
            value={tweaks.density}
            options={[
              {value: 'comfortable', label: 'Cómoda'},
              {value: 'compact', label: 'Compacta'},
            ]}
            onChange={v => setTweak('density', v)}
          />
          <window.TweakToggle
            label="Mostrar gráficas"
            value={tweaks.showCharts}
            onChange={v => setTweak('showCharts', v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
