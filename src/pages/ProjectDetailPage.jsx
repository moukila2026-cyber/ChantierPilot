import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate, formatDateLong, todayIso } from '../lib/format.js';
import {
  CATEGORIES, CATEGORY_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  STATUS_LABELS, STATUS_STYLES,
} from '../lib/constants.js';
import { ExpenseForm, PaymentForm } from '../components/forms.jsx';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, LoadingPage,
  Modal, StatCard, Toast,
} from '../components/ui.jsx';
import { ProjectForm } from './ProjectsPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('historique');
  const [modal, setModal] = useState(null); // 'expense' | 'payment' | 'edit'
  const [editExpense, setEditExpense] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/projects/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <Alert type="error">{error}</Alert>
        <Link to="/chantiers"><Button variant="secondary">← Retour aux chantiers</Button></Link>
      </div>
    );
  }
  if (!data) return <LoadingPage label="Chargement du chantier…" />;

  const { project, totals, expenses, payments, timeline, labels } = data;
  const isArchived = project.status === 'archive';
  const pct = totals.budget > 0 ? Math.min(100, Math.round((totals.expenses_total / totals.budget) * 100)) : 0;

  const submitExpense = async (payload) => {
    setBusy(true); setFields({});
    try {
      const body = {
        project_id: project.id,
        category: payload.category,
        amount: payload.amount,
        expense_date: payload.expense_date,
        supplier: payload.supplier,
        description: payload.description,
        receipt: payload.receipt,
      };
      if (editExpense) {
        await api(`/api/expenses/${editExpense.id}`, { method: 'PATCH', body });
        setToast({ type: 'success', message: 'Dépense mise à jour.' });
      } else {
        await api('/api/expenses', { method: 'POST', body });
        setToast({ type: 'success', message: 'Dépense enregistrée.' });
      }
      setModal(null); setEditExpense(null); load();
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async (payload) => {
    setBusy(true); setFields({});
    try {
      const body = {
        project_id: project.id,
        client_name: payload.client_name,
        amount: payload.amount,
        payment_date: payload.payment_date,
        reference: payload.reference,
        payment_method: payload.payment_method,
        memo: payload.memo,
        proof: payload.proof,
      };
      if (editPayment) {
        await api(`/api/payments/${editPayment.id}`, { method: 'PATCH', body });
        setToast({ type: 'success', message: 'Encaissement mis à jour.' });
      } else {
        await api('/api/payments', { method: 'POST', body });
        setToast({ type: 'success', message: 'Encaissement enregistré (déclaration documentée).' });
      }
      setModal(null); setEditPayment(null); load();
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (payload) => {
    setBusy(true); setFields({});
    try {
      await api(`/api/projects/${project.id}`, { method: 'PATCH', body: payload });
      setToast({ type: 'success', message: 'Chantier mis à jour.' });
      setModal(null); load();
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(confirm.url, { method: 'DELETE' });
      setToast({ type: 'success', message: confirm.doneMessage });
      setConfirm(null); load();
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2">
        <Link to="/chantiers" className="text-sm font-medium text-slate-500 hover:text-amber-700">← Tous les chantiers</Link>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{project.name}</h1>
            <Badge className={STATUS_STYLES[project.status]}>{STATUS_LABELS[project.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {project.client_name} · {project.location || 'Localisation non renseignée'} · du {formatDateLong(project.start_date)}
            {project.end_date ? ` au ${formatDateLong(project.end_date)}` : ' (fin non définie)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/terrain?chantier=${project.id}`}><Button variant="secondary">Carnet terrain</Button></Link>
          {isAdmin && (<>
          <a href={`/api/projects/${project.id}/report`} download>
            <Button variant="secondary">Rapport PDF</Button>
          </a>
          <Button variant="secondary" onClick={() => { setFields({}); setModal('edit'); }}>Modifier</Button>
          </>)}
          {!isArchived && (
            <Button onClick={() => { setFields({}); setEditExpense(null); setModal('expense'); }}>+ Dépense</Button>
          )}
          {!isArchived && (
            <Button variant="secondary" onClick={() => { setFields({}); setEditPayment(null); setModal('payment'); }}>+ Encaissement</Button>
          )}
        </div>
      </div>

      {isArchived && (
        <div className="mb-5">
          <Alert type="warning">
            Ce chantier est archivé : les opérations sont visibles mais verrouillées.
            Modifiez son statut pour le rouvrir.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard featured label="Budget prévisionnel" value={formatFcfa(totals.budget)} />
        <StatCard label="Dépenses" value={formatFcfa(totals.expenses_total)} tone="red" sub={`${pct} % du budget`} />
        <StatCard label="Encaissements" value={formatFcfa(totals.payments_total)} tone="green" sub="Déclarations documentées" />
        <StatCard label="Solde client" value={formatFcfa(totals.reste_a_encaisser)} tone="amber" sub="Reste à encaisser" />
        <StatCard label="Résultat provisoire" value={formatFcfa(totals.resultat_provisionnel)}
          tone={totals.resultat_provisionnel >= 0 ? 'blue' : 'red'} sub="Encaissements − dépenses" />
      </div>

      {isAdmin && data.commercial && <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Contrat, facturation & coûts engagés</h2><Link to="/documents" className="text-sm font-semibold text-amber-700">Devis & factures →</Link></div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div><p className="text-xs text-slate-500">Devis accepté (taxes incluses)</p><p className="mt-1 font-bold">{data.commercial.contract_total ? formatFcfa(data.commercial.contract_total) : 'Non renseigné'}</p></div>
          <div><p className="text-xs text-slate-500">Facturé net des avoirs</p><p className="mt-1 font-bold">{formatFcfa(data.commercial.billed)}</p></div>
          <div><p className="text-xs text-slate-500">Solde des factures (règlements affectés)</p><p className="mt-1 font-bold">{formatFcfa(Number(data.commercial.billed)-Number(data.commercial.allocated_payments))}</p></div>
          <div><p className="text-xs text-slate-500">Achats approuvés non réceptionnés</p><p className="mt-1 font-bold">{formatFcfa(data.commercial.committed_purchases)}</p></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Coût prévisionnel saisi au devis : {formatFcfa(data.commercial.estimated_cost || 0)} · Main-d’œuvre en attente de validation : {formatFcfa(data.commercial.pending_labor)} · {data.commercial.open_reserves} réserve(s) non validée(s). Ces indicateurs ne sont pas une marge comptable ; les règlements non affectés ne soldent pas automatiquement une facture.</p>
      </Card>}

      <Card className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Consommation du budget</span>
          <span className="tabular">{formatFcfa(totals.expenses_total)} / {formatFcfa(totals.budget)}</span>
        </div>
        <div className="progress-track mt-2">
          <div className={`progress-fill ${pct >= 100 ? 'bg-rose-500' : pct >= 90 ? 'bg-orange-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {/* Onglets */}
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-[#e3ddd0] bg-[#eae4d7] p-1" role="tablist">
        {[
          ['historique', 'Historique'],
          ['depenses', `Dépenses (${expenses.length})`],
          ['encaissements', `Encaissements (${payments.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === key ? 'bg-[#141210] text-[#eab956] shadow-sm' : 'text-[#3f3932] hover:text-[#141210]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'historique' && (
          timeline.length === 0 ? (
            <EmptyState title="Historique vide" message="Les dépenses, encaissements et événements du chantier apparaîtront ici, du plus récent au plus ancien." />
          ) : (
            <Card pad={false}>
              <ul className="divide-y divide-slate-100">
                {timeline.map((ev) => (
                  <li key={`${ev.kind}-${ev.id}`} className="flex items-start gap-3 px-5 py-3.5">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      ev.kind === 'depense' ? 'bg-rose-500' : ev.kind === 'encaissement' ? 'bg-emerald-500' : 'bg-slate-400'
                    }`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">
                        <span className="font-semibold">
                          {ev.kind === 'depense' ? 'Dépense' : ev.kind === 'encaissement' ? 'Encaissement déclaré' : 'Événement'}
                        </span>
                        {' — '}
                        {ev.kind === 'depense'
                          ? [ev.detail, ev.label].filter(Boolean).join(' : ') || 'Dépense'
                          : ev.kind === 'encaissement'
                            ? `${ev.detail || ''} · réf. ${ev.reference || '—'}${ev.label ? ` · ${ev.label}` : ''}`
                            : (ev.label || '')}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(ev.date)}{ev.actor ? ` · par ${ev.actor}` : ''}
                      </p>
                    </div>
                    {ev.amount !== null && ev.amount !== undefined && (
                      <span className={`shrink-0 text-sm font-semibold tabular ${ev.kind === 'depense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {ev.kind === 'depense' ? '−' : '+'}{formatFcfa(ev.amount)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )
        )}

        {tab === 'depenses' && (
          expenses.length === 0 ? (
            <EmptyState
              title="Aucune dépense"
              message="Enregistrez vos achats et frais pour suivre la consommation du budget."
              action={!isArchived ? <Button onClick={() => { setEditExpense(null); setFields({}); setModal('expense'); }}>+ Ajouter une dépense</Button> : null}
            />
          ) : (
            <Card pad={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-3 py-3">Catégorie</th>
                      <th className="px-3 py-3">Fournisseur / description</th>
                      <th className="px-3 py-3 text-right">Montant</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(e.expense_date)}</td>
                        <td className="px-3 py-3">{labels.category[e.category] || e.category}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800">{e.supplier || '—'}</p>
                          <p className="text-xs text-slate-500">{e.description}</p>
                          {e.has_receipt && (
                            <a className="text-xs font-medium text-amber-700 hover:underline" href={`/api/files?kind=expense&id=${e.id}`} target="_blank" rel="noreferrer">
                              📎 Justificatif ({e.receipt_filename || 'pièce jointe'})
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular text-rose-700">{formatFcfa(e.amount)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs"
                              onClick={() => {
                                setEditExpense({ ...e, amount: String(e.amount), expense_date: e.expense_date?.slice(0, 10), receipt: null });
                                setFields({}); setModal('expense');
                              }}>
                              Modifier
                            </Button>
                            {isAdmin && (<Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                              onClick={() => setConfirm({
                                url: `/api/expenses/${e.id}`,
                                title: 'Supprimer cette dépense ?',
                                message: `La dépense de ${formatFcfa(e.amount)} sera supprimée définitivement de l'historique.`,
                                doneMessage: 'Dépense supprimée.',
                              })}>
                              Supprimer
                            </Button>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        )}

        {tab === 'encaissements' && (
          payments.length === 0 ? (
            <EmptyState
              title="Aucun encaissement"
              message="Enregistrez les paiements clients avec leur référence. Un encaissement n'est considéré comme prouvé que si un justificatif est joint."
              action={!isArchived ? <Button onClick={() => { setEditPayment(null); setFields({}); setModal('payment'); }}>+ Ajouter un encaissement</Button> : null}
            />
          ) : (
            <Card pad={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-3 py-3">Client</th>
                      <th className="px-3 py-3">Référence / mode</th>
                      <th className="px-3 py-3 text-right">Montant</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(p.payment_date)}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800">{p.client_name}</p>
                          {p.memo && <p className="text-xs text-slate-500">{p.memo}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800">{p.reference}</p>
                          <p className="text-xs text-slate-500">{labels.payment_method[p.payment_method] || p.payment_method}</p>
                          <Badge className={p.has_proof ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>
                            {p.has_proof ? 'Justificatif joint' : 'Déclaration (référence)'}
                          </Badge>
                          {p.has_proof && (
                            <a className="ml-1 text-xs font-medium text-amber-700 hover:underline" href={`/api/files?kind=proof&id=${p.id}`} target="_blank" rel="noreferrer">
                              📎 voir
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular text-emerald-700">{formatFcfa(p.amount)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs"
                              onClick={() => {
                                setEditPayment({ ...p, amount: String(p.amount), payment_date: p.payment_date?.slice(0, 10), proof: null });
                                setFields({}); setModal('payment');
                              }}>
                              Modifier
                            </Button>
                            {isAdmin && (<Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                              onClick={() => setConfirm({
                                url: `/api/payments/${p.id}`,
                                title: 'Supprimer cet encaissement ?',
                                message: `L'encaissement de ${formatFcfa(p.amount)} (réf. ${p.reference}) sera supprimé définitivement.`,
                                doneMessage: 'Encaissement supprimé.',
                              })}>
                              Supprimer
                            </Button>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        )}
      </div>

      {/* Modales */}
      <Modal open={modal === 'expense'} title={editExpense ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={() => { setModal(null); setEditExpense(null); }}>
        <ExpenseForm
          projects={[project]} defaultProjectId={project.id} initial={editExpense}
          fields={fields} busy={busy} onSubmit={submitExpense}
          onCancel={() => { setModal(null); setEditExpense(null); }}
        />
      </Modal>

      <Modal open={modal === 'payment'} title={editPayment ? 'Modifier l\'encaissement' : 'Nouvel encaissement'} onClose={() => { setModal(null); setEditPayment(null); }}>
        <PaymentForm
          projects={[project]} defaultProjectId={project.id} defaultClient={project.client_name}
          initial={editPayment} fields={fields} busy={busy} onSubmit={submitPayment}
          onCancel={() => { setModal(null); setEditPayment(null); }}
        />
      </Modal>

      <Modal open={modal === 'edit'} title={`Modifier « ${project.name} »`} onClose={() => setModal(null)}>
        <ProjectForm
          initial={{
            name: project.name, client_name: project.client_name, location: project.location || '',
            budget: String(project.budget), start_date: project.start_date?.slice(0, 10),
            end_date: project.end_date?.slice(0, 10) || '',
            status: project.status, notes: project.notes || '',
          }}
          fields={fields} busy={busy} onSubmit={submitEdit} onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
