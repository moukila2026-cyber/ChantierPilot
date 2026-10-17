import { Link } from 'react-router-dom';
import { Button, Footer } from '../components/ui.jsx';

const OFFERS = [
  {
    name: 'Pilote fondateur',
    tag: 'Premier client',
    price: '75 000 FCFA',
    priceSub: 'Installation initiale',
    monthly: 'Puis 25 000 FCFA/mois',
    monthlySub: 'Hébergement, support et utilisation du logiciel, selon le périmètre convenu.',
    features: [
      'Configuration de l\'entreprise',
      'Import d\'un fichier existant si les données sont propres',
      'Formation de prise en main',
      'Assistance initiale pendant 14 jours',
    ],
    highlight: true,
  },
  {
    name: 'Offre Standard',
    tag: 'Plusieurs chantiers',
    price: '150 000 FCFA',
    priceSub: 'Installation et configuration',
    monthly: 'Puis 35 000 à 50 000 FCFA/mois',
    monthlySub: 'Selon le périmètre convenu.',
    features: [
      'Configuration personnalisée',
      'Import de données convenu',
      'Formation du dirigeant et de l\'équipe',
      'Rapport PDF personnalisé',
    ],
    highlight: false,
  },
];

const EXTRAS = [
  ['Site web professionnel', 'à partir de 100 000 FCFA selon le contenu et les fonctions.'],
  ['Catalogue de réalisations avec photos', 'devis séparé.'],
  ['Fonctionnalité sur mesure', 'devis après analyse.'],
];

export default function PricingPage({ standalone = false }) {
  const content = (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nos offres de lancement</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
          Grille tarifaire de lancement, testée auprès des premiers prospects. Elle ne prétend pas
          représenter le tarif moyen du marché.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {OFFERS.map((offer) => (
          <div
            key={offer.name}
            className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
              offer.highlight ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{offer.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                offer.highlight ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {offer.tag}
              </span>
            </div>
            <p className="mt-4 text-3xl font-extrabold tabular text-slate-900">{offer.price}</p>
            <p className="text-sm text-slate-500">{offer.priceSub}</p>
            <p className="mt-3 text-sm font-semibold text-amber-700">{offer.monthly}</p>
            <p className="text-xs text-slate-500">{offer.monthlySub}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {offer.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                  <svg className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.79a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Services complémentaires</h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {EXTRAS.map(([label, detail]) => (
            <li key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between">
              <span className="text-sm font-semibold text-slate-800">{label}</span>
              <span className="text-sm text-slate-500">{detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-slate-500">Des questions ? Contactez-nous pour discuter de votre périmètre.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link to="/inscription"><Button>Créer mon entreprise</Button></Link>
          <Link to="/connexion"><Button variant="secondary">Se connecter</Button></Link>
        </div>
      </div>
      {!standalone && <Footer />}
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="bg-slate-900 px-4 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Link to="/connexion" className="flex items-center gap-2.5">
              <svg className="h-9 w-9 rounded-lg bg-slate-800 p-1.5" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M8 22 L16 8 L24 22 Z" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" />
                <rect x="12" y="18" width="8" height="4" fill="#f59e0b" />
              </svg>
              <span className="font-bold text-white">ChantierPilot</span>
            </Link>
            <Link to="/connexion" className="text-sm font-medium text-slate-300 hover:text-white">Connexion</Link>
          </div>
        </header>
        {content}
        <Footer />
      </div>
    );
  }
  return content;
}
