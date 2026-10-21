import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Alert, Badge, Button, Card, PageHeader } from '../components/ui.jsx';
import { formatDate } from '../lib/format.js';

export default function OperatorPage() {
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/operator').then((d) => setCompanies(d.companies));
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/operator', {
        method: 'PATCH',
        body: { company_id: selected.id, suspended: !selected.billing_suspended, reason },
      });
      setSelected(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration plateforme"
        title="Console SHOPIN30"
        subtitle="Accès réservé aux opérateurs désignés. Les suspensions sont journalisées et ne suppriment aucune donnée."
      />
      {error && <div className="mb-4"><Alert type="error" onClose={() => setError('')}>{error}</Alert></div>}

      {selected && (
        <form onSubmit={submit} className="my-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <h2 className="font-extrabold text-[#141210]">
            {selected.billing_suspended ? 'Réactiver' : 'Suspendre les modifications de'} {selected.name} ?
          </h2>
          <p className="mt-2 text-sm text-[#574f45]">
            Une réactivation ne prolonge pas la période payée. Lecture et exports restent disponibles.
          </p>
          <label className="mt-4 block text-sm font-bold text-[#141210]" htmlFor="operator-reason">
            Motif obligatoire
          </label>
          <textarea
            id="operator-reason"
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="cp-input mt-2 w-full bg-white p-3"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>Confirmer</Button>
            <Button variant="secondary" onClick={() => setSelected(null)}>Annuler</Button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {companies.map((c) => {
          const isOpen = !c.billing_suspended && new Date(c.paid_until || c.trial_until) > new Date();
          return (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-extrabold text-[#141210]">{c.name}</h2>
                  <Badge className={c.billing_suspended ? 'bg-rose-100 text-rose-900 ring-rose-300' : isOpen ? 'bg-emerald-100 text-emerald-900 ring-emerald-300' : 'bg-amber-100 text-amber-900 ring-amber-300'}>
                    {c.billing_suspended ? 'Suspendu' : isOpen ? 'Accès ouvert' : 'Expiré'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[#574f45]">
                  {c.billing_plan || 'Essai'} · échéance {formatDate(c.paid_until || c.trial_until)}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-[#786f63]">{c.id}</p>
              </div>
              <Button
                variant={c.billing_suspended ? 'primary' : 'dark'}
                onClick={() => { setSelected(c); setReason(''); }}
              >
                {c.billing_suspended ? 'Réactiver' : 'Suspendre'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
