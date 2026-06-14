import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import './styles/global.css';
import Today from './pages/Today';
import Week from './pages/Week';
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
        <NavItem to="/tasks"  icon="✅" label="Tarefas" />
      </nav>

      <nav className="nav-section">
        <div className="nav-label">Sistema</div>
        <NavItem to="/setup"    icon="⚙️" label="Configuração" />
        <NavItem to="/settings" icon="🔧" label="Preferências" />
      </nav>
    </aside>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/"         element={<Today />} />
            <Route path="/week"     element={<Week />} />
            <Route path="/tasks"    element={<Tasks />} />
            <Route path="/setup"    element={<Setup />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
