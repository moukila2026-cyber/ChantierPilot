import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate } from '../lib/format.js';
import { STATUS_LABELS, STATUS_STYLES, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../lib/constants.js';
import { Alert, Badge, Button, Card, EmptyState, LoadingPage, PageHeader, StatCard } from '../components/ui.jsx';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/api/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <LoadingPage label="Chargement du tableau de bord…" />;

  const t = data.totals;

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de vos chantiers — montants en FCFA."
        actions={
          <Link to="/chantiers">
            <Button>Nouveau chantier</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Budget prévisionnel" value={formatFcfa(t.budget_total)} sub={`${t.active_projects} chantier(s) actif(s)`} />
        <StatCard label="Dépenses" value={formatFcfa(t.expenses_total)} tone="red" sub={`Soit ${t.budget_total ? Math.round((t.expenses_total / t.budget_total) * 100) : 0} % du budget`} />
        <StatCard label="Encaissements" value={formatFcfa(t.payments_total)} tone="green" sub="Déclarations documentées" />
        <StatCard label="Solde client" value={formatFcfa(t.reste_a_encaisser)} tone="amber" sub="Reste à encaisser" />
        <StatCard label="Résultat provisoire" value={formatFcfa(t.resultat_provisionnel)} tone={t.resultat_provisionnel >= 0 ? 'blue' : 'red'}
          sub="Encaissements − dépenses" />
      </div>

      <p className="mt-3 rounded-lg bg-slate-200/60 px-3 py-2 text-xs text-slate-600">
        {data.notice}
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">À traiter en priorité</h2>
        <p className="mt-1 text-xs text-slate-500">Alertes calculées sur vos saisies, pas des créances certifiées.</p>
        {data.alerts?.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{data.alerts.map((alert, i) => <li key={`${alert.project_id}-${i}`} className={`rounded-lg border p-4 ${alert.kind === 'danger' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          <Link to={`/chantiers/${alert.project_id}`} className="font-bold underline">{alert.project_name}</Link>
          <p className="mt-1 text-sm font-semibold">{alert.title}</p><p className="mt-1 text-sm text-slate-600">{alert.action}</p>
        </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">Aucune alerte détectée sur les saisies actuelles.</p>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" pad={false}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-900">Chantiers en cours</h2>
            <Link to="/chantiers" className="text-sm font-semibold text-amber-700 hover:text-amber-800">Tout voir</Link>
          </div>
          {data.projects.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucun chantier actif"
                message="Créez votre premier chantier pour commencer à suivre budget, dépenses et encaissements."
                action={<Link to="/chantiers"><Button>Créer un chantier</Button></Link>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Chantier</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="px-3 py-3 text-right">Budget</th>
                    <th className="px-3 py-3 text-right">Dépenses</th>
                    <th className="px-5 py-3 text-right">Encaissé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.projects.map((p) => {
                    const pct = p.budget > 0 ? Math.min(100, Math.round((Number(p.expenses_total) / Number(p.budget)) * 100)) : 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <Link to={`/chantiers/${p.id}`} className="font-semibold text-slate-900 hover:text-amber-700">{p.name}</Link>
                          <p className="text-xs text-slate-500">{p.client_name}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={STATUS_STYLES[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right tabular text-slate-700">{formatFcfa(p.budget)}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="tabular text-slate-700">{formatFcfa(p.expenses_total)}</div>
                          <div className="progress-track ml-auto mt-1 w-20">
                            <div className={`progress-fill ${pct >= 90 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right tabular text-emerald-700">{formatFcfa(p.payments_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card pad={false}>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-900">Dernières opérations</h2>
          </div>
          {data.recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Aucune opération enregistrée pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((r) => (
                <li key={`${r.kind}-${r.id}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {r.kind === 'depense' ? 'Dépense' : 'Encaissement'} · {r.project_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {formatDate(r.date)} · {r.kind === 'depense'
                        ? (CATEGORY_LABELS[r.label] || r.label || '—')
                        : (r.label || PAYMENT_METHOD_LABELS[r.label] || '—')}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular ${r.kind === 'depense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {r.kind === 'depense' ? '−' : '+'}{formatFcfa(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
