import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate, formatDateLong, todayIso } from '../lib/format.js';
import { STATUS_LABELS, STATUS_STYLES } from '../lib/constants.js';
import { ExpenseForm, PaymentForm, FileField } from '../components/forms.jsx';
import { AttachmentPreviewModal } from '../components/AttachmentPreviewModal.jsx';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, LoadingPage,
  Modal, Select, StatCard, Textarea, Toast,
} from '../components/ui.jsx';
import { ProjectForm } from './ProjectsPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  buildProjectSummaryText, buildSubcontractSummaryText, whatsappHref,
} from '../lib/whatsapp.js';

function SubcontractForm({ initial, busy, fields, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({
    subcontractor_name: initial?.subcontractor_name || '',
    trade_lot: initial?.trade_lot || '',
    phone: initial?.phone || '',
    agreed_amount: initial ? String(initial.agreed_amount) : '',
    progress: initial ? String(initial.progress ?? 0) : '0',
    status: initial?.status || 'actif',
    notes: initial?.notes || '',
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        ...form,
        agreed_amount: form.agreed_amount === '' ? 0 : Number(form.agreed_amount),
        progress: Number(form.progress) || 0,
      });
    }} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sous-traitant / tâcheron" htmlFor="st-name" error={fields?.subcontractor_name} required>
          <Input id="st-name" value={form.subcontractor_name} onChange={(e) => set('subcontractor_name', e.target.value)}
            placeholder="Ex. Entreprise Koné Plomberie" error={fields?.subcontractor_name} />
        </Field>
        <Field label="Lot BTP / corps d’état" htmlFor="st-lot" error={fields?.trade_lot} required>
          <Input id="st-lot" value={form.trade_lot} onChange={(e) => set('trade_lot', e.target.value)}
            placeholder="Ex. Plomberie sanitaire, Électricité, Carrelage…" error={fields?.trade_lot} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Téléphone (WhatsApp)" htmlFor="st-phone" error={fields?.phone}>
          <Input id="st-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+225 07 00 00 00 00" />
        </Field>
        <Field label="Forfait convenu (FCFA)" htmlFor="st-amt" error={fields?.agreed_amount} required>
          <Input id="st-amt" inputMode="numeric" pattern="[0-9]*" value={form.agreed_amount}
            onChange={(e) => set('agreed_amount', e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Ex. 3500000" error={fields?.agreed_amount} />
        </Field>
        <Field label={`Avancement constaté : ${form.progress} %`} htmlFor="st-prog" error={fields?.progress}>
          <Input id="st-prog" type="number" min={0} max={100} value={form.progress}
            onChange={(e) => set('progress', e.target.value)} />
        </Field>
      </div>
      {initial && (
        <Field label="Statut du contrat" htmlFor="st-status">
          <Select id="st-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="actif">Actif</option>
            <option value="suspendu">En pause</option>
            <option value="termine">Terminé / réceptionné</option>
          </Select>
        </Field>
      )}
      <Field label="Observations" htmlFor="st-notes">
        <Textarea id="st-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Conditions, retenue, délais…" />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>{initial ? 'Enregistrer' : 'Ajouter le contrat'}</Button>
      </div>
    </form>
  );
}

function SubcontractPayModal({ target, busy, onSubmit, onCancel }) {
  const [amount, setAmount] = useState(target?.remaining_amount ? String(target.remaining_amount) : '');
  const [payDate, setPayDate] = useState(todayIso());
  const [desc, setDesc] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [fileErr, setFileErr] = useState(null);

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({
        id: target.id,
        pay_amount: Number(amount) || 0,
        pay_date: payDate,
        pay_description: desc,
        receipt,
      });
    }}>
      <p className="rounded-xl border border-[#e3ddd0] bg-[#faf7f0] p-3 text-xs text-[#574f45]">
        Lot <strong>{target.trade_lot}</strong> ({target.subcontractor_name}) · Forfait {formatFcfa(target.agreed_amount)} · Déjà réglé {formatFcfa(target.paid_amount)} · Reste {formatFcfa(target.remaining_amount)}.
        <br />Ce versement sera automatiquement ajouté aux dépenses du chantier en catégorie <strong>Sous-traitance</strong>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Montant versé (FCFA)" htmlFor="sp-amt" required>
          <Input id="sp-amt" required inputMode="numeric" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
        </Field>
        <Field label="Date de règlement" htmlFor="sp-date" required>
          <Input id="sp-date" type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Libellé / situation" htmlFor="sp-desc">
        <Input id="sp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex. Acompte démarrage lot plomberie (30 %)" />
      </Field>
      <FileField
        label="Reçu / décharge signée (facultatif)"
        value={receipt}
        error={fileErr}
        onChange={(att, err) => { setFileErr(err || null); setReceipt(att); }}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>Enregistrer le versement</Button>
      </div>
    </form>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user, company } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('historique');
  const [modal, setModal] = useState(null); // 'expense' | 'payment' | 'edit' | 'subcontract' | 'subpay'
  const [editExpense, setEditExpense] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [preview, setPreview] = useState(null);
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
  const subcontracts = data.subcontracts || [];
  const analytics = data.analytics || { by_category: [], top_suppliers: [] };
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

  const toggleRetentionRelease = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: { retention_released: !project.retention_released },
      });
      setToast({
        type: 'success',
        message: project.retention_released ? 'Retenue replacée en attente de mainlevée.' : 'Mainlevée de la retenue de garantie enregistrée.',
      });
      load();
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const submitSubcontract = async (payload) => {
    setBusy(true); setFields({});
    try {
      if (editSub?.id) {
        await api('/api/subcontracts', { method: 'PATCH', body: { id: editSub.id, ...payload } });
        setToast({ type: 'success', message: 'Contrat sous-traitant mis à jour.' });
      } else {
        await api('/api/subcontracts', { method: 'POST', body: { project_id: project.id, ...payload } });
        setToast({ type: 'success', message: 'Sous-traitant ajouté au chantier.' });
      }
      setModal(null); setEditSub(null); load();
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const submitSubPay = async (payload) => {
    setBusy(true);
    try {
      await api('/api/subcontracts', { method: 'PATCH', body: payload });
      setToast({ type: 'success', message: 'Acompte sous-traitant enregistré dans les dépenses du chantier.' });
      setModal(null); setEditSub(null); load();
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildProjectSummaryText(project, totals, company?.name));
      setToast({ type: 'success', message: 'Point financier copié dans le presse-papiers.' });
    } catch {
      setToast({ type: 'error', message: 'Copie automatique non disponible sur ce navigateur.' });
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

  const summaryText = buildProjectSummaryText(project, totals, company?.name);
  const subTotals = subcontracts.reduce(
    (acc, s) => ({ agreed: acc.agreed + Number(s.agreed_amount), paid: acc.paid + Number(s.paid_amount) }),
    { agreed: 0, paid: 0 },
  );

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
            {project.client_name}
            {project.client_phone ? ` (${project.client_phone})` : ''}
            {' · '}{project.location || 'Localisation non renseignée'} · du {formatDateLong(project.start_date)}
            {project.end_date ? ` au ${formatDateLong(project.end_date)}` : ' (fin non définie)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/terrain?chantier=${project.id}`}><Button variant="secondary">Carnet terrain</Button></Link>
          {isAdmin && (
            <>
              <a href={`/api/projects/${project.id}/report`} download>
                <Button variant="secondary">Rapport PDF</Button>
              </a>
              <a href={`/api/projects/${project.id}/reception`} download>
                <Button variant="secondary">PV réception PDF</Button>
              </a>
              <a
                href={whatsappHref(project.client_phone, summaryText)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
              >
                WhatsApp client
              </a>
              <Button variant="secondary" onClick={copySummary}>Copier le point</Button>
              <Button variant="secondary" onClick={() => { setFields({}); setModal('edit'); }}>Modifier</Button>
            </>
          )}
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

      {/* Suivi de la retenue de garantie BTP */}
      {Number(project.retention_bps) > 0 && (
        <Card className="mt-4 border-amber-300 bg-[#fdf8ec]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-[#141210]">
                  Retenue de garantie contractuelle ({project.retention_bps / 100} %)
                </h2>
                <Badge className={project.retention_released ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-amber-100 text-amber-900 ring-amber-300'}>
                  {project.retention_released ? 'Mainlevée accordée' : 'Retenue active'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[#574f45]">
                Montant garanti : <strong>{formatFcfa(totals.retention_amount)}</strong>
                {project.retention_release_date ? ` · Date prévue de mainlevée : ${formatDate(project.retention_release_date)}` : ''}
                {' · '}Disponible net encaissable hors retenue : <strong>{formatFcfa(totals.collectible_remaining)}</strong>
              </p>
            </div>
            {isAdmin && (
              <Button variant="secondary" disabled={busy} onClick={toggleRetentionRelease}>
                {project.retention_released ? 'Remettre en retenue' : 'Marquer la mainlevée'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {isAdmin && data.commercial && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">Contrat, facturation &amp; coûts engagés</h2>
            <Link to="/documents" className="text-sm font-semibold text-amber-700">Devis &amp; factures →</Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div><p className="text-xs text-slate-500">Devis accepté (taxes incluses)</p><p className="mt-1 font-bold">{data.commercial.contract_total ? formatFcfa(data.commercial.contract_total) : 'Non renseigné'}</p></div>
            <div><p className="text-xs text-slate-500">Facturé net des avoirs</p><p className="mt-1 font-bold">{formatFcfa(data.commercial.billed)}</p></div>
            <div><p className="text-xs text-slate-500">Solde des factures (règlements affectés)</p><p className="mt-1 font-bold">{formatFcfa(Number(data.commercial.billed) - Number(data.commercial.allocated_payments))}</p></div>
            <div><p className="text-xs text-slate-500">Achats approuvés non réceptionnés</p><p className="mt-1 font-bold">{formatFcfa(data.commercial.committed_purchases)}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Coût prévisionnel saisi au devis : {formatFcfa(data.commercial.estimated_cost || 0)} · Main-d’œuvre en attente de validation : {formatFcfa(data.commercial.pending_labor)} · {data.commercial.open_reserves} réserve(s) non validée(s). Ces indicateurs ne sont pas une marge comptable ; les règlements non affectés ne soldent pas automatiquement une facture.
          </p>
        </Card>
      )}

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
          ['soustraitants', `Sous-traitants (${subcontracts.length})`],
          ['analyse', 'Analyse des coûts'],
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
                            <div className="mt-1 flex items-center gap-3 text-xs font-semibold text-amber-800">
                              <button
                                type="button"
                                className="underline hover:text-slate-900"
                                onClick={() => setPreview({
                                  url: `/api/files?kind=expense&id=${e.id}`,
                                  filename: e.receipt_filename,
                                  mime: e.receipt_mime,
                                  title: `${e.supplier || 'Dépense'} — ${formatFcfa(e.amount)}`,
                                })}
                              >
                                👁 Aperçu ({e.receipt_filename || 'justificatif'})
                              </button>
                              <a className="hover:underline" href={`/api/files?kind=expense&id=${e.id}`} target="_blank" rel="noreferrer">
                                Télécharger
                              </a>
                            </div>
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
                            {isAdmin && (
                              <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                                onClick={() => setConfirm({
                                  url: `/api/expenses/${e.id}`,
                                  title: 'Supprimer cette dépense ?',
                                  message: `La dépense de ${formatFcfa(e.amount)} sera supprimée définitivement de l’historique.`,
                                  doneMessage: 'Dépense supprimée.',
                                })}>
                                Supprimer
                              </Button>
                            )}
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
              message="Enregistrez les paiements clients avec leur référence. Un encaissement n’est considéré comme prouvé que si un justificatif est joint."
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
                            <button
                              type="button"
                              className="ml-2 text-xs font-semibold text-amber-800 underline"
                              onClick={() => setPreview({
                                url: `/api/files?kind=proof&id=${p.id}`,
                                filename: p.proof_filename,
                                mime: p.proof_mime,
                                title: `${p.client_name} — ${formatFcfa(p.amount)}`,
                              })}
                            >
                              👁 aperçu
                            </button>
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
                            {isAdmin && (
                              <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                                onClick={() => setConfirm({
                                  url: `/api/payments/${p.id}`,
                                  title: 'Supprimer cet encaissement ?',
                                  message: `L’encaissement de ${formatFcfa(p.amount)} (réf. ${p.reference}) sera supprimé définitivement.`,
                                  doneMessage: 'Encaissement supprimé.',
                                })}>
                                Supprimer
                              </Button>
                            )}
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

        {/* Onglet Sous-traitants / Tâcherons */}
        {tab === 'soustraitants' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="Forfaits sous-traités" value={formatFcfa(subTotals.agreed)} />
                <StatCard label="Acomptes réglés" value={formatFcfa(subTotals.paid)} tone="red" />
                <StatCard label="Solde restant à payer" value={formatFcfa(Math.max(0, subTotals.agreed - subTotals.paid))} tone="amber" />
              </div>
              {!isArchived && (
                <Button onClick={() => { setEditSub(null); setFields({}); setModal('subcontract'); }}>
                  + Sous-traitant / tâcheron
                </Button>
              )}
            </div>

            {subcontracts.length === 0 ? (
              <EmptyState
                title="Aucun contrat de sous-traitance sur ce chantier"
                message="Suivez chaque tâcheron ou entreprise sous-traitante (forfait convenu, avancement réel du lot et acomptes versés) afin d’éviter toute avance excessive."
                action={!isArchived ? <Button onClick={() => { setEditSub(null); setFields({}); setModal('subcontract'); }}>+ Ajouter un sous-traitant</Button> : null}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {subcontracts.map((s) => (
                  <Card key={s.id} className={s.overpaid_alert ? 'border-rose-300' : ''}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wide text-amber-800">{s.trade_lot}</p>
                        <h3 className="mt-0.5 text-base font-bold text-[#141210]">{s.subcontractor_name}</h3>
                        {s.phone && <p className="text-xs text-[#574f45]">{s.phone}</p>}
                      </div>
                      {s.overpaid_alert ? (
                        <Badge className="bg-rose-100 text-rose-800 ring-rose-300">
                          Avance &gt; avancement
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                          Avancement {s.progress} %
                        </Badge>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#eee8db] pt-3 text-xs">
                      <div>
                        <span className="text-[#574f45]">Forfait</span>
                        <p className="mt-0.5 font-bold tabular text-[#141210]">{formatFcfa(s.agreed_amount)}</p>
                      </div>
                      <div>
                        <span className="text-[#574f45]">Versé ({s.paid_pct} %)</span>
                        <p className="mt-0.5 font-bold tabular text-rose-700">{formatFcfa(s.paid_amount)}</p>
                      </div>
                      <div>
                        <span className="text-[#574f45]">Reste à payer</span>
                        <p className="mt-0.5 font-bold tabular text-emerald-800">{formatFcfa(s.remaining_amount)}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-[#574f45]">
                        <span>Avancement réel du lot</span>
                        <strong className="tabular text-[#141210]">{s.progress} %</strong>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill bg-emerald-600" style={{ width: `${s.progress}%` }} />
                      </div>
                      <div className="flex justify-between text-[#574f45]">
                        <span>Part financière déjà réglée</span>
                        <strong className={`tabular ${s.overpaid_alert ? 'text-rose-700' : 'text-[#141210]'}`}>{s.paid_pct} %</strong>
                      </div>
                      <div className="progress-track">
                        <div className={`progress-fill ${s.overpaid_alert ? 'bg-rose-600' : 'bg-[#d4941e]'}`} style={{ width: `${Math.min(100, s.paid_pct)}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {!isArchived && s.remaining_amount > 0 && (
                        <Button className="min-h-9 px-3 py-1 text-xs" onClick={() => { setEditSub(s); setModal('subpay'); }}>
                          + Verser un acompte
                        </Button>
                      )}
                      <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => { setEditSub(s); setFields({}); setModal('subcontract'); }}>
                        Modifier / %
                      </Button>
                      <a
                        href={whatsappHref(s.phone, buildSubcontractSummaryText(s, project.name))}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                      >
                        WhatsApp
                      </a>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                          onClick={() => setConfirm({
                            url: `/api/subcontracts?id=${s.id}`,
                            title: 'Supprimer ce contrat sous-traitant ?',
                            message: `Le contrat de « ${s.subcontractor_name} » sera retiré (les dépenses déjà comptabilisées restent conservées).`,
                            doneMessage: 'Contrat sous-traitant supprimé.',
                          })}
                        >
                          Supprimer
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Onglet Analyse des coûts par poste BTP & fournisseurs */}
        {tab === 'analyse' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="font-bold text-[#141210]">Répartition des dépenses par poste BTP</h2>
              <p className="mt-0.5 text-xs text-[#574f45]">Part de chaque corps de dépense sur le total engagé ({formatFcfa(totals.expenses_total)})</p>
              {analytics.by_category.length === 0 ? (
                <p className="mt-6 text-sm text-[#574f45]">Aucune dépense enregistrée sur ce chantier.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {analytics.by_category.map((c) => {
                    const share = totals.expenses_total > 0 ? Math.round((c.amount / totals.expenses_total) * 100) : 0;
                    return (
                      <li key={c.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#141210]">{c.label} ({c.count})</span>
                          <span className="font-semibold tabular text-[#574f45]">{formatFcfa(c.amount)} · {share} %</span>
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
              <h2 className="font-bold text-[#141210]">Principaux fournisseurs &amp; prestataires du chantier</h2>
              <p className="mt-0.5 text-xs text-[#574f45]">Cumul des dépenses rattachées à chaque fournisseur</p>
              {analytics.top_suppliers.length === 0 ? (
                <p className="mt-6 text-sm text-[#574f45]">Renseignez le champ fournisseur lors de l’ajout de vos dépenses.</p>
              ) : (
                <ul className="mt-4 divide-y divide-[#eee8db]">
                  {analytics.top_suppliers.map((s) => (
                    <li key={s.supplier} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#141210]">{s.supplier}</p>
                        <p className="text-xs text-[#574f45]">{s.count} opération(s)</p>
                      </div>
                      <span className="shrink-0 font-bold tabular text-[#141210]">{formatFcfa(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
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

      <Modal open={modal === 'payment'} title={editPayment ? 'Modifier l’encaissement' : 'Nouvel encaissement'} onClose={() => { setModal(null); setEditPayment(null); }}>
        <PaymentForm
          projects={[project]} defaultProjectId={project.id} defaultClient={project.client_name}
          initial={editPayment} fields={fields} busy={busy} onSubmit={submitPayment}
          onCancel={() => { setModal(null); setEditPayment(null); }}
        />
      </Modal>

      <Modal open={modal === 'subcontract'} title={editSub ? `Modifier « ${editSub.subcontractor_name} »` : 'Nouveau contrat sous-traitant / tâcheron'} onClose={() => { setModal(null); setEditSub(null); }}>
        <SubcontractForm
          initial={editSub}
          fields={fields}
          busy={busy}
          onSubmit={submitSubcontract}
          onCancel={() => { setModal(null); setEditSub(null); }}
        />
      </Modal>

      <Modal open={modal === 'subpay'} title="Enregistrer un versement au sous-traitant" onClose={() => { setModal(null); setEditSub(null); }}>
        {editSub && (
          <SubcontractPayModal
            target={editSub}
            busy={busy}
            onSubmit={submitSubPay}
            onCancel={() => { setModal(null); setEditSub(null); }}
          />
        )}
      </Modal>

      <Modal open={modal === 'edit'} title={`Modifier « ${project.name} »`} onClose={() => setModal(null)}>
        <ProjectForm
          initial={{
            name: project.name,
            client_name: project.client_name,
            client_phone: project.client_phone || '',
            location: project.location || '',
            budget: String(project.budget),
            start_date: project.start_date?.slice(0, 10),
            end_date: project.end_date?.slice(0, 10) || '',
            status: project.status,
            retention_bps: project.retention_bps || 0,
            retention_release_date: project.retention_release_date?.slice(0, 10) || '',
            notes: project.notes || '',
          }}
          fields={fields}
          busy={busy}
          onSubmit={submitEdit}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <AttachmentPreviewModal item={preview} onClose={() => setPreview(null)} />

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
