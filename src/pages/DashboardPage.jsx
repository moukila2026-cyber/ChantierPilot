import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate } from '../lib/format.js';
import { STATUS_LABELS, STATUS_STYLES, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../lib/constants.js';
import { ButtonLink, Alert, Badge, Button, Card, EmptyState, LoadingPage, Modal, StatCard, Toast } from '../components/ui.jsx';
import BtpVisual from '../components/BtpVisual.jsx';
import { ProjectForm } from './ProjectsPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function DashboardPage() {
  const { user, company } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);

  const load = useCallback(() => (
    api('/api/dashboard').then(setData).catch((e) => setError(e.message))
  ), []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAdmin && searchParams.get('nouveau') === '1') {
      setFields({});
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [isAdmin, searchParams, setSearchParams]);

  const handleCreateProject = async (payload) => {
    setSaving(true);
    setFields({});
    try {
      const created = await api('/api/projects', { method: 'POST', body: payload });
      setModalOpen(false);
      setToast({ type: 'success', message: 'Chantier créé avec succès.' });
      await load();
      if (created?.project?.id) {
        navigate(`/chantiers/${created.project.id}`);
      }
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <LoadingPage label="Chargement du tableau de bord…" />;

  const t = data.totals;
  const analytics = data.analytics || { by_category: [], top_suppliers: [], monthly_cashflow: [] };
  const maxMonthVal = Math.max(
    1,
    ...analytics.monthly_cashflow.flatMap((m) => [Number(m.payments || 0), Number(m.expenses || 0)]),
  );
  const firstName = (user?.full_name || '').trim().split(/\s+/)[0];
  const greeting = firstName ? `Bonjour ${firstName}` : 'Tableau de bord';

  return (
    <div>
      {/* Bandeau d’accueil personnalisé Noir Charbon & Or avec visuel chantier */}
      <section className="cp-charcoal-panel mb-6 overflow-hidden rounded-3xl p-5 shadow-lg sm:p-7">
        <div className="grid gap-5 lg:grid-cols-12 lg:items-center">
          <div className="min-w-0 lg:col-span-7">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#eab956]">
              {company?.name || 'Espace entreprise'} · Montants en FCFA
            </p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#fbf8f1] sm:text-3xl">
              {greeting}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-[#dfd9ce]">
              {t.active_projects > 0
                ? `Vue d’ensemble de vos ${t.active_projects} chantier(s) actif(s), uniquement à partir de vos saisies réelles.`
                : 'Votre espace est prêt. Créez votre premier chantier pour commencer à suivre budget, dépenses et encaissements.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {isAdmin ? (
                <Button onClick={() => { setFields({}); setModalOpen(true); }}>
                  + Nouveau chantier
                </Button>
              ) : (
                <ButtonLink to="/chantiers">Voir les chantiers</ButtonLink>
              )}
              <Link
                to="/chantiers"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#eab956]/40 bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#fbf8f1] transition hover:border-[#eab956] hover:bg-white/[0.09]"
              >
                Tous les chantiers
              </Link>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-[#eab956]/35 bg-[#12100e]">
              <BtpVisual
                kind="hero"
                eager
                alt="Suivi de chantier et contrôle de plans BTP en Côte d’Ivoire"
                className="h-36 w-full object-cover object-center sm:h-40"
              />
              <div className="flex items-center justify-between gap-2 border-t border-[#eab956]/25 px-3.5 py-2 text-xs">
                <span className="font-bold text-[#fbf8f1]">Pilotage BTP · Bureau &amp; Terrain</span>
                <span className="font-semibold text-[#eab956]">{company?.city || 'Côte d’Ivoire'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Raccourcis métier directs */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-4 sm:grid-cols-3 lg:grid-cols-5">
          <Link to="/depenses?nouveau=1" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition hover:border-[#eab956]/50 hover:bg-white/[0.09]">
            <p className="text-xs font-extrabold text-[#eab956]">+ Dépense</p>
            <p className="mt-0.5 text-[11px] text-[#cfc7b8]">Achat ou frais chantier</p>
          </Link>
          <Link to="/encaissements?nouveau=1" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition hover:border-[#eab956]/50 hover:bg-white/[0.09]">
            <p className="text-xs font-extrabold text-[#eab956]">+ Encaissement</p>
            <p className="mt-0.5 text-[11px] text-[#cfc7b8]">Règlement client référencé</p>
          </Link>
          {isAdmin && (
            <Link to="/documents?nouveau=1" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition hover:border-[#eab956]/50 hover:bg-white/[0.09]">
              <p className="text-xs font-extrabold text-[#eab956]">+ Devis / facture</p>
              <p className="mt-0.5 text-[11px] text-[#cfc7b8]">Chiffrage &amp; avancement</p>
            </Link>
          )}
          <Link to="/terrain" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition hover:border-[#eab956]/50 hover:bg-white/[0.09]">
            <p className="text-xs font-extrabold text-[#eab956]">Carnet terrain</p>
            <p className="mt-0.5 text-[11px] text-[#cfc7b8]">Journal photo &amp; présences</p>
          </Link>
          <Link to="/gestion" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 transition hover:border-[#eab956]/50 hover:bg-white/[0.09]">
            <p className="text-xs font-extrabold text-[#eab956]">Plans &amp; Gantt</p>
            <p className="mt-0.5 text-[11px] text-[#cfc7b8]">Plans annotés &amp; multi-dépôts</p>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard featured label="Budget prévisionnel" value={formatFcfa(t.budget_total)} sub={`${t.active_projects} chantier(s) actif(s)`} />
        <StatCard label="Dépenses" value={formatFcfa(t.expenses_total)} tone="red" sub={`Soit ${t.budget_total ? Math.round((t.expenses_total / t.budget_total) * 100) : 0} % du budget`} />
        <StatCard label="Encaissements" value={formatFcfa(t.payments_total)} tone="green" sub="Déclarations documentées" />
        <StatCard
          label="Solde client"
          value={formatFcfa(t.reste_a_encaisser)}
          tone="amber"
          sub={t.retention_held > 0 ? `Dont ${formatFcfa(t.retention_held)} en retenue` : 'Reste à encaisser'}
        />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Résultat provisoire" value={formatFcfa(t.resultat_provisionnel)} tone={t.resultat_provisionnel >= 0 ? 'blue' : 'red'}
            sub="Encaissements − dépenses" />
        </div>
      </div>

      <p className="mt-3 rounded-xl border border-[#e3ddd0] bg-white px-4 py-2.5 text-xs text-[#574f45]">
        {data.notice}
      </p>

      {/* Parcours d’accueil guidé sur un compte vierge */}
      {data.projects.length === 0 && (
        <section className="mt-6 rounded-2xl border border-[#eab956]/45 bg-white p-5 shadow-sm" aria-label="Guide de démarrage">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#854d0e]">Démarrage en 3 étapes</p>
              <h2 className="mt-1 text-base font-extrabold text-[#141210]">Lancez votre suivi réel sans aucune donnée fictive</h2>
            </div>
            {isAdmin && (
              <Button onClick={() => { setFields({}); setModalOpen(true); }}>
                Créer mon premier chantier
              </Button>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#e3ddd0] bg-[#faf7f0] p-4">
              <span className="inline-block rounded-lg bg-[#141210] px-2.5 py-0.5 text-xs font-extrabold text-[#eab956]">01</span>
              <h3 className="mt-2 text-sm font-bold text-[#141210]">Créer un chantier</h3>
              <p className="mt-1 text-xs leading-5 text-[#574f45]">Indiquez le nom du chantier, le client, le quartier et le budget prévisionnel en FCFA.</p>
            </div>
            <div className="rounded-xl border border-[#e3ddd0] bg-[#faf7f0] p-4">
              <span className="inline-block rounded-lg bg-[#141210] px-2.5 py-0.5 text-xs font-extrabold text-[#eab956]">02</span>
              <h3 className="mt-2 text-sm font-bold text-[#141210]">Noter dépenses &amp; avances</h3>
              <p className="mt-1 text-xs leading-5 text-[#574f45]">Enregistrez chaque achat fournisseur et chaque règlement client avec sa référence écrite.</p>
            </div>
            <div className="rounded-xl border border-[#e3ddd0] bg-[#faf7f0] p-4">
              <span className="inline-block rounded-lg bg-[#141210] px-2.5 py-0.5 text-xs font-extrabold text-[#eab956]">03</span>
              <h3 className="mt-2 text-sm font-bold text-[#141210]">Suivre le terrain &amp; exporter</h3>
              <p className="mt-1 text-xs leading-5 text-[#574f45]">Ajoutez photos, présences et réserves, puis éditez vos rapports et PV de réception PDF.</p>
            </div>
          </div>
        </section>
      )}

      {/* Centre d'alertes proactives */}
      <section className="mt-6 rounded-2xl border border-[#e3ddd0] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-[#141210]">À traiter en priorité</h2>
            <p className="mt-0.5 text-xs text-[#574f45]">
              Surveillance automatique des budgets, échéances, retenues de garantie, sous-traitants et stocks.
            </p>
          </div>
          {data.alerts?.length > 0 && (
            <Badge className="bg-amber-100 text-amber-900 ring-amber-300">
              {data.alerts.length} point(s) d’attention
            </Badge>
          )}
        </div>
        {data.alerts?.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.alerts.map((alert, i) => {
              const target = alert.href || (alert.project_id ? `/chantiers/${alert.project_id}` : '/chantiers');
              return (
                <li key={`${alert.project_id || alert.title}-${i}`} className={`rounded-xl border p-4 ${alert.kind === 'danger' ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'}`}>
                  <Link to={target} className="font-bold text-[#141210] underline">{alert.project_name}</Link>
                  <p className="mt-1 text-sm font-semibold text-[#141210]">{alert.title}</p>
                  <p className="mt-1 text-sm text-[#574f45]">{alert.action}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#574f45]">Aucune alerte détectée sur les saisies actuelles.</p>
        )}
      </section>

      {/* Pilotage analytique : flux 6 mois, postes de coûts & top fournisseurs */}
      {(t.expenses_total > 0 || t.payments_total > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card>
            <h2 className="font-extrabold text-[#141210]">Trésorerie mensuelle (6 mois)</h2>
            <p className="mt-0.5 text-xs text-[#574f45]">Encaissements reçus vs dépenses engagées</p>
            <div className="mt-4 space-y-3">
              {analytics.monthly_cashflow.map((m) => (
                <div key={m.month} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-semibold text-[#141210]">
                    <span>{m.month}</span>
                    <span className={`tabular ${m.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {m.net >= 0 ? '+' : ''}{formatFcfa(m.net)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#faf7f0]">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.round((Number(m.payments || 0) / maxMonthVal) * 100)}%` }}
                        title={`Encaissements : ${formatFcfa(m.payments)}`}
                      />
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#faf7f0]">
                      <div
                        className="h-full rounded-full bg-rose-600"
                        style={{ width: `${Math.round((Number(m.expenses || 0) / maxMonthVal) * 100)}%` }}
                        title={`Dépenses : ${formatFcfa(m.expenses)}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-2 text-[11px] font-semibold text-[#574f45]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Encaissements</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-600" /> Dépenses</span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-extrabold text-[#141210]">Dépenses par poste BTP</h2>
            <p className="mt-0.5 text-xs text-[#574f45]">Répartition sur les chantiers actifs</p>
            {analytics.by_category.length === 0 ? (
              <p className="mt-6 text-sm text-[#574f45]">Aucune dépense enregistrée.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {analytics.by_category.map((c) => {
                  const share = t.expenses_total > 0 ? Math.round((c.amount / t.expenses_total) * 100) : 0;
                  return (
                    <li key={c.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#141210]">{c.label}</span>
                        <span className="font-semibold tabular text-[#574f45]">{formatFcfa(c.amount)} ({share} %)</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill bg-[#d4941e]" style={{ width: `${Math.max(3, share)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-extrabold text-[#141210]">Principaux fournisseurs</h2>
            <p className="mt-0.5 text-xs text-[#574f45]">Volume d’achats cumulé en FCFA</p>
            {analytics.top_suppliers.length === 0 ? (
              <p className="mt-6 text-sm text-[#574f45]">Renseignez le nom du fournisseur lors de vos saisies d’achats.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[#eee8db]">
                {analytics.top_suppliers.map((s) => (
                  <li key={s.supplier} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[#141210]">{s.supplier}</p>
                      <p className="text-xs text-[#574f45]">{s.count} achat(s)</p>
                    </div>
                    <span className="shrink-0 font-bold tabular text-[#141210]">{formatFcfa(s.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" pad={false}>
          <div className="flex items-center justify-between border-b border-[#eee8db] px-5 py-4">
            <h2 className="font-extrabold text-[#141210]">Chantiers en cours</h2>
            <Link to="/chantiers" className="text-sm font-bold text-[#854d0e] hover:text-[#141210]">Tout voir →</Link>
          </div>
          {data.projects.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucun chantier actif"
                message="Créez votre premier chantier pour commencer à suivre budget, dépenses et encaissements."
                action={isAdmin
                  ? <Button onClick={() => { setFields({}); setModalOpen(true); }}>+ Nouveau chantier</Button>
                  : <ButtonLink to="/chantiers">Voir les chantiers</ButtonLink>}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#141210] text-left text-xs font-bold uppercase tracking-wide text-[#eab956]">
                    <th className="px-5 py-3">Chantier</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="px-3 py-3 text-right">Budget</th>
                    <th className="px-3 py-3 text-right">Dépenses</th>
                    <th className="px-5 py-3 text-right">Encaissé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee8db]">
                  {data.projects.map((p) => {
                    const pct = p.budget > 0 ? Math.min(100, Math.round((Number(p.expenses_total) / Number(p.budget)) * 100)) : 0;
                    return (
                      <tr key={p.id} className="hover:bg-[#faf7f0]">
                        <td className="px-5 py-3">
                          <Link to={`/chantiers/${p.id}`} className="font-bold text-[#141210] hover:text-[#854d0e]">{p.name}</Link>
                          <p className="text-xs text-[#574f45]">{p.client_name}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={STATUS_STYLES[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular text-[#141210]">{formatFcfa(p.budget)}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="font-semibold tabular text-[#141210]">{formatFcfa(p.expenses_total)}</div>
                          <div className="progress-track ml-auto mt-1 w-20">
                            <div className={`progress-fill ${pct >= 90 ? 'bg-rose-600' : 'bg-[#d4941e]'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular text-emerald-700">{formatFcfa(p.payments_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card pad={false}>
          <div className="border-b border-[#eee8db] px-5 py-4">
            <h2 className="font-extrabold text-[#141210]">Dernières opérations</h2>
          </div>
          {data.recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#574f45]">Aucune opération enregistrée pour le moment.</p>
          ) : (
            <ul className="divide-y divide-[#eee8db]">
              {data.recent.map((r) => (
                <li key={`${r.kind}-${r.id}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#141210]">
                      {r.kind === 'depense' ? 'Dépense' : 'Encaissement'} · {r.project_name}
                    </p>
                    <p className="truncate text-xs text-[#574f45]">
                      {formatDate(r.date)} · {r.kind === 'depense'
                        ? (CATEGORY_LABELS[r.label] || r.label || '—')
                        : (r.label || PAYMENT_METHOD_LABELS[r.label] || '—')}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold tabular ${r.kind === 'depense' ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {r.kind === 'depense' ? '−' : '+'}{formatFcfa(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        title="Nouveau chantier"
        onClose={() => !saving && setModalOpen(false)}
      >
        <ProjectForm
          onSubmit={handleCreateProject}
          onCancel={() => setModalOpen(false)}
          busy={saving}
          fields={fields}
        />
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
