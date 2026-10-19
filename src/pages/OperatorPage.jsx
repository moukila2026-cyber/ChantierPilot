import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Alert, Button, PageHeader } from '../components/ui.jsx';
import { formatDate } from '../lib/format.js';
export default function OperatorPage() {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/operator').then(d => setCompanies(d.companies));
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/api/operator', { method: 'PATCH', body: { company_id: selected.id, suspended: !selected.billing_suspended, reason } });
      setSelected(null); setReason(''); await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div><PageHeader title="Console SHOPIN30" subtitle="Accès réservé aux opérateurs désignés. Les suspensions sont journalisées et ne suppriment aucune donnée." />
    {error && <Alert type="error">{error}</Alert>}
    {selected && <form onSubmit={submit} className="my-5 rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-bold">{selected.billing_suspended ? 'Réactiver' : 'Suspendre les modifications de'} {selected.name} ?</h2><p className="mt-2 text-sm">Une réactivation ne prolonge pas la période payée. Lecture et exports restent disponibles.</p><label className="mt-4 block text-sm font-semibold" htmlFor="operator-reason">Motif obligatoire</label><textarea id="operator-reason" required minLength={5} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3" /><div className="mt-3 flex gap-3"><Button type="submit" disabled={busy}>Confirmer</Button><button type="button" onClick={() => setSelected(null)}>Annuler</button></div></form>}
    <div className="mt-5 space-y-3">{companies.map(c => <section key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5"><div><h2 className="font-bold">{c.name}</h2><p className="text-sm text-slate-600">{c.billing_plan || 'Essai'} · {c.billing_suspended ? 'Suspendu' : new Date(c.paid_until || c.trial_until) > new Date() ? 'Accès ouvert' : 'Expiré'} · échéance {formatDate(c.paid_until || c.trial_until)}</p><p className="mt-1 break-all text-xs text-slate-400">{c.id}</p></div><Button onClick={() => { setSelected(c); setReason(''); }}>{c.billing_suspended ? 'Réactiver' : 'Suspendre'}</Button></section>)}</div>
  </div>;
}
