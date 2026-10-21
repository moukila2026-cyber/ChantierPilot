import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { trialDaysRemaining } from '../../shared/plans.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Footer } from './ui.jsx';
import Logo from './Logo.jsx';

const NAV_GROUPS = [
  {
    group: 'Pilotage',
    items: [
      {
        to: '/',
        label: 'Tableau de bord',
        keywords: 'accueil synthese kpi alertes resume chiffres',
        icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
      },
      {
        to: '/chantiers',
        label: 'Chantiers',
        keywords: 'projets clients budget rapport pdf archiver creer nouveau chantier',
        icon: 'M8.25 21v-5.25c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3.545l-4.5 1.636M2.25 9l4.5 1.636M2.25 9v10.125M2.25 9l13.5-4.909',
      },
    ],
  },
  {
    group: 'Commerce & trésorerie',
    items: [
      {
        to: '/documents',
        label: 'Devis & factures',
        adminOnly: true,
        keywords: 'devis facturation acompte situation solde avoir client accord prix bibliotheque',
        icon: 'M7 3h7l5 5v13H7V3zM14 3v5h5M10 12h6m-6 4h6',
      },
      {
        to: '/depenses',
        label: 'Dépenses',
        keywords: 'achats frais fournisseurs recus justificatifs couts',
        icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
      },
      {
        to: '/encaissements',
        label: 'Encaissements',
        keywords: 'paiements reglements avances clients mobile money virement especes recu preuve',
        icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
    ],
  },
  {
    group: 'Terrain & coordination',
    items: [
      {
        to: '/photos',
        label: 'Photos & reçus',
        keywords: 'camera appareil photo prise photo recus factures preuves justificatifs galerie zoom',
        icon: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z',
      },
      {
        to: '/terrain',
        label: 'Carnet de chantier',
        keywords: 'terrain journal photo taches reserves caisse avances presences ouvriers achats stock hors ligne',
        icon: 'M9 3h6v4H9zM6 5H4v16h16V5h-2M8 11h8M8 15h8',
      },
      {
        to: '/gestion',
        label: 'Gestion avancée',
        keywords: 'plans annotes pdf gantt planning dependances depots multi-depots magasins',
        icon: 'M3 3v18h18M6 7h8M10 12h10M6 17h6',
      },
    ],
  },
  {
    group: 'Entreprise',
    items: [
      {
        to: '/parametres',
        label: 'Paramètres',
        keywords: 'entreprise profil rccm ncc fiscalite equipe agents mot de passe export csv json sauvegarde audit',
        icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      },
      {
        to: '/offres',
        label: 'Offres & tarifs',
        keywords: 'abonnement forfait saspay quotas essai renouvellement',
        icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z',
      },
    ],
  },
];

const DEEP_SHORTCUTS = [
  { to: '/chantiers?nouveau=1', label: 'Nouveau chantier', sub: 'Ouvrir le formulaire de création', adminOnly: true, keywords: 'creer chantier nouveau projet' },
  { to: '/documents?nouveau=1', label: 'Nouveau devis', sub: 'Chiffrer des travaux en FCFA', adminOnly: true, keywords: 'creer devis chiffrage proposition' },
  { to: '/terrain?onglet=journal', label: 'Journal photo', sub: 'Notes & photos de chantier', keywords: 'journal photo note avancement incident' },
  { to: '/terrain?onglet=tasks', label: 'Planning & réserves', sub: 'Suivi et levée de réserves', keywords: 'taches reserves planning controle' },
  { to: '/terrain?onglet=cash', label: 'Avances de caisse', sub: 'Confiées aux agents terrain', keywords: 'caisse avances justificatifs restitution' },
  { to: '/terrain?onglet=team', label: 'Présences & ouvriers', sub: 'Pointage journalier main-d’œuvre', keywords: 'ouvriers presences pointage equipe heures' },
  { to: '/terrain?onglet=stock', label: 'Achats & stock chantier', sub: 'Demandes, réceptions et seuils', keywords: 'achats stock materiaux reception commandes' },
  { to: '/gestion?onglet=plans', label: 'Plans annotés', sub: 'Révisions PDF/images et repères', keywords: 'plans annotes pdf observations' },
  { to: '/gestion?onglet=gantt', label: 'Planning Gantt', sub: 'Calendrier & dépendances fin-début', keywords: 'gantt calendrier planning delais' },
  { to: '/gestion?onglet=warehouses', label: 'Stocks multi-dépôts', sub: 'Entrées, transferts et sorties', keywords: 'depots entrepots transferts magasin' },
];

const MOBILE_BAR = [
  { to: '/', label: 'Accueil', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
  { to: '/chantiers', label: 'Chantiers', icon: 'M8.25 21v-5.25c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3.545l-4.5 1.636M2.25 9l4.5 1.636M2.25 9v10.125M2.25 9l13.5-4.909' },
  { to: '/photos', label: 'Photos', icon: 'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z' },
  { to: '/terrain', label: 'Terrain', icon: 'M9 3h6v4H9zM6 5H4v16h16V5h-2M8 11h8M8 15h8' },
  { to: '/depenses', label: 'Dépenses', icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z' },
];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function Layout({ children }) {
  const { user, company, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();
  const [billing, setBilling] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api('/api/billing').then((data) => { if (alive) setBilling(data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    try {
      if (await logout()) navigate('/connexion');
    } catch (e) {
      window.alert(e.message);
    }
  };

  const q = normalize(navQuery);

  const filteredGroups = useMemo(() => (
    NAV_GROUPS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (!q) return true;
        return normalize(`${section.group} ${item.label} ${item.keywords}`).includes(q);
      }),
    })).filter((section) => section.items.length > 0)
  ), [isAdmin, q]);

  const matchingShortcuts = useMemo(() => {
    if (!q) return [];
    return DEEP_SHORTCUTS.filter((s) => (!s.adminOnly || isAdmin) && normalize(`${s.label} ${s.sub} ${s.keywords}`).includes(q));
  }, [isAdmin, q]);

  const renderSearchBox = (inputId, autoRef = null) => (
    <div className="relative px-3 pt-3">
      <label htmlFor={inputId} className="sr-only">Rechercher une rubrique</label>
      <input
        ref={autoRef}
        id={inputId}
        type="search"
        value={navQuery}
        onChange={(e) => setNavQuery(e.target.value)}
        placeholder="Rechercher une rubrique…"
        aria-label="Rechercher une rubrique"
        className="h-10 w-full rounded-xl border border-white/15 bg-[#1f1c18] pl-9 pr-8 text-xs text-[#fbf8f1] placeholder:text-[#a89f91] focus:border-[#eab956] focus:outline-none focus:ring-1 focus:ring-[#eab956]"
      />
      <svg className="pointer-events-none absolute left-6 top-[1.35rem] h-4 w-4 text-[#eab956]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.15 3.15a1 1 0 01-1.42 1.42l-3.15-3.15A7 7 0 012 9z" clipRule="evenodd" />
      </svg>
      {navQuery && (
        <button
          type="button"
          onClick={() => setNavQuery('')}
          aria-label="Effacer la recherche"
          className="absolute right-5 top-[1.2rem] rounded p-1 text-xs font-bold text-[#cfc7b8] hover:text-white"
        >
          ×
        </button>
      )}
    </div>
  );

  const navItems = (
    <div className="space-y-4">
      {billing?.operator && (
        <div className="px-1">
          <NavLink
            to="/shopin30"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                isActive
                  ? 'border-[#eab956] bg-[#eab956] text-[#141210]'
                  : 'border-[#eab956]/35 bg-[#eab956]/10 text-[#eab956] hover:bg-[#eab956]/20'
              }`
            }
          >
            <span>Console SHOPIN30</span>
            <span aria-hidden="true">→</span>
          </NavLink>
        </div>
      )}

      {filteredGroups.map((section) => (
        <div key={section.group}>
          <p className="mb-1.5 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a89f91]">
            {section.group}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[#e5a93b] text-[#141210] shadow-sm'
                      : 'text-[#dfd9ce] hover:bg-white/[0.07] hover:text-white'
                  }`
                }
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}

      {matchingShortcuts.length > 0 && (
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#eab956]">
            Accès directs
          </p>
          <div className="space-y-1">
            {matchingShortcuts.map((shortcut) => (
              <button
                key={shortcut.to}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setNavQuery('');
                  navigate(shortcut.to);
                }}
                className="flex w-full flex-col rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:border-[#eab956]/45 hover:bg-white/[0.08]"
              >
                <span className="text-xs font-bold text-[#fbf8f1]">{shortcut.label}</span>
                <span className="text-[11px] text-[#b9b0a1]">{shortcut.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredGroups.length === 0 && matchingShortcuts.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-[#b9b0a1]">
          Aucune rubrique pour « {navQuery} ».
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-clip lg:flex">
      {/* Sidebar desktop — Noir Charbon & Or */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#eab956]/20 bg-[#141210] lg:flex">
        <div className="border-b border-white/10 px-5 py-4">
          <Logo inverted to="/" />
        </div>
        {renderSearchBox('nav-search-desktop', searchInputRef)}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigation métier">
          {navItems}
        </nav>
        <div className="border-t border-white/10 bg-[#0f0d0b] px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-[#fbf8f1]">{company?.name || 'Mon entreprise'}</p>
            <span className="shrink-0 rounded-full bg-[#eab956]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#eab956]">
              {isAdmin ? 'Admin' : 'Agent'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-[#b9b0a1]">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-[#dfd9ce] transition hover:border-[#eab956]/40 hover:bg-white/[0.06] hover:text-white"
          >
            <svg className="h-4.5 w-4.5 text-[#eab956]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* En-tête mobile — Noir Charbon & Or */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#eab956]/25 bg-[#141210] px-4 py-3 lg:hidden">
        <Logo inverted to="/" />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-[#fbf8f1] transition hover:bg-white/10"
          aria-label="Ouvrir le menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg className="h-6 w-6 text-[#eab956]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6 text-[#eab956]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </header>

      {/* Tiroir mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[#0c0b09]/75 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col border-l border-[#eab956]/25 bg-[#141210] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#fbf8f1]">{company?.name || 'Menu'}</p>
                <p className="truncate text-xs text-[#eab956]">{isAdmin ? 'Administrateur' : 'Agent'}</p>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-[#cfc7b8] hover:bg-white/10 hover:text-white" aria-label="Fermer le menu">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
              </button>
            </div>
            {renderSearchBox('nav-search-mobile')}
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu mobile métier">{navItems}</nav>
            <div className="border-t border-white/10 bg-[#0f0d0b] px-4 py-4">
              <p className="truncate text-xs text-[#b9b0a1]">{user?.email}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-[#fbf8f1] hover:bg-white/10"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu */}
      <main className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0 lg:pl-64">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {billing && (billing.status !== 'actif' || new Date(billing.paid_until).getTime() - Date.now() < 7 * 86400000) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#eab956]/45 bg-[#141210] px-4 py-3 text-sm text-[#fbf8f1] shadow-sm" role="status">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#eab956]" aria-hidden="true" />
                <span>
                  {billing.status === 'essai' ? (() => {
                    const days = billing.trial_days_remaining ?? trialDaysRemaining(billing.trial_until);
                    return `Essai gratuit de 2 semaines (14 jours) · ${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''} — jusqu’au ${formatDate(billing.trial_until)}.`;
                  })()
                    : !billing.writable
                      ? 'Espace en lecture seule : vos données restent accessibles, les modifications sont bloquées.'
                      : `Votre forfait expire le ${formatDate(billing.paid_until)}. Pensez à le renouveler.`}
                </span>
              </span>
              <NavLink to="/offres" className="font-bold text-[#eab956] underline underline-offset-2 hover:text-[#f4c668]">
                Gérer mon forfait →
              </NavLink>
            </div>
          )}
          {children}
        </div>
        <Footer />
      </main>

      {/* Barre d’accès rapide mobile */}
      <nav
        aria-label="Accès rapides mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-[#eab956]/25 bg-[#141210]/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur lg:hidden"
      >
        {MOBILE_BAR.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold transition ${
                isActive ? 'text-[#eab956]' : 'text-[#cfc7b8] hover:text-white'
              }`
            }
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold transition ${
            menuOpen || !MOBILE_BAR.some((m) => (m.to === '/' ? location.pathname === '/' : location.pathname.startsWith(m.to)))
              ? 'text-[#eab956]'
              : 'text-[#cfc7b8] hover:text-white'
          }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          <span className="max-w-full truncate">Rubriques</span>
        </button>
      </nav>
    </div>
  );
}
