import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import './styles/global.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Today from './pages/Today';
import Week from './pages/Week';
import Month from './pages/Month';
import Tasks from './pages/Tasks';
import Setup from './pages/Setup';
import Settings from './pages/Settings';

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-icon">{icon}</span>
      {label}
    </NavLink>
  );
}

function Sidebar() {
  const { auth, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Rotina</h1>
        <span>Gestão inteligente</span>
      </div>

      <nav className="nav-section">
        <div className="nav-label">Planner</div>
        <NavItem to="/"       icon="☀️" label="Hoje" />
        <NavItem to="/week"   icon="📅" label="Semana" />
        <NavItem to="/month"  icon="🗓️" label="Mês" />
        <NavItem to="/tasks"  icon="✅" label="Tarefas" />
      </nav>

      <nav className="nav-section">
        <div className="nav-label">Sistema</div>
        <NavItem to="/setup"    icon="⚙️" label="Configuração" />
        <NavItem to="/settings" icon="🔧" label="Preferências" />
      </nav>

      <div style={sidebarFooterStyle}>
        <span style={userNameStyle}>{auth?.user?.name}</span>
        <button onClick={logout} style={logoutBtnStyle} title="Sair">
          Sair
        </button>
      </div>
    </aside>
  );
}

const sidebarFooterStyle = {
  marginTop: 'auto',
  padding: '16px 20px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};

const userNameStyle = {
  fontSize: '12px',
  color: 'var(--text2)',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const logoutBtnStyle = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text3)',
  fontSize: '11px',
  padding: '4px 8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

function AppShell() {
  const { auth } = useAuth();

  if (!auth) return <Login />;

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/"         element={<Today />} />
            <Route path="/week"     element={<Week />} />
            <Route path="/month"    element={<Month />} />
            <Route path="/tasks"    element={<Tasks />} />
            <Route path="/setup"    element={<Setup />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
