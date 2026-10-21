import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { quoteTotals } from '../../shared/trade.js';
import { Alert, Button, Card, Field, Input, Select, Textarea, Modal, PageHeader, StatCard, LoadingPage } from '../components/ui.jsx';
import BusinessForm from '../components/BusinessForm.jsx';
import { formatFcfa, formatDate, todayIso } from '../lib/format.js';
import { buildDocumentSummaryText, whatsappHref } from '../lib/whatsapp.js';

const LABELS = {
  quote: 'Devis', invoice: 'Facture', credit: 'Avoir',
  draft: 'Brouillon', issued: 'Émis', accepted: 'Accepté', rejected: 'Refusé',
  deposit: 'Acompte', progress: 'Situation', balance: 'Solde',
};

const BPU_SAMPLE_CSV = [
  'Désignation;Unité;Prix de vente FCFA;Coût prévu FCFA',
  'Béton armé dosé à 350 kg/m3;m3;95000;72000',
  'Maçonnerie en agglos creux 15x20x40;m2;8500;6200',
  'Enduit ciment intérieur lissé;m2;3500;2400',
  'Pose de carrelage grès cérame 60x60;m2;12500;8800',
  'Peinture vinylique 2 couches sur enduit;m2;2800;1700',
].join('\n');

function parseBpuCsv(raw) {
  const rows = String(raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (let i = 0; i < rows.length; i += 1) {
    const sep = rows[i].includes(';') ? ';' : rows[i].includes('\t') ? '\t' : ',';
    const cols = rows[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    const price = Number(cols[2].replace(/[^\d]/g, ''));
    const cost = cols[3] ? Number(cols[3].replace(/[^\d]/g, '')) : 0;
    if (i === 0 && (Number.isNaN(price) || /prix|montant/i.test(cols[2]))) continue;
    if (cols[0].length >= 2 && cols[1].length >= 1 && Number.isFinite(price)) {
      items.push({
        label: cols[0].slice(0, 160),
        unit: cols[1].slice(0, 30),
        unit_price: Math.max(0, Math.round(price)),
        unit_cost: Math.max(0, Math.round(Number.isFinite(cost) ? cost : 0)),
      });
    }
  }
  return items.slice(0, 200);
}

const emptyLine = () => ({ label: '', unit: 'unité', quantity: '1', unit_price: 0, unit_cost: 0 });

function QuoteForm({ data, busy, onSubmit, onCancel, initial }) {
  const [form, setForm] = useState(initial
    ? { project_id: initial.project_id || '', title: initial.title, client_name: initial.client_name, client_address: initial.client_address, tax: String(initial.tax_bps / 100), due_date: initial.due_date }
    : { project_id: '', title: '', client_name: '', client_address: '', tax: '0', due_date: todayIso() });
  const [lines, setLines] = useState(initial
    ? initial.lines.map(({ label, unit, quantity, unit_price, unit_cost }) => ({ label, unit, quantity, unit_price, unit_cost }))
    : [emptyLine()]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const line = (index, key, value) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [key]: value } : l)));
  let totals = null;
  try { totals = quoteTotals(lines, Math.round(Number(form.tax) * 100)); } catch { /* Aperçu temps réel */ }

  return (
    <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ ...form, tax: undefined, tax_bps: Math.round(Number(form.tax) * 100), project_id: form.project_id || null, lines });
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intitulé des travaux" htmlFor="q-title" required>
          <Input id="q-title" required maxLength={160} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Chantier existant (facultatif)" htmlFor="q-project">
          <Select id="q-project" value={form.project_id} onChange={(e) => {
            const p = data.projects.find((x) => x.id === e.target.value);
            setForm((f) => ({ ...f, project_id: e.target.value, ...(p ? { client_name: p.client_name, title: p.name } : {}) }));
          }}>
            <option value="">Créer le chantier à l’acceptation</option>
            {data.projects.filter((p) => p.status !== 'archive').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Client" htmlFor="q-client" required>
          <Input id="q-client" required maxLength={160} value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
        </Field>
        <Field label="Adresse client" htmlFor="q-address">
          <Input id="q-address" maxLength={240} value={form.client_address} onChange={(e) => set('client_address', e.target.value)} />
        </Field>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">Prestations &amp; matériaux ({lines.length})</h3>
          <Select
            aria-label="Ajouter depuis ma bibliothèque"
            value=""
            onChange={(e) => {
              const p = data.prices.find((x) => x.id === e.target.value);
              if (p) setLines((ls) => [...(ls.length === 1 && !ls[0].label ? [] : ls), { label: p.label, unit: p.unit, quantity: '1', unit_price: Number(p.unit_price), unit_cost: Number(p.unit_cost) }]);
            }}
            className="max-w-72"
          >
            <option value="">Ajouter depuis mon BPU ({data.prices.length})…</option>
            {data.prices.map((p) => <option key={p.id} value={p.id}>{p.label} — {formatFcfa(p.unit_price)}/{p.unit}</option>)}
          </Select>
        </div>

        <div className="mt-4 space-y-4">
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor={`line-${i}-label`} className="text-xs font-bold text-slate-500">Poste {i + 1}</label>
                {lines.length > 1 && (
                  <button type="button" aria-label={`Supprimer le poste ${i + 1}`} className="text-xs font-semibold text-red-700" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>
                    Supprimer
                  </button>
                )}
              </div>
              <Input id={`line-${i}-label`} placeholder="Ex. Pose de carrelage" required minLength={2} maxLength={160} value={l.label} onChange={(e) => line(i, 'label', e.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['quantity', 'Quantité'], ['unit', 'Unité'], ['unit_price', 'Prix de vente / unité'], ['unit_cost', 'Coût prévu / unité']].map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`line-${i}-${key}`}>
                    <Input
                      id={`line-${i}-${key}`}
                      required
                      type={key === 'unit' ? 'text' : 'number'}
                      min={key === 'quantity' ? 0.001 : 0}
                      step={key === 'quantity' ? 0.001 : 1}
                      value={l[key]}
                      onChange={(e) => line(i, key, key.startsWith('unit_') ? Number(e.target.value) : e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-3" disabled={lines.length >= 100} onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          + Ajouter un poste
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Taux de taxe (%)" htmlFor="q-tax" hint="À adapter à votre situation fiscale, aucun taux imposé par le logiciel.">
          <Input id="q-tax" type="number" min={0} max={100} step={0.01} required value={form.tax} onChange={(e) => set('tax', e.target.value)} />
        </Field>
        <Field label="Validité du devis" htmlFor="q-due">
          <Input id="q-due" type="date" required value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
      </div>

      {totals && (
        <div className="cp-charcoal-panel rounded-xl p-5">
          <div className="flex justify-between"><span>Sous-total</span><strong className="tabular">{formatFcfa(totals.subtotal)}</strong></div>
          <div className="mt-2 flex justify-between text-sm text-[#cfc7b8]"><span>Taxes</span><span className="tabular">{formatFcfa(totals.tax)}</span></div>
          <div className="mt-3 flex justify-between border-t border-white/20 pt-3 text-lg"><span>Total</span><strong className="tabular text-[#eab956]">{formatFcfa(totals.total)}</strong></div>
          <p className="mt-3 text-xs text-[#cfc7b8]">Coût prévisionnel saisi : {formatFcfa(totals.estimated_cost)} · marge indicative hors taxes : {formatFcfa(totals.subtotal - totals.estimated_cost)}. Les coûts non renseignés faussent cette estimation.</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>{initial ? 'Enregistrer le brouillon' : 'Créer le brouillon'}</Button>
      </div>
    </form>
  );
}

function BpuImportModal({ busy, onImport, onCancel }) {
  const [csvText, setCsvText] = useState(BPU_SAMPLE_CSV);
  const parsed = parseBpuCsv(csvText);

  const downloadSample = () => {
    const blob = new Blob([`\uFEFF${BPU_SAMPLE_CSV}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-bpu-chantierpilot.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (parsed.length) onImport({ items: parsed }); }}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e3ddd0] bg-[#faf7f0] p-3 text-xs text-[#574f45]">
        <span>Colonnes attendues : <strong>Désignation ; Unité ; Prix vente FCFA ; Coût prévu FCFA</strong> (séparateur <code>;</code>, <code>,</code> ou copier-coller Excel).</span>
        <Button variant="secondary" className="min-h-8 px-3 py-1 text-xs" onClick={downloadSample}>
          Modèle CSV
        </Button>
      </div>

      <Field label="Charger un fichier .csv depuis votre ordinateur ou téléphone">
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="block w-full text-sm text-[#574f45] file:mr-3 file:rounded-xl file:border file:border-[#e6ce96] file:bg-[#fdf8ec] file:px-4 file:py-2 file:text-xs file:font-bold file:text-[#141210]"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsvText(await f.text());
          }}
        />
      </Field>

      <Field label="Ou collez / ajustez directement vos lignes BPU ci-dessous">
        <Textarea rows={6} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
      </Field>

      <div className="rounded-xl border border-[#e3ddd0] bg-white p-3 text-xs">
        <p className="font-bold text-[#141210]">{parsed.length} ouvrage(s) détecté(s) prêt(s) à importer :</p>
        {parsed.length > 0 && (
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[#574f45]">
            {parsed.slice(0, 12).map((it, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="truncate">{it.label} ({it.unit})</span>
                <strong className="shrink-0 tabular text-[#141210]">{formatFcfa(it.unit_price)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy} disabled={parsed.length === 0}>
          Importer {parsed.length} poste(s)
        </Button>
      </div>
    </form>
  );
}

export default function DocumentsPage() {
  const { user, company } = useAuth();
  const admin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const load = () => api('/api/documents').then(setData);
  useEffect(() => { if (admin) load().catch((e) => setError(e.message)); }, [admin]);

  const open = (action, title, fields = [], base = {}) => {
    setError('');
    setModal({ action, title, fields, base, requestId: crypto.randomUUID() });
  };

  useEffect(() => {
    if (admin && data && searchParams.get('nouveau') === '1') {
      open('quote', 'Nouveau devis');
      setSearchParams({}, { replace: true });
    }
  }, [admin, data, searchParams, setSearchParams]);

  async function submit(values) {
    setBusy(true); setError('');
    const body = { ...modal.base, ...values, action: modal.action, request_id: modal.requestId };
    if (body.percent !== undefined) { body.percent_bps = Math.round(body.percent * 100); delete body.percent; }
    try {
      const response = await api('/api/documents', { method: 'POST', body });
      const msg = modal.action === 'price_import'
        ? `${response.result.count} ouvrage(s) ajouté(s) à votre bibliothèque BPU.`
        : `${response.result.number || 'Opération'} enregistré(e).`;
      setNotice(msg);
      setModal(null);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function duplicateQuote(quoteId) {
    setBusy(true); setError('');
    try {
      const response = await api('/api/documents', {
        method: 'POST',
        body: { action: 'duplicate', id: quoteId, request_id: crypto.randomUUID() },
      });
      setNotice(`Devis dupliqué en brouillon : ${response.result.number}.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!admin) return <Alert>Les documents commerciaux et prix sont réservés à l’administrateur.</Alert>;
  if (!data) return error ? <Alert type="error">{error}</Alert> : <LoadingPage />;
  const due = { key: 'due_date', label: 'Date d’échéance', type: 'date', value: todayIso() };

  return (
    <div>
      <PageHeader
        title="Devis & facturation"
        subtitle="Chiffrez vos travaux, importez votre BPU, créez le chantier et facturez son avancement."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => open('price_import', 'Importer un bordereau de prix (CSV / Excel)')}>
              Importer BPU (CSV)
            </Button>
            <Button onClick={() => open('quote', 'Nouveau devis')}>+ Devis</Button>
          </div>
        )}
      />

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        Vos mentions légales et fiscales se renseignent dans Paramètres : RCCM, NCC et régime fiscal. Les PDF générés ici sont des documents internes, sans transmission ni certification FNE/DGI. L’accord enregistré sur un devis n’est pas une signature électronique certifiée ; les règlements sont déclarés, pas prélevés automatiquement.
      </div>

      {error && !modal && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert type="success">{notice}</Alert></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Devis à suivre" value={data.summary.open_quotes} />
        <StatCard tone="green" label="Facturé net des avoirs" value={formatFcfa(data.summary.net_billed)} />
        <StatCard tone="gold" label="Solde facturé à encaisser" value={formatFcfa(data.summary.outstanding)} />
        <StatCard tone={data.summary.overdue > 0 ? 'red' : 'slate'} label="Factures échues non soldées" value={data.summary.overdue} />
      </div>

      <div className="cp-filter-bar mb-5 flex flex-wrap gap-3">
        <Input aria-label="Rechercher un document" className="max-w-sm" placeholder="Client, numéro, travaux…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select aria-label="Type de document" className="max-w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {[['all', 'Tous'], ['quote', 'Devis'], ['invoice', 'Factures'], ['credit', 'Avoirs']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => open('price', 'Ajouter à ma bibliothèque', [
          { key: 'label', label: 'Prestation / matériau' },
          { key: 'unit', label: 'Unité' },
          { key: 'unit_price', label: 'Prix de vente (FCFA)', type: 'number', min: 0 },
          { key: 'unit_cost', label: 'Coût prévu (FCFA)', type: 'number', min: 0, value: 0 },
        ])}>
          + Prix réutilisable ({data.prices.length})
        </Button>
      </div>

      <p className="mb-3 text-xs text-slate-500">Indicateurs sur tous les documents · liste limitée aux 500 plus récents.</p>

      <div className="space-y-4">
        {data.documents
          .filter((d) => (filter === 'all' || filter === d.kind) && `${d.number} ${d.title} ${d.client_name}`.toLowerCase().includes(search.toLowerCase()))
          .map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    {LABELS[d.kind]} {d.invoice_kind ? `· ${LABELS[d.invoice_kind]}` : ''} · {d.number}
                  </p>
                  <h2 className="mt-2 text-lg font-bold">{d.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{d.client_name} · {formatDate(d.created_at)} · {LABELS[d.status]}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tabular">{formatFcfa(d.total)}</p>
                  <p className="mt-1 text-xs text-slate-500">dont taxes : {formatFcfa(d.tax)}</p>
                </div>
              </div>

              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-semibold text-slate-600">Détail des postes et échéance</summary>
                <ul className="mt-3 space-y-2">
                  {d.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                      <span>{l.label} · {l.quantity} {l.unit}</span>
                      <strong>{formatFcfa(l.total)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-500">
                  Échéance / validité : {formatDate(d.due_date)}
                  {d.accepted_name ? ` · Acceptation : ${d.accepted_name} (${d.accepted_reference})` : ''}
                </p>
                {d.kind === 'quote' && (
                  <p className="mt-2 text-xs text-slate-500">
                    Coût prévisionnel saisi : {formatFcfa(d.estimated_cost)}. La marge n’est fiable que si tous les coûts sont renseignés.
                  </p>
                )}
              </details>

              {d.kind === 'invoice' && (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  Règlements affectés : {formatFcfa(d.paid)} · Avoir : {formatFcfa(d.credited)} ·{' '}
                  <strong>Reste : {formatFcfa(Math.max(0, Number(d.total) - Number(d.paid) - Number(d.credited)))}</strong>
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/api/documents?pdf=${d.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50">
                  Télécharger PDF
                </a>
                <a
                  href={whatsappHref('', buildDocumentSummaryText(d, company?.name))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  WhatsApp
                </a>
                {d.project_id && (
                  <Link to={`/chantiers/${d.project_id}`} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-amber-700">
                    Voir le chantier →
                  </Link>
                )}
                {d.kind === 'quote' && (
                  <Button variant="secondary" disabled={busy} onClick={() => duplicateQuote(d.id)}>
                    Dupliquer
                  </Button>
                )}
                {d.kind === 'quote' && d.status === 'draft' && (
                  <Button variant="secondary" onClick={() => { open('quote_update', 'Modifier le brouillon', [], { id: d.id }); setModal((m) => ({ ...m, initial: d })); }}>
                    Modifier
                  </Button>
                )}
                {d.kind === 'quote' && d.status === 'draft' && (
                  <Button onClick={() => open('issue', 'Émettre ce devis ? Les montants seront figés.', [], { id: d.id })}>Émettre</Button>
                )}
                {d.kind === 'quote' && d.status === 'issued' && (
                  <Button onClick={() => open('accept', 'Enregistrer l’acceptation du client', [
                    { key: 'name', label: 'Nom du client ayant accepté', value: d.client_name },
                    { key: 'reference', label: 'Référence de l’accord (devis signé, e-mail, courrier…)' },
                    { key: 'start_date', label: 'Début du chantier', type: 'date', value: todayIso() },
                  ], { id: d.id })}>
                    Acceptation reçue
                  </Button>
                )}
                {d.kind === 'quote' && ['draft', 'issued'].includes(d.status) && (
                  <Button variant="secondary" onClick={() => open('reject', 'Classer ce devis comme refusé ?', [], { id: d.id })}>Refusé</Button>
                )}
                {d.kind === 'quote' && d.status === 'accepted' && (
                  <Button onClick={() => open('invoice', 'Facturer le devis accepté', [
                    { key: 'kind', label: 'Type de facture', options: [['deposit', 'Acompte (% du devis)'], ['progress', 'Situation (% d’avancement cumulé)'], ['balance', 'Solde restant']], value: 'deposit' },
                    { key: 'percent', label: 'Pourcentage (ignoré pour le solde)', type: 'number', min: 0.01, max: 100, step: 0.01, value: 30, hint: 'Situation : cumul à atteindre. Les factures précédentes sont déduites.' },
                    due,
                  ], { quote_id: d.id })}>
                    Créer une facture
                  </Button>
                )}
                {d.kind === 'invoice' && Number(d.total) - Number(d.credited) - Number(d.paid) > 0 && (
                  <Button onClick={() => open('receive_payment', 'Déclarer un règlement de cette facture', [
                    { key: 'amount', label: 'Montant reçu (FCFA)', type: 'number', value: Number(d.total) - Number(d.credited) - Number(d.paid) },
                    { key: 'date', label: 'Date', type: 'date', value: todayIso() },
                    { key: 'reference', label: 'Référence de paiement' },
                    { key: 'method', label: 'Mode', options: [['especes', 'Espèces'], ['mobile_money', 'Mobile Money'], ['virement_bancaire', 'Virement bancaire'], ['cheque', 'Chèque'], ['autre', 'Autre']], value: 'mobile_money' },
                    { key: 'proof', label: 'Justificatif facultatif', type: 'file' },
                  ], { id: d.id })}>
                    Enregistrer un règlement
                  </Button>
                )}
                {d.kind === 'invoice' && Number(d.paid) === 0 && Number(d.credited) === 0 && (
                  <Button variant="secondary" onClick={() => open('credit', 'Annuler intégralement la facture par un avoir', [{ key: 'reason', label: 'Motif de l’avoir' }], { id: d.id })}>
                    Avoir intégral
                  </Button>
                )}
              </div>
            </Card>
          ))}

        {data.documents.length === 0 && (
          <Card>
            <h2 className="font-bold">Votre premier devis, sans ressaisie</h2>
            <p className="mt-2 text-sm text-slate-500">
              Importez votre bordereau de prix CSV ou créez vos postes, émettez le devis, puis enregistrez l’accord du client : le chantier est créé automatiquement.
            </p>
          </Card>
        )}
      </div>

      {modal && (
        <Modal open title={modal.title} onClose={() => setModal(null)} wide>
          {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}
          {['quote', 'quote_update'].includes(modal.action) ? (
            <QuoteForm initial={modal.initial} data={data} busy={busy} onSubmit={submit} onCancel={() => setModal(null)} />
          ) : modal.action === 'price_import' ? (
            <BpuImportModal busy={busy} onImport={submit} onCancel={() => setModal(null)} />
          ) : (
            <BusinessForm key={modal.requestId} fields={modal.fields} busy={busy} onSubmit={submit} onCancel={() => setModal(null)} />
          )}
        </Modal>
      )}
    </div>
  );
}
