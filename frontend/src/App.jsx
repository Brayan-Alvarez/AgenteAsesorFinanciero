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
import { USERS } from './data/categories.js';
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
  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark">$</div>
        <div>
          <div className="brand-name">Finanzas</div>
          <div className="brand-sub">Belmont &amp; Sofi</div>
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

      {/* User list */}
      <div style={{ padding: '4px 10px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Usuarios
        </div>
        {USERS.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <Avatar user={u} size="lg" />
            <span style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Bottom nav (mobile)
// ---------------------------------------------------------------------------

function BottomNav({ onNewTxn }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (to, end) => end ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <nav className="bottom-nav">
      <button className={isActive('/', true) ? 'active' : ''} onClick={() => navigate('/')}>
        <span className="ico"><Home size={22} strokeWidth={1.8} /></span>
        Inicio
      </button>
      <button className={isActive('/transacciones') ? 'active' : ''} onClick={() => navigate('/transacciones')}>
        <span className="ico"><LayoutList size={22} strokeWidth={1.8} /></span>
        Movs
      </button>
      <button className="fab" onClick={onNewTxn} aria-label="Nueva transacción">
        <Plus size={22} />
      </button>
      <button className={isActive('/presupuesto') ? 'active' : ''} onClick={() => navigate('/presupuesto')}>
        <span className="ico"><Wallet size={22} strokeWidth={1.8} /></span>
        Presup.
      </button>
      <button className={isActive('/recomendaciones') ? 'active' : ''} onClick={() => navigate('/recomendaciones')}>
        <span className="ico"><Sparkles size={22} strokeWidth={1.8} /></span>
        IA
      </button>
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

  const saveTxn = (data) => {
    if (data.id) updateTransaction(data.id, data);
    else addTransaction(data);
    closeModal();
  };

  const deleteTxn = () => {
    deleteTransaction(modal.data.id);
    closeModal();
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
