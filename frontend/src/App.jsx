/**
 * App.jsx — Root component with React Router navigation.
 *
 * Routes:
 *   /       → Dashboard (charts)
 *   /chat   → Chat (conversational agent)
 *
 * A NavBar at the top persists across all routes and highlights the active link.
 */

import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";

import { AppProvider } from "./context/AppContext";
import Chat from "./pages/Chat";
import Dashboard from "./pages/Dashboard";

// ---------------------------------------------------------------------------
// NavBar
// ---------------------------------------------------------------------------

function NavBar() {
  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>💰 Asesor Financiero</span>

      <div style={styles.links}>
        {/* NavLink provides an `isActive` boolean we use to swap styles */}
        <NavLink
          to="/"
          end                          // "end" prevents / matching all nested routes
          style={({ isActive }) => ({
            ...styles.link,
            ...(isActive ? styles.linkActive : {}),
          })}
        >
          📊 Dashboard
        </NavLink>

        <NavLink
          to="/chat"
          style={({ isActive }) => ({
            ...styles.link,
            ...(isActive ? styles.linkActive : {}),
          })}
        >
          💬 Chat
        </NavLink>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    // AppProvider wraps BrowserRouter so context is available everywhere,
    // including any future hooks that might need route info.
    <AppProvider>
      <BrowserRouter>
        {/* NavBar rendered outside <Routes> so it stays on every page */}
        <NavBar />

        {/* Page content fills the remaining viewport height */}
        <main style={styles.main}>
          <Routes>
            <Route path="/"     element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AppProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    height: "56px",
    backgroundColor: "#fff",
    borderBottom: "1px solid #e5e7eb",
    position: "sticky",
    top: 0,
    zIndex: 100,                       // Stay above chart tooltips and content
  },
  brand: {
    fontWeight: 700,
    fontSize: "1.05rem",
    color: "#111827",
    letterSpacing: "-0.01em",
  },
  links: {
    display: "flex",
    gap: "8px",
  },
  link: {
    padding: "6px 14px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: "#6b7280",
    transition: "background-color 0.15s, color 0.15s",
  },
  linkActive: {
    backgroundColor: "#ede9fe",        // Light indigo background
    color: "#4f46e5",                  // Indigo text — matches the chart/button palette
  },
  main: {
    // Chat needs the full remaining height so its flex column fills the screen.
    // Dashboard just grows with content.
    height: "calc(100vh - 56px)",
    overflow: "auto",
  },
};
