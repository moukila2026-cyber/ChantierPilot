import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { Footer } from '../components/ui.jsx';

const checks = ['Budgets et dépenses au même endroit', 'Encaissements avec justificatifs', 'Rapports de chantier exportables en PDF'];
const features = [
  { icon: 'M4 7h16M4 12h10M4 17h7m3-10 2 2 4-4', title: 'Une vue claire', text: 'Suivez budgets, dépenses, encaissements déclarés et solde client depuis un tableau de bord simple.' },
  { icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', title: 'Chaque chantier à sa place', text: 'Retrouvez rapidement les informations, l’avancement financier et l’historique de chaque opération.' },
  { icon: 'M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M9 13h6m-6 4h6', title: 'Des pièces à portée de main', text: 'Joignez les justificatifs utiles et générez un rapport PDF pour partager un état de chantier.' },
  { icon: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-11 2 2 4-4', title: 'Des espaces séparés', text: 'Les données sont organisées par entreprise, avec des contrôles d’accès côté application et base de données.' },
];

function Icon({ path, className = 'h-5 w-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[570px]">
      <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-amber-100 via-orange-50 to-sky-100 blur-xl" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_-32px_rgba(15,23,42,.42)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon path="M3 3v18h18M7 14l4-4 4 3 6-7" /></span><div><p className="text-sm font-bold text-slate-900">Vue d’ensemble</p><p className="text-xs text-slate-500">Espace entreprise</p></div></div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Aperçu</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-6">
          {[
            ['Chantiers suivis', '—', 'Votre activité, en un regard', 'text-sky-700 bg-sky-50'],
            ['Budget prévisionnel', '—', 'FCFA · par chantier', 'text-slate-800 bg-slate-50'],
            ['Dépenses enregistrées', '—', 'FCFA · pièces consultables', 'text-amber-800 bg-amber-50'],
            ['Encaissements déclarés', '—', 'FCFA · justificatifs consultables', 'text-emerald-800 bg-emerald-50'],
          ].map(([label, value, hint, color]) => <div key={label} className="rounded-xl border border-slate-100 p-3.5 sm:p-4"><p className="text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p><p className="mt-2 text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-[10px] leading-4 text-slate-500 sm:text-xs">{hint}</p></div>)}
        </div>
        <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-slate-100 sm:mx-6 sm:mb-6">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-xs font-bold text-slate-800">Activité récente</p><span className="text-[10px] text-slate-400">Exemple d’interface</span></div>
          <div className="space-y-3 p-4">
            {[
              ['Dépense enregistrée', 'Matériaux · chantier', '— FCFA', 'bg-amber-100 text-amber-700'],
              ['Encaissement déclaré', 'Justificatif joint', '— FCFA', 'bg-emerald-100 text-emerald-700'],
            ].map(([project, detail, amount, color]) => <div key={project} className="flex items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon className="h-4 w-4" path="M5 12h14m-7-7 7 7-7 7" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{project}</p><p className="text-[10px] text-slate-500">{detail}</p></div><p className="whitespace-nowrap text-xs font-bold text-slate-800">{amount}</p></div>)}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-lg sm:flex"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Icon path="M5 12.5 9.5 17 19 7" /></span><div><p className="text-xs font-bold text-slate-900">Justificatif joint</p><p className="text-[10px] text-slate-500">Encaissement documenté</p></div></div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-900">
      <header className="relative z-20 border-b border-slate-200/70 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Logo to="/" />
          <nav className="hidden items-center gap-8 md:flex" aria-label="Navigation principale">
            <a href="#fonctionnalites" className="text-sm font-medium text-slate-600 hover:text-slate-950">Fonctionnalités</a><a href="#methode" className="text-sm font-medium text-slate-600 hover:text-slate-950">Comment ça marche</a><Link to="/offres" className="text-sm font-medium text-slate-600 hover:text-slate-950">Offres</Link>
          </nav>
          <div className="hidden items-center gap-3 md:flex"><Link to="/connexion" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Connexion</Link><Link to="/inscription" className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#193b5b]">Créer mon espace <span aria-hidden="true">→</span></Link></div>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden" aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><Icon path={menuOpen ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></button>
        </div>
        {menuOpen && <nav className="absolute inset-x-0 top-full border-b border-slate-200 bg-[#fbfaf7] px-4 pb-5 pt-2 shadow-lg md:hidden" aria-label="Menu mobile"><a onClick={closeMenu} href="#fonctionnalites" className="block rounded-lg px-3 py-3 text-sm font-medium">Fonctionnalités</a><a onClick={closeMenu} href="#methode" className="block rounded-lg px-3 py-3 text-sm font-medium">Comment ça marche</a><Link onClick={closeMenu} to="/offres" className="block rounded-lg px-3 py-3 text-sm font-medium">Offres</Link><div className="mt-2 grid grid-cols-2 gap-2"><Link onClick={closeMenu} to="/connexion" className="rounded-lg border border-slate-200 px-3 py-3 text-center text-sm font-semibold">Connexion</Link><Link onClick={closeMenu} to="/inscription" className="rounded-lg bg-[#102a43] px-3 py-3 text-center text-sm font-semibold text-white">Créer un espace</Link></div></nav>}
      </header>

      <main>
        <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[.95fr_1.05fr] lg:gap-14 lg:px-8 lg:pb-28 lg:pt-24">
          <div className="absolute -left-36 top-4 h-80 w-80 rounded-full bg-amber-100/55 blur-3xl" aria-hidden="true" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold tracking-wide text-amber-900"><span className="h-1.5 w-1.5 rounded-full bg-amber-600" />PENSÉ POUR LES ENTREPRISES BTP EN CÔTE D’IVOIRE</span>
            <h1 className="mt-6 max-w-2xl text-[2.75rem] font-extrabold leading-[1.06] tracking-[-.045em] text-[#102a43] sm:text-6xl lg:text-[4.2rem]">Vos chantiers avancent.<br /><span className="text-[#d47b28]">Vos chiffres restent clairs.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">ChantierPilot rassemble le suivi de vos chantiers, dépenses et encaissements dans un espace simple, en français et en FCFA.</p>
            <ul className="mt-6 space-y-3">{checks.map((item) => <li key={item} className="flex items-center gap-2.5 text-sm font-medium text-slate-700"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Icon className="h-3.5 w-3.5" path="m5 12 4 4L19 6" /></span>{item}</li>)}</ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link to="/inscription" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#102a43] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-[#193b5b]">Créer mon espace entreprise <span aria-hidden="true">→</span></Link><Link to="/offres" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-6 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-white">Découvrir les offres</Link></div>
            <p className="mt-4 text-xs text-slate-500">Aucun paiement automatique. Les offres sont présentées à titre indicatif.</p>
          </div>
          <div className="relative z-10 py-4 sm:px-3 lg:py-8"><DashboardPreview /></div>
        </section>

        <section className="border-y border-slate-200/80 bg-white py-7"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:px-6 md:flex-row md:items-center lg:px-8"><p className="max-w-lg text-sm font-semibold text-slate-700">Les informations essentielles de votre activité, réunies au même endroit.</p><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Chantiers</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Dépenses</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Encaissements déclarés</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Rapports PDF</span></div></div></section>

        <section id="fonctionnalites" className="scroll-mt-20 py-20 sm:py-24"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-amber-700">Tout suivre, sans s’éparpiller</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#102a43] sm:text-4xl">Le pilotage quotidien, simplement.</h2><p className="mt-4 text-base leading-7 text-slate-600">Une base claire pour savoir où en est chaque chantier et retrouver les éléments utiles à votre équipe.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map((feature, index) => <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_-24px_rgba(15,23,42,.28)]"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${index % 2 ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}><Icon path={feature.icon} /></span><h3 className="mt-5 text-base font-bold text-[#102a43]">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{feature.text}</p></article>)}</div></div></section>

        <section id="methode" className="scroll-mt-20 bg-[#102a43] py-20 text-white sm:py-24"><div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-8"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-amber-300">Du terrain au rapport</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Un fil de suivi, de la création au bilan.</h2><p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">Commencez par enregistrer un chantier. Ajoutez ensuite ses mouvements et justificatifs au fil de l’eau. Les informations restent consultables dans votre espace entreprise.</p><Link to="/inscription" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400">Découvrir ChantierPilot <span aria-hidden="true">→</span></Link></div><div className="grid gap-3 sm:grid-cols-3">{[['01', 'Créez', 'Renseignez le chantier, le client et le budget prévisionnel.'], ['02', 'Suivez', 'Saisissez les dépenses et encaissements déclarés.'], ['03', 'Partagez', 'Joignez vos pièces et exportez un rapport PDF.']].map(([num, title, text]) => <article key={num} className="rounded-xl border border-white/15 bg-white/[.06] p-5"><span className="text-xs font-bold tracking-widest text-amber-300">{num}</span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{text}</p></article>)}</div></div></section>

        <section className="py-20 sm:py-24"><div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"><div className="grid overflow-hidden rounded-3xl bg-[#f2eee5] md:grid-cols-[.9fr_1.1fr]"><div className="flex flex-col justify-center p-7 sm:p-10"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-amber-800">Clair sur les encaissements</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#102a43]">Une référence n’est pas une preuve.</h2><p className="mt-4 text-sm leading-7 text-slate-600">ChantierPilot distingue les encaissements déclarés de ceux accompagnés d’un justificatif. Le statut « prouvé » n’est attribué que lorsqu’une pièce est jointe.</p><Link to="/cgu" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#102a43] underline decoration-amber-500 decoration-2 underline-offset-4">Lire les conditions d’utilisation <span aria-hidden="true">→</span></Link></div><div className="relative min-h-64 overflow-hidden sm:min-h-80"><img src="/images/landing/chantier-abidjan.webp" alt="Deux professionnels du BTP consultent des plans sur un chantier en Côte d’Ivoire" className="absolute inset-0 h-full w-full object-cover" loading="lazy" /><div className="absolute inset-0 bg-gradient-to-r from-[#f2eee5]/40 via-transparent to-transparent md:from-[#f2eee5]/10" /><div className="absolute bottom-4 right-4 rounded-xl border border-white/60 bg-white/90 px-4 py-3 shadow-lg backdrop-blur"><p className="text-xs font-bold text-slate-900">Suivi documenté</p><p className="mt-0.5 text-[11px] text-slate-600">Vos pièces, associées à vos opérations</p></div></div></div></div></section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-9 sm:px-10 md:flex-row md:items-center"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-amber-800">Prêt à mieux vous organiser ?</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#102a43] sm:text-3xl">Donnez un point de repère à votre équipe.</h2><p className="mt-2 text-sm text-slate-600">Créez votre espace ou échangez avec nous sur votre besoin.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Link to="/inscription" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#102a43] px-5 py-3 text-sm font-bold text-white hover:bg-[#193b5b]">Créer mon entreprise</Link><a href="tel:+2250501303343" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Appeler SHOPIN30</a></div></div></section>
      </main>
      <Footer />
    </div>
  );
}
