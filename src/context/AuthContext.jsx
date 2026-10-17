import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, company: null });

  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/auth/session');
      setState({ status: 'auth', user: data.user, company: data.company });
    } catch {
      setState({ status: 'anon', user: null, company: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setState({ status: 'anon', user: null, company: null });
    window.addEventListener('chantierpilot:unauthorized', onUnauthorized);
    return () => window.removeEventListener('chantierpilot:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    await api('/api/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  }, [refresh]);

  const register = useCallback(async (payload) => {
    await api('/api/auth/register', { method: 'POST', body: payload });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      setState({ status: 'anon', user: null, company: null });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
