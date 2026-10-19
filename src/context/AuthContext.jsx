import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { clearFieldData } from '../lib/offline.js';
const CACHE_KEY = 'chantierpilot:offline-identity';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, company: null });

  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/auth/session');
      setState({ status: 'auth', user: data.user, company: data.company, offlineAccess: false });
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user: data.user, company: { id: data.company.id, name: data.company.name }, at: Date.now() })); } catch { /* stockage désactivé */ }
    } catch (e) {
      // Identité locale = accès au carnet uniquement, jamais une authentification serveur.
      let cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch { /* pas de copie */ }
      if (e.status === 0 && cached?.user && cached?.company && Date.now() - cached.at < 86400000) {
        setState({ status: 'auth', user: cached.user, company: cached.company, offlineAccess: true });
      } else {
        try { sessionStorage.removeItem(CACHE_KEY); } catch { /* stockage désactivé */ }
        // Conserver les saisies en attente après expiration de session ; elles restent cloisonnées.
        setState({ status: 'anon', user: null, company: null });
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => { try { sessionStorage.removeItem(CACHE_KEY); } catch { /* stockage désactivé */ } setState({ status: 'anon', user: null, company: null }); };
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('chantierpilot:unauthorized', onUnauthorized);
    return () => { window.removeEventListener('chantierpilot:unauthorized', onUnauthorized); window.removeEventListener('online', onOnline); };
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    await api('/api/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  }, [refresh]);

  const register = useCallback(async (payload) => {
    await api('/api/auth/register', { method: 'POST', body: payload });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    if (!navigator.onLine) throw new Error('Reconnectez-vous au réseau pour fermer la session et effacer les données locales.');
    if (!window.confirm('Se déconnecter ? Les copies terrain et saisies locales non synchronisées de cet appareil seront supprimées.')) return false;
    await api('/api/auth/logout', { method: 'POST' });
    await clearFieldData().catch(()=>{});
    try { sessionStorage.removeItem(CACHE_KEY); } catch { /* stockage désactivé */ }
    setState({ status: 'anon', user: null, company: null });
    return true;
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
