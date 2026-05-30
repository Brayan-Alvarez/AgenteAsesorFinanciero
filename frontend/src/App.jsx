/**
 * App.jsx — Shell with sidebar (desktop) and bottom nav (mobile).
 *
 * Routes:
 *   /               → Dashboard
 *   /transacciones  → Transactions list
 *   /presupuesto    → Budget (by category or by month)
 *   /recomendaciones→ AI Recommendations
 *   /chat           → Conversational agent
 */

import { useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  BotMessageSquare,
  Home,
  LayoutList,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react';

import { AppProvider, useAppContext } from './context/AppContext.jsx';
import Avatar from './components/Avatar.jsx';
import Modal from './components/Modal.jsx';
import TxnForm from './components/TxnForm.jsx';

import Dashboard       from './pages/Dashboard.jsx';
import Transactions    from './pages/Transactions.jsx';
import Budget          from './pages/Budget.jsx';
import Recommendations from './pages/Recommendations.jsx';
import Chat            from './pages/Chat.jsx';

// ---------------------------------------------------------------------------
// Nav items definition
// ---------------------------------------------------------------------------

const NAV = [
  { to: '/',                end: true,  label: 'Inicio',        icon: Home          },
  { to: '/transacciones',   end: false, label: 'Transacciones', icon: LayoutList    },
  { to: '/presupuesto',     end: false, label: 'Presupuesto',   icon: Wallet        },
  { to: '/recomendaciones', end: false, label: 'IA Insights',   icon: Sparkles      },
  { to: '/chat',            end: false, label: 'Asesor IA',     icon: BotMessageSquare },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar() {
  const { users } = useAppContext();

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark">$</div>
        <div>
          <div className="brand-name">Finanzas</div>
          <div className="brand-sub">
            {users.length > 0 ? users.map(u => u.name).join(' & ') : 'Cargando…'}
          </div>
        </div>
      </div>

      {/* Navigation */}
      {NAV.map(({ to, end, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="ico"><Icon size={17} strokeWidth={1.8} /></span>
          {label}
        </NavLink>
      ))}

      <div className="nav-divider" />

      {/* Dynamic user list */}
      {users.length > 0 && (
        <div style={{ padding: '4px 10px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Usuarios
          </div>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <Avatar user={u} size="lg" />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Bottom nav (mobile)
// ---------------------------------------------------------------------------

function BottomNav({ onNewTxn }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [showAiMenu, setShowAiMenu] = useState(false);

  const isActive  = (to, end) => end ? location.pathname === to : location.pathname.startsWith(to);
  const isAiRoute = isActive('/recomendaciones') || isActive('/chat');

  const go = (to) => { navigate(to); setShowAiMenu(false); };

  return (
    <nav className="bottom-nav">
      <button className={isActive('/', true) ? 'active' : ''} onClick={() => go('/')}>
        <span className="ico"><Home size={22} strokeWidth={1.8} /></span>
        Inicio
      </button>

      <button className={isActive('/transacciones') ? 'active' : ''} onClick={() => go('/transacciones')}>
        <span className="ico"><LayoutList size={22} strokeWidth={1.8} /></span>
        Movs
      </button>

      <button className="fab" onClick={onNewTxn} aria-label="Nueva transacción">
        <Plus size={22} />
      </button>

      <button className={isActive('/presupuesto') ? 'active' : ''} onClick={() => go('/presupuesto')}>
        <span className="ico"><Wallet size={22} strokeWidth={1.8} /></span>
        Presup.
      </button>

      {/* IA slot — tap opens a mini-menu with both AI pages */}
      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>

        {/* Backdrop to close on outside tap */}
        {showAiMenu && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
            onClick={() => setShowAiMenu(false)}
          />
        )}

        {/* Floating sub-menu */}
        {showAiMenu && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 10px)', right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, boxShadow: '0 -8px 32px rgba(0,0,0,0.35)',
            zIndex: 50, overflow: 'hidden', minWidth: 168,
          }}>
            <button
              onClick={() => go('/recomendaciones')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '13px 16px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                background: isActive('/recomendaciones') ? 'var(--surface-2)' : 'transparent',
                color: isActive('/recomendaciones') ? 'var(--primary)' : 'var(--text)',
              }}
            >
              <Sparkles size={17} strokeWidth={1.8} /> IA Insights
            </button>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <button
              onClick={() => go('/chat')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '13px 16px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                background: isActive('/chat') ? 'var(--surface-2)' : 'transparent',
                color: isActive('/chat') ? 'var(--primary)' : 'var(--text)',
              }}
            >
              <BotMessageSquare size={17} strokeWidth={1.8} /> Asesor IA
            </button>
          </div>
        )}

        {/* The actual tab button */}
        <button
          className={isAiRoute ? 'active' : ''}
          onClick={() => setShowAiMenu(o => !o)}
          style={{ flex: 1 }}
        >
          <span className="ico">
            {isActive('/chat')
              ? <BotMessageSquare size={22} strokeWidth={1.8} />
              : <Sparkles size={22} strokeWidth={1.8} />}
          </span>
          IA
        </button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Inner shell — needs router context, so lives inside BrowserRouter
// ---------------------------------------------------------------------------

function AppShell() {
  const { addTransaction, updateTransaction, deleteTransaction } = useAppContext();
  const [modal, setModal] = useState({ open: false, data: null });

  const openModal  = (txn = null) => setModal({ open: true, data: txn });
  const closeModal = ()           => setModal({ open: false, data: null });

  const saveTxn = async (data) => {
    try {
      if (data.id) await updateTransaction(data.id, data);
      else await addTransaction(data);
      closeModal();
    } catch (err) {
      console.error('Failed to save transaction:', err);
    }
  };

  const deleteTxn = async () => {
    try {
      await deleteTransaction(modal.data.id);
      closeModal();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  return (
    <div className="app">
      <Sidebar />

      <main className="main">
        <Routes>
          <Route path="/"                element={<Dashboard       openTxnForm={openModal} />} />
          <Route path="/transacciones"   element={<Transactions    openTxnForm={openModal} />} />
          <Route path="/presupuesto"     element={<Budget />} />
          <Route path="/recomendaciones" element={<Recommendations />} />
          <Route path="/chat"            element={<Chat />} />
        </Routes>
      </main>

      <BottomNav onNewTxn={() => openModal()} />

      <Modal
        open={modal.open}
        onClose={closeModal}
        title={modal.data?.id ? 'Editar transacción' : 'Nueva transacción'}
      >
        <TxnForm
          initial={modal.data}
          onSave={saveTxn}
          onCancel={closeModal}
          onDelete={modal.data?.id ? deleteTxn : undefined}
        />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  );
}
