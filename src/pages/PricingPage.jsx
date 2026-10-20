import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Footer } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';
import BtpVisual from '../components/BtpVisual.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { PLANS } from '../../shared/plans.js';
import { formatFcfa, formatDate } from '../lib/format.js';

export default function PricingPage({ standalone = false }) {
  const { status, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const load = () => api('/api/billing').then(setData);
  useEffect(() => {
    if (status !== 'auth') return;
    let live = true;
    (async () => {
      try {
        if (params.get('commande')) {
          const result = await api('/api/billing', { method: 'POST', body: { action: 'verify', order_id: params.get('commande') } });
          if (live) setMessage(result.status === 'paid' ? 'Paiement confirmé. Votre forfait est activé.' : 'Paiement en attente de confirmation. Vous pouvez le revérifier ci-dessous.');
        }
        const result = await api('/api/billing');
        if (live) setData(result);
      } catch (e) { if (live) setError(e.message); }
    })();
    return () => { live = false; };
  }, [status, params]);
  async function pay(plan) {
    setBusy(true); setError('');
    try {
      const result = await api('/api/billing', { method: 'POST', body: { plan } });
      window.location.assign(result.url);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  async function verify(order) {
    setBusy(true); setError('');
    try {
      const result = await api('/api/billing', { method: 'POST', body: { action: 'verify', order_id: order.id } });
      setMessage(result.status === 'paid' ? 'Paiement confirmé et forfait activé.' : `Paiement : ${result.status === 'pending' ? 'en attente' : 'non abouti'}.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const content = <div className="mx-auto max-w-5xl py-6">
    <div className="cp-charcoal-panel overflow-hidden rounded-3xl p-6 shadow-xl sm:p-8">
      <div className="grid items-center gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#eab956]">Moins de pertes, plus de visibilité</p>
          <h1 className="mt-2.5 text-3xl font-extrabold text-[#fbf8f1] sm:text-4xl">Un forfait à la taille de vos chantiers</h1>
          <p className="mt-3 text-sm leading-6 text-[#dfd9ce] sm:text-base">
            14 jours d’essai sans carte. Pas de frais d’installation obligatoires. Dépenses, justificatifs, encaissements déclarés et rapports inclus dans chaque offre.
          </p>
        </div>
        <div className="min-w-0 lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-[#eab956]/35">
            <BtpVisual
              kind="budget"
              eager
              alt="Bureau d’études et suivi budgétaire BTP en Côte d’Ivoire"
              className="h-44 w-full object-cover object-center sm:h-48"
            />
          </div>
        </div>
      </div>
    </div>
    {error && <div className="mt-5"><Alert type="error">{error}</Alert></div>}
    {message && <div className="mt-5"><Alert>{message}</Alert></div>}
    {status === 'auth' && !data && !error && <p className="mt-5" role="status">Chargement de votre abonnement…</p>}
    {data && <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6" aria-label="Mon abonnement">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Mon espace · {data.status === 'essai' ? 'Essai Essentiel' : data.plan.name}</h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold">{{ essai: 'Essai en cours', actif: 'Actif', lecture_seule: 'Lecture seule', suspendu: 'Suspendu' }[data.status]}</span></div>
      <p className="mt-3 text-sm text-slate-600">{data.usage.projects} / {data.plan.projects} chantiers ouverts · {data.usage.users} / {data.plan.users} utilisateurs actifs (administrateur inclus).</p>
      <p className="mt-2 text-sm">{data.status === 'essai' ? `Essai jusqu’au ${formatDate(data.trial_until)}` : data.paid_until ? `Dernière période payée jusqu’au ${formatDate(data.paid_until)}` : 'Choisissez un forfait pour reprendre les modifications.'}</p>
      {!data.writable && <p className="mt-2 text-sm font-semibold text-amber-800">Vos données, rapports et exports restent accessibles. Les modifications sont bloquées ; aucune donnée n’est supprimée.</p>}
      {!data.configured && <p className="mt-3 text-sm text-amber-800">Le paiement SasPay n’est pas encore configuré par l’exploitant.</p>}
      {data.test_mode && <p className="mt-3 font-semibold text-amber-800">Mode test SasPay — aucun encaissement réel.</p>}
    </section>}
    <div className="mt-8 grid gap-5 md:grid-cols-3">{Object.entries(PLANS).map(([id, plan]) => <section key={id} className={`relative flex flex-col rounded-2xl border p-6 ${id === 'equipe' ? 'cp-charcoal-panel border-[#eab956] shadow-xl' : 'border-[#e3ddd0] bg-white'}`}>
      {id === 'equipe' && <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-[#eab956]">Pour les équipes terrain</p>}
      <h2 className={`text-xl font-extrabold ${id === 'equipe' ? 'text-[#fbf8f1]' : 'text-[#141210]'}`}>{plan.name}</h2><p className={`mt-2 min-h-14 text-sm ${id === 'equipe' ? 'text-[#cfc7b8]' : 'text-[#574f45]'}`}>{plan.description}</p>
      <p className={`mt-5 text-3xl font-extrabold tabular ${id === 'equipe' ? 'text-[#eab956]' : 'text-[#141210]'}`}>{formatFcfa(plan.price)}</p><p className={`mt-1 text-sm ${id === 'equipe' ? 'text-[#b9b0a1]' : 'text-[#574f45]'}`}>pour 30 jours · sans engagement</p>
      <ul className={`my-6 space-y-3 text-sm ${id === 'equipe' ? 'text-[#dfd9ce]' : 'text-[#3f3932]'}`}>
        {[`${plan.projects} chantiers ouverts`, `${plan.users} utilisateurs actifs, dirigeant inclus`, 'Devis, acomptes, situations et factures PDF', 'Dépenses, avances et justificatifs', 'Présences, tâches et journal photo', 'Achats et stock par chantier', 'Saisie terrain hors ligne (journal, présences)', 'Suivi des soldes clients déclarés', 'Alertes budget, trésorerie et retard', 'Rapports PDF et exports CSV / JSON', 'Historique et traçabilité des actions'].map(text => <li key={text} className="flex gap-2"><span className={`font-bold ${id === 'equipe' ? 'text-[#eab956]' : 'text-emerald-600'}`} aria-hidden="true">✓</span>{text}</li>)}
      </ul>
      <div className="mt-auto">{status !== 'auth' ? <Link to="/inscription"><Button className="w-full">Essayer 14 jours</Button></Link> : <Button className="w-full" disabled={busy || !data?.configured || user?.role !== 'admin' || data?.status === 'suspendu'} onClick={() => pay(id)}>{busy ? 'Veuillez patienter…' : `Payer avec SasPay`}</Button>}</div>
    </section>)}</div>
    <div className="mt-6 rounded-xl bg-slate-100 p-5 text-sm leading-6 text-slate-600"><strong className="text-slate-900">Vous gardez le contrôle du paiement.</strong> Chaque renouvellement est validé sur SasPay, par les moyens proposés sur sa page sécurisée. La confirmation et l’activation sont automatiques ; il n’y a pas de prélèvement mensuel sans votre intervention. Les frais éventuels sont affichés par SasPay avant validation. Le changement de gamme se fait à l’expiration du forfait payé, sans prorata. Un paiement déjà en attente est repris pour éviter les doublons.</div>
    {data?.orders.length > 0 && <section className="mt-8"><h2 className="text-xl font-bold">Historique des paiements d’abonnement</h2><div className="mt-4 space-y-3">{data.orders.map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><div><p className="font-semibold">{PLANS[order.plan].name} · {formatFcfa(order.amount)}</p><p className="text-sm text-slate-500">{formatDate(order.created_at)} · {{ paid: 'Payé', pending: 'En attente', failed: 'Non abouti', expired: 'Expiré' }[order.status]}</p>{order.access_until && <p className="text-sm text-slate-500">Accès jusqu’au {formatDate(order.access_until)}</p>}</div>{order.status === 'pending' && user?.role === 'admin' && <div className="flex gap-2">{order.checkout_url && <a className="rounded-lg border px-3 py-2 text-sm font-semibold" href={order.checkout_url}>Reprendre</a>}<Button disabled={busy} onClick={() => verify(order)}>Vérifier</Button></div>}</div>)}</div></section>}
    <section className="mt-10 grid gap-6 text-sm text-slate-600 sm:grid-cols-2"><div><h2 className="font-bold text-slate-900">Des limites lisibles, pas de données perdues</h2><p className="mt-2">Les chantiers terminés ou archivés ne consomment pas le quota. Un compte désactivé libère une place. En cas de dépassement après changement de forfait, l’historique est conservé mais les nouvelles créations sont refusées.</p></div><div><h2 className="font-bold text-slate-900">Besoin d’un coup de main ?</h2><p className="mt-2">Import, formation et accompagnement restent des prestations facultatives sur devis. Le logiciel ne remplace pas une comptabilité complète et les encaissements chantier restent des déclarations.</p></div></section>
  </div>;
  if (!standalone) return content;
  return <div className="min-h-screen bg-[#f5f2eb]"><header className="border-b border-[#eab956]/25 bg-[#141210]"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><Logo inverted to="/" /><Link to="/connexion" className="text-sm font-bold text-[#eab956] hover:underline">Connexion</Link></div></header><main className="px-4 sm:px-6">{content}</main><Footer /></div>;
}
