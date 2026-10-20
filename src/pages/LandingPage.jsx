import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { Footer } from '../components/ui.jsx';

const FEATURES = [
  {
    title: 'Budgets et dépenses au même endroit',
    text: 'Chaque dépense est rattachée à son chantier, sa date, sa catégorie et son fournisseur. Vous voyez tout de suite où part le budget.',
    icon: 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Zm0 3h18M7 15h4',
  },
  {
    title: 'Encaissements avec justificatifs',
    text: 'Un règlement client a toujours une référence écrite. Ajoutez un reçu, une photo ou un PDF pour passer d’une déclaration à une pièce jointe.',
    icon: 'M12 6v12m-3.2-2.6c.8.8 2 1.1 3.2 1.1 2 0 3.5-1 3.5-2.5S14 11.7 12 11.4c-2-.3-3.5-1-3.5-2.5S10 6.5 12 6.5c1.1 0 2.2.3 3 .9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  {
    title: 'Terrain, plans annotés et stocks',
    text: 'Journal photo, pointage des ouvriers, avances de caisse, plans PDF annotés, planning Gantt et mouvements multi-dépôts réunis dans le même outil.',
    icon: 'M9 3h6v4H9zM6 5H4v16h16V5h-2M8 11h8M8 15h8',
  },
  {
    title: 'Rapports de chantier exportables en PDF',
    text: 'Produisez un point clair pour le maître d’ouvrage ou vos associés, avec les totaux en FCFA, le solde client et les montants en toutes lettres.',
    icon: 'M7 3.8h6.9L19 8.9v10.3a1.8 1.8 0 0 1-1.8 1.8H7A1.8 1.8 0 0 1 5.2 19.2V5.6A1.8 1.8 0 0 1 7 3.8Zm6.5.5V9h4.7M8.5 13h7m-7 3.5h5',
  },
];

const STEPS = [
  ['01', 'Ouvrez votre espace entreprise', 'Renseignez le nom de votre structure, votre ville et votre compte administrateur en deux minutes.'],
  ['02', 'Créez un chantier et son budget', 'Indiquez le client, le lieu et le montant prévu en FCFA pour poser une base claire dès le départ.'],
  ['03', 'Enregistrez chaque mouvement avec sa trace', 'Dépenses, avances clients, photos terrain, réserves et justificatifs restent classés chantier par chantier.'],
];

const DEMO_STATS = [
  ['Chantiers suivis', '12', 'Exemple de portefeuille'],
  ['Budget engagé', '12 000 000 FCFA', 'Montant prévu fictif'],
  ['Dépenses enregistrées', '7 450 000 FCFA', 'Achats et main-d’œuvre'],
  ['Encaissements déclarés', '9 000 000 FCFA', 'Règlements avec référence'],
];

const DEMO_MOVEMENTS = [
  ['Villa Cocody Angré — acompte client', 'Réf. VIR-0204 · Pièce jointe', '+1 500 000 FCFA', 'text-emerald-300'],
  ['Réhabilitation bureau Marcory — fer à béton', 'Fournisseur déclaré · Matériaux', '-350 000 FCFA', 'text-[#fbf8f1]'],
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f5f2eb] text-[#141210]">
      {/* Barre supérieure Noir Charbon & Or */}
      <header className="sticky top-0 z-40 border-b border-[#eab956]/25 bg-[#141210]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Logo inverted />

          <nav className="hidden items-center gap-7 text-sm font-semibold text-[#dfd9ce] md:flex" aria-label="Navigation principale">
            <a href="#fonctionnalites" className="transition hover:text-[#eab956]">Fonctionnalités</a>
            <a href="#methode" className="transition hover:text-[#eab956]">Comment ça marche</a>
            <Link to="/offres" className="transition hover:text-[#eab956]">Offres</Link>
            <Link to="/connexion" className="transition hover:text-[#eab956]">Se connecter</Link>
            <Link
              to="/inscription"
              className="inline-flex min-h-11 items-center rounded-xl bg-[#e5a93b] px-4 py-2 font-bold text-[#141210] shadow-sm transition hover:bg-[#f0b84c]"
            >
              Créer mon espace
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-[#fbf8f1] md:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
          >
            <svg className="h-5 w-5 text-[#eab956]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={menuOpen ? 'M6 18 18 6M6 6l12 12' : 'M4 7h16M4 12h16M4 17h16'} />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-[#141210] px-4 py-4 md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 text-sm font-semibold text-[#fbf8f1]">
              <a href="#fonctionnalites" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-white/[0.07]">Fonctionnalités</a>
              <a href="#methode" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-white/[0.07]">Comment ça marche</a>
              <Link to="/offres" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-white/[0.07]">Offres</Link>
              <Link to="/connexion" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-white/[0.07]">Se connecter</Link>
              <Link
                to="/inscription"
                onClick={() => setMenuOpen(false)}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#e5a93b] px-4 py-2.5 font-bold text-[#141210]"
              >
                Créer mon espace entreprise
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* HERO Noir Charbon & Or avec illustration BTP visible dès le premier écran (mobile & bureau) */}
        <section className="relative overflow-hidden border-b border-[#eab956]/25 bg-[#141210] pt-5 pb-10 text-[#fbf8f1] sm:pt-10 sm:pb-16 lg:pt-12 lg:pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-6 lg:grid-cols-12 lg:gap-10">
              {/* Colonne gauche : promesse & actions immédiates */}
              <div className="min-w-0 lg:col-span-6">
                <p className="inline-flex items-center gap-2 rounded-full border border-[#eab956]/35 bg-[#eab956]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#eab956]">
                  <span className="h-2 w-2 rounded-full bg-[#eab956]" aria-hidden="true" />
                  CÔTE D’IVOIRE · GESTION DE CHANTIERS EN FCFA
                </p>

                <h1 className="mt-3 text-[1.75rem] font-extrabold leading-[1.14] tracking-tight text-[#fbf8f1] sm:mt-4 sm:text-5xl">
                  Vos chantiers avancent.
                  <span className="mt-1 block text-[#eab956]">Vos chiffres restent clairs.</span>
                </h1>

                <p className="mt-3 max-w-xl text-sm leading-6 text-[#dfd9ce] sm:mt-5 sm:text-lg sm:leading-8">
                  Suivez vos chantiers, vos devis, vos dépenses, vos équipes terrain et vos encaissements en français et en FCFA, avec une séparation nette entre simple référence et pièce justificative jointe.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-7 sm:gap-3">
                  <Link
                    to="/inscription"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#e5a93b] px-5 py-2.5 text-sm font-extrabold text-[#141210] shadow-md transition hover:bg-[#f0b84c]"
                  >
                    Créer mon espace entreprise
                  </Link>
                  <Link
                    to="/connexion"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#eab956]/40 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-[#fbf8f1] transition hover:bg-white/[0.12]"
                  >
                    Se connecter
                  </Link>
                </div>

                <p className="mt-3 text-xs leading-5 text-[#cfc7b8] sm:mt-4">
                  14 jours d’essai sans carte · paiement sécurisé via SasPay · données isolées par entreprise.
                </p>
              </div>

              {/* Colonne droite : illustration BTP visible immédiatement dès le premier écran + aperçu fictif */}
              <div className="min-w-0 lg:col-span-6">
                <div className="overflow-hidden rounded-3xl border border-[#eab956]/35 bg-[#1b1815] shadow-2xl">
                  <div className="relative">
                    <picture>
                      <source srcSet="/images/landing/chantier-abidjan.webp" type="image/webp" />
                      <img
                        src="/images/landing/chantier-abidjan.jpg"
                        alt="Deux professionnels du BTP vérifiant un plan et le suivi d’un chantier à Abidjan"
                        width="1600"
                        height="900"
                        loading="eager"
                        fetchPriority="high"
                        decoding="sync"
                        className="h-52 w-full object-cover object-center sm:h-64"
                      />
                    </picture>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[#eab956]/25 bg-[#141210]/95 px-4 py-2.5">
                      <span className="text-xs font-extrabold tracking-wide text-[#fbf8f1]">
                        APERÇU D’INTERFACE · CHANTIER BTP
                      </span>
                      <span className="rounded-full border border-[#eab956]/45 bg-[#eab956]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#eab956]">
                        Données fictives
                      </span>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-2 gap-2.5">
                      {DEMO_STATS.map(([label, value, hint]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-[#12100e] p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#b9b0a1]">{label}</p>
                          <p className="mt-1 text-sm font-extrabold tabular text-[#eab956] sm:text-base">{value}</p>
                          <p className="mt-0.5 text-[11px] text-[#9c9488]">{hint}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-[#12100e] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#cfc7b8]">Activité récente (exemple)</p>
                        <span className="text-xs font-semibold text-[#eab956]">Solde client fictif : 3 000 000 FCFA</span>
                      </div>
                      <div className="mt-2.5 divide-y divide-white/10">
                        {DEMO_MOVEMENTS.map(([label, meta, amount, color]) => (
                          <div key={label} className="flex items-center justify-between gap-3 py-2 text-xs">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#fbf8f1]">{label}</p>
                              <p className="text-[#a89f91]">{meta}</p>
                            </div>
                            <span className={`shrink-0 font-extrabold tabular ${color}`}>{amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="mt-2.5 text-[11px] leading-5 text-[#a89f91]">
                      Aperçu de présentation : chiffres fictifs, à titre de démonstration. Votre espace entreprise démarre vierge, uniquement avec vos propres saisies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FONCTIONNALITÉS */}
        <section id="fonctionnalites" className="scroll-mt-20 border-b border-[#dfd8c8] bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#854d0e]">Conçu pour le terrain et le bureau</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#141210] sm:text-3xl">
                L’essentiel pour piloter vos chantiers sans confusion.
              </h2>
              <p className="mt-3 text-base leading-7 text-[#574f45]">
                Pas de menus obscurs ni de jargon inutile : chaque écran répond à une question concrète de dirigeant, de conducteur de travaux ou d’assistant administratif.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="flex flex-col rounded-2xl border border-[#e3ddd0] bg-[#faf7f0] p-5 shadow-sm transition hover:border-[#eab956]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#141210] text-[#eab956] ring-1 ring-[#eab956]/40">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-base font-extrabold text-[#141210]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#574f45]">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* MÉTHODE & DISTINCTION DÉCLARATION / PREUVE */}
        <section id="methode" className="scroll-mt-20 py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#854d0e]">Prise en main immédiate</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#141210] sm:text-3xl">
                  Une méthode honnête sur ce qui est déclaré et ce qui est justifié.
                </h2>
                <p className="mt-3 text-base leading-7 text-[#574f45]">
                  Une référence n’est pas une preuve. ChantierPilot exige une référence écrite pour chaque encaissement ou accord client, et n’affiche un règlement comme justifié que lorsqu’une pièce est jointe.
                </p>
                <div className="cp-charcoal-panel mt-6 rounded-2xl p-5 shadow-md">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#eab956]">Rigueur documentaire</p>
                  <p className="mt-1.5 text-sm leading-6 text-[#dfd9ce]">
                    Devis, factures, avances de caisse et présences conservent leur historique par entreprise et restent consultables hors connexion sur le terrain.
                  </p>
                </div>
              </div>

              <div className="space-y-4 lg:col-span-7">
                {STEPS.map(([number, title, text]) => (
                  <div key={number} className="flex gap-4 rounded-2xl border border-[#e3ddd0] bg-white p-5 shadow-sm">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#141210] text-sm font-extrabold tabular text-[#eab956] ring-1 ring-[#eab956]/40">
                      {number}
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-[#141210]">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#574f45]">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL Noir Charbon & Or */}
        <section className="py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="cp-charcoal-panel flex flex-col justify-between gap-6 rounded-3xl p-7 shadow-xl sm:flex-row sm:items-center sm:p-10">
              <div className="max-w-xl">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#eab956]">Démarrage sans carte bancaire</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#fbf8f1] sm:text-3xl">
                  Prêt à mieux vous organiser dès votre prochain chantier ?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#dfd9ce]">
                  Créez votre compte entreprise, enregistrez votre premier chantier et vérifiez la clarté du suivi avec votre équipe.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:shrink-0 sm:flex-row">
                <Link
                  to="/inscription"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#e5a93b] px-5 py-3 text-sm font-extrabold text-[#141210] transition hover:bg-[#f0b84c]"
                >
                  Ouvrir un compte entreprise
                </Link>
                <Link
                  to="/offres"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#eab956]/40 px-5 py-3 text-sm font-bold text-[#fbf8f1] transition hover:bg-white/[0.08]"
                >
                  Consulter les offres
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
