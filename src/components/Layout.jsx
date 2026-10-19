import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Footer } from './ui.jsx';
import Logo from './Logo.jsx';

const NAV = [
  {to:'/gestion',label:'Gestion avancée',icon:'M3 3v18h18M6 7h8M10 12h10M6 17h6'},
  { to: '/documents', label: 'Devis & factures', icon: 'M7 3h7l5 5v13H7V3zM14 3v5h5M10 12h6m-6 4h6' },
  { to: '/terrain', label: 'Carnet de chantier', icon: 'M9 3h6v4H9zM6 5H4v16h16V5h-2M8 11h8M8 15h8' },
  { to: '/', label: 'Tableau de bord', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
  { to: '/chantiers', label: 'Chantiers', icon: 'M8.25 21v-5.25c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3.545l-4.5 1.636M2.25 9l4.5 1.636M2.25 9v10.125M2.25 9l13.5-4.909' },
  { to: '/depenses', label: 'Dépenses', icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z' },
  { to: '/encaissements', label: 'Encaissements', icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/parametres', label: 'Paramètres', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function Layout({ children }) {
  const { user, company, logout } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState(null);
  useEffect(() => {
    let alive = true;
    api('/api/billing').then(data => { if (alive) setBilling(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try { if (await logout()) navigate('/connexion'); }
    catch (e) { window.alert(e.message); }
  };

  const navItems = (
    <>
      {billing?.operator && <NavLink to="/shopin30" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-amber-300 hover:bg-white/5">Console SHOPIN30</NavLink>}
      {NAV.filter(item => item.to !== '/documents' || user?.role === 'admin').map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'bg-amber-500/15 text-amber-300'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
          </svg>
          {item.label}
        </NavLink>
      ))}
      <NavLink
        to="/offres"
        onClick={() => setMenuOpen(false)}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            isActive ? 'bg-amber-500/15 text-amber-300' : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`
        }
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z" />
        </svg>
        Offres &amp; tarifs
      </NavLink>
    </>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Logo inverted to="/" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{navItems}</nav>
        <div className="border-t border-white/10 px-4 py-4">
          <p className="truncate text-sm font-semibold text-white">{company?.name || 'Mon entreprise'}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Barre mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        <Logo inverted to="/" />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
          aria-label="Ouvrir le menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </header>

      {/* Tiroir mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <p className="text-sm font-semibold text-white">{company?.name || 'Menu'}</p>
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10" aria-label="Fermer le menu">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{navItems}</nav>
            <div className="border-t border-white/10 px-4 py-4">
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/15"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu */}
      <main className="flex flex-1 flex-col lg:pl-64">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {billing && (billing.status !== 'actif' || new Date(billing.paid_until).getTime() - Date.now() < 7 * 86400000) && <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <span>{billing.status === 'essai' ? `Essai gratuit jusqu’au ${formatDate(billing.trial_until)}.` : !billing.writable ? 'Espace en lecture seule : vos données restent accessibles, les modifications sont bloquées.' : `Votre forfait expire le ${formatDate(billing.paid_until)}. Pensez à le renouveler.`}</span>
            <NavLink to="/offres" className="font-bold underline">Gérer mon forfait →</NavLink>
          </div>}
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
