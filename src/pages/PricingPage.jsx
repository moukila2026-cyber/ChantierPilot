import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Footer, Spinner } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';
import BtpVisual from '../components/BtpVisual.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { PLANS, trialDaysRemaining } from '../../shared/plans.js';
import { formatFcfa, formatDate } from '../lib/format.js';

const PLAN_FEATURES = (plan) => [
  `${plan.projects} chantiers ouverts simultanément`,
  `${plan.users} utilisateurs actifs, dirigeant inclus`,
  'Devis, acomptes, situations et factures PDF',
  'Dépenses, avances de caisse et justificatifs',
  'Photos terrain, reçus caméra, présences & tâches',
  'Achats fournisseurs et stock multi-dépôts',
  'Journal et présences hors ligne, synchronisés au retour réseau',
  'Suivi des soldes clients déclarés & retenues',
  'Alertes budget, trésorerie et échéances',
  'Rapports PDF, PV de réception & exports CSV / JSON',
  'Journal d’audit et traçabilité par entreprise',
];

export default function PricingPage({ standalone = false }) {
  const { status, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [params] = useSearchParams();
  const feedbackRef = useRef(null);

  const load = () => api('/api/billing').then(setData);

  useEffect(() => {
    if (status !== 'auth') return undefined;
    let live = true;
    (async () => {
      if (params.get('commande') && user?.role === 'admin') {
        try {
          const result = await api('/api/billing', {
            method: 'POST',
            body: { action: 'verify', order_id: params.get('commande') },
          });
          if (live) setMessage(result.status === 'paid'
            ? 'Paiement confirmé. Votre forfait est activé immédiatement.'
            : 'Paiement en attente de confirmation. Vous pouvez le revérifier ci-dessous.');
        } catch (e) {
          if (live) setError(e.message);
        }
      }
      // Même si la vérification échoue, l'historique et les boutons de
      // rapprochement doivent rester accessibles.
      try {
        const result = await api('/api/billing');
        if (live) setData(result);
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => { live = false; };
  }, [status, params, user?.role]);

  const revealFeedback = () => {
    requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  async function pay(planId) {
    setBusyKey(planId);
    setError('');
    try {
      const result = await api('/api/billing', { method: 'POST', body: { plan: planId } });
      window.location.assign(result.url);
    } catch (e) {
      setError(e.message);
      setBusyKey('');
      revealFeedback();
    }
  }

  async function verify(order) {
    setBusyKey(`verify:${order.id}`);
    setError('');
    try {
      const result = await api('/api/billing', {
        method: 'POST',
        body: { action: 'verify', order_id: order.id },
      });
      setMessage(
        result.status === 'paid'
          ? 'Paiement confirmé et forfait activé.'
          : `Paiement : ${result.status === 'pending' ? 'en attente' : 'non abouti'}.`,
      );
      await load();
    } catch (e) {
      setError(e.message);
      revealFeedback();
    } finally {
      setBusyKey('');
    }
  }

  const projectsPct = data
    ? Math.min(100, Math.round(((data.usage?.projects || 0) / Math.max(1, data.plan?.projects || 1)) * 100))
    : 0;
  const usersPct = data
    ? Math.min(100, Math.round(((data.usage?.users || 0) / Math.max(1, data.plan?.users || 1)) * 100))
    : 0;

  const content = (
    <div className="mx-auto max-w-6xl py-4 sm:py-6">
      {/* Bannière Exécutive Noir Charbon & Or */}
      <div className="cp-charcoal-panel cp-page-hero p-6 sm:p-8">
        <div className="grid items-center gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#eab956]/40 bg-[#eab956]/12 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#eab956]">
              <span className="h-2 w-2 rounded-full bg-[#eab956]" aria-hidden="true" />
              Moins de pertes, plus de visibilité
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#fbf8f1] sm:text-4xl">
              Un forfait à la taille de vos chantiers
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#dfd9ce] sm:text-base">
              2 semaines (14 jours) d’essai gratuit sans carte bancaire. Pas de frais d’installation obligatoires. Dépenses, photos chantier, justificatifs, encaissements déclarés et rapports PDF inclus dans chaque offre.
            </p>
            <p className="mt-4 text-xs leading-5 text-[#dfd9ce]">
              Les moyens de paiement disponibles et les frais éventuels sont indiqués sur la page SasPay avant validation.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-[#eab956]/40 bg-[#12100e] shadow-xl">
              <BtpVisual
                kind="budget"
                eager
                alt="Bureau d’études et suivi budgétaire BTP en Côte d’Ivoire"
                className="h-44 w-full object-cover object-center sm:h-52"
              />
              <div className="flex items-center justify-between border-t border-[#eab956]/25 px-4 py-2 text-xs">
                <span className="font-bold text-[#fbf8f1]">Paiement sécurisé SasPay</span>
                <span className="font-extrabold text-[#eab956]">30 jours · Sans prélèvement auto</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statut de l’espace connecté */}
      {status === 'auth' && !data && !error && (
        <div className="my-5">
          <Card><Spinner label="Chargement de votre abonnement…" /></Card>
        </div>
      )}

      {data && (
        <section className="cp-card mt-6 p-6" aria-label="Mon abonnement">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ede7da] pb-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#854d0e]">Situation actuelle de l’espace</p>
              <h2 className="mt-1 text-lg font-extrabold text-[#141210]">
                Mon espace · {data.status === 'essai' ? 'Essai Essentiel' : data.plan.name}
              </h2>
            </div>
            <Badge className={
              data.status === 'actif'
                ? 'bg-emerald-100 text-emerald-900 ring-emerald-300'
                : data.status === 'essai'
                  ? 'bg-amber-100 text-amber-900 ring-amber-300'
                  : 'bg-rose-100 text-rose-900 ring-rose-300'
            }
            >
              {{
                essai: 'Essai en cours',
                actif: 'Actif',
                lecture_seule: 'Lecture seule',
                suspendu: 'Suspendu',
              }[data.status]}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#ded7c7] bg-[#faf7f0] p-4">
              <div className="flex items-center justify-between text-xs font-bold text-[#141210]">
                <span>Chantiers ouverts</span>
                <span className="tabular">{data.usage.projects} / {data.plan.projects}</span>
              </div>
              <div className="progress-track mt-2">
                <div className="progress-fill bg-[#e5a93b]" style={{ width: `${projectsPct}%` }} />
              </div>
            </div>
            <div className="rounded-xl border border-[#ded7c7] bg-[#faf7f0] p-4">
              <div className="flex items-center justify-between text-xs font-bold text-[#141210]">
                <span>Utilisateurs actifs (dirigeant inclus)</span>
                <span className="tabular">{data.usage.users} / {data.plan.users}</span>
              </div>
              <div className="progress-track mt-2">
                <div className="progress-fill bg-[#141210]" style={{ width: `${usersPct}%` }} />
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm font-bold text-[#141210]">
            {data.status === 'essai' ? (() => {
              const days = data.trial_days_remaining ?? trialDaysRemaining(data.trial_until);
              return `Essai gratuit de 2 semaines (14 jours) · ${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''} — jusqu’au ${formatDate(data.trial_until)}`;
            })() : data.paid_until
              ? `Dernière période payée jusqu’au ${formatDate(data.paid_until)}`
              : 'Choisissez un forfait ci-dessous pour reprendre immédiatement les modifications.'}
          </p>

          {!data.writable && (
            <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-950">
              Vos données, rapports et exports restent accessibles. Les modifications sont bloquées ; aucune donnée n’est supprimée.
            </p>
          )}
          {!data.configured && (
            <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-950">
              Le paiement SasPay n’est pas encore configuré par l’exploitant.
            </p>
          )}
          {data.test_mode && (
            <p className="mt-2 inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
              Mode test SasPay — aucun encaissement réel.
            </p>
          )}
        </section>
      )}

      {/* Zone de retour d’état juste au-dessus des 3 cartes pour visibilité immédiate */}
      <div ref={feedbackRef} className="mt-5 space-y-3">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        {message && <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>}
      </div>

      {/* Grille des 3 offres */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {Object.entries(PLANS).map(([id, plan]) => {
          const featured = id === 'equipe';
          const isThisPlanBusy = busyKey === id;
          return (
            <section
              key={id}
              className={`relative flex flex-col rounded-3xl p-6 transition ${
                featured
                  ? 'cp-charcoal-panel shadow-2xl ring-2 ring-[#eab956]/70'
                  : 'cp-card cp-card-interactive bg-white'
              }`}
            >
              {featured ? (
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#eab956] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#141210]">
                    Populaire · Équipes terrain
                  </span>
                </div>
              ) : (
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-[#854d0e]">
                  {id === 'essentiel' ? 'Démarrage rapide' : 'Multi-chantiers & dépôts'}
                </p>
              )}

              <h2 className={`text-xl font-extrabold ${featured ? 'text-[#fbf8f1]' : 'text-[#141210]'}`}>
                {plan.name}
              </h2>
              <p className={`mt-2 min-h-12 text-sm leading-6 ${featured ? 'text-[#dfd9ce]' : 'text-[#574f45]'}`}>
                {plan.description}
              </p>

              <div className={`mt-5 rounded-2xl border p-4 ${
                featured ? 'border-white/12 bg-white/[0.05]' : 'border-[#ede7da] bg-[#faf7f0]'
              }`}
              >
                <p className={`text-3xl font-extrabold tabular ${featured ? 'text-[#eab956]' : 'text-[#141210]'}`}>
                  {formatFcfa(plan.price)}
                </p>
                <p className={`mt-1 text-xs font-semibold ${featured ? 'text-[#cfc7b8]' : 'text-[#696055]'}`}>
                  pour 30 jours complets · sans engagement
                </p>
              </div>

              <ul className={`my-6 space-y-2.5 text-sm ${featured ? 'text-[#fbf8f1]' : 'text-[#2c2721]'}`}>
                {PLAN_FEATURES(plan).map((text) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                        featured ? 'bg-[#eab956]/20 text-[#eab956]' : 'bg-emerald-100 text-emerald-800'
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                {status !== 'auth' ? (
                  <Link to="/inscription" className="block">
                    <Button variant={featured ? 'primary' : 'dark'} className="w-full">
                      Essayer 14 jours
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant={featured ? 'primary' : 'dark'}
                    className="w-full"
                    loading={isThisPlanBusy}
                    disabled={Boolean(busyKey) || !data?.configured || user?.role !== 'admin' || data?.status === 'suspendu'}
                    onClick={() => pay(id)}
                  >
                    {isThisPlanBusy ? 'Redirection vers SasPay…' : 'Payer avec SasPay'}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Garanties contractuelles claires */}
      <div className="cp-card mt-8 bg-[#faf7f0] p-5 text-sm leading-6 text-[#574f45] sm:p-6">
        <strong className="font-extrabold text-[#141210]">Vous gardez le contrôle total du paiement.</strong>{' '}
        Chaque renouvellement est validé par vos soins sur la page sécurisée SasPay. La confirmation et l’activation de vos 30 jours d’accès sont automatiques ; il n’y a aucun prélèvement mensuel automatique. Les frais éventuels sont affichés par SasPay avant validation. Le changement de gamme s’effectue à l’expiration du forfait payé, sans prorata caché.
      </div>

      {/* Historique des commandes SasPay */}
      {data?.orders?.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-[#141210]">Historique des paiements d’abonnement</h2>
          <div className="mt-4 space-y-3">
            {data.orders.map((order) => {
              const verifyingThis = busyKey === `verify:${order.id}`;
              return (
                <div
                  key={order.id}
                  className="cp-card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
                >
                  <div>
                    <p className="font-extrabold text-[#141210]">
                      {PLANS[order.plan]?.name || order.plan} · <span className="tabular">{formatFcfa(order.amount)}</span>
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-[#574f45]">
                      {formatDate(order.created_at)} · {{
                        paid: 'Payé',
                        pending: 'En attente de règlement',
                        failed: 'Non abouti',
                        expired: 'Expiré',
                      }[order.status]}
                    </p>
                    {order.access_until && (
                      <p className="mt-0.5 text-xs font-bold text-emerald-800">
                        Accès ouvert jusqu’au {formatDate(order.access_until)}
                      </p>
                    )}
                  </div>
                  {order.status === 'pending' && user?.role === 'admin' && (
                    <div className="flex flex-wrap gap-2">
                      {order.checkout_url && (
                        <a className="cp-btn cp-btn-secondary" href={order.checkout_url}>
                          Reprendre ↗
                        </a>
                      )}
                      <Button
                        loading={verifyingThis}
                        disabled={Boolean(busyKey)}
                        onClick={() => verify(order)}
                      >
                        {verifyingThis ? 'Vérification…' : 'Vérifier'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-5 text-sm text-[#574f45] sm:grid-cols-2">
        <Card>
          <h2 className="font-extrabold text-[#141210]">Des limites lisibles, zéro donnée perdue</h2>
          <p className="mt-2 leading-6">
            Les chantiers terminés ou archivés libèrent immédiatement leur place dans votre quota. Un compte collaborateur désactivé libère une place. En fin d’abonnement, toutes vos pièces et exports restent consultables en lecture seule.
          </p>
        </Card>
        <Card>
          <h2 className="font-extrabold text-[#141210]">Accompagnement &amp; cadre métier</h2>
          <p className="mt-2 leading-6">
            Import initial, formation d’équipe et accompagnement sur site restent facultatifs sur devis auprès de SHOPIN30. ChantierPilot est un outil de suivi opérationnel BTP et ne remplace pas un cabinet comptable.
          </p>
        </Card>
      </section>
    </div>
  );

  if (!standalone) return content;

  return (
    <div className="min-h-screen bg-[#f5f2eb]">
      <header className="sticky top-0 z-40 border-b border-[#eab956]/25 bg-[#141210]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Logo inverted to="/" />
          <div className="flex items-center gap-3">
            <Link to="/connexion" className="text-sm font-bold text-[#dfd9ce] hover:text-[#eab956]">
              Connexion
            </Link>
            <Link to="/inscription" className="cp-btn cp-btn-primary min-h-10 px-4 py-2 text-xs sm:text-sm">
              Créer mon espace
            </Link>
          </div>
        </div>
      </header>
      <main className="px-4 sm:px-6">{content}</main>
      <Footer />
    </div>
  );
}
