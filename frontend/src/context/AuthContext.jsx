import React, { createContext, useContext, useState } from 'react';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const stored = localStorage.getItem('rotina_auth');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  async function login(username, password) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Credenciais inválidas');
    }
    const data = await res.json();
    const authData = { token: data.token, user: data.user };
    localStorage.setItem('rotina_auth', JSON.stringify(authData));
    setAuth(authData);
  }

  function logout() {
    localStorage.removeItem('rotina_auth');
    setAuth(null);
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
