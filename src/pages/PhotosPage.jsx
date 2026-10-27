import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { readFileAsAttachment } from '../lib/file.js';
import { CATEGORIES, CATEGORY_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../lib/constants.js';
import { formatDate, formatFcfa, todayIso } from '../lib/format.js';
import { AttachmentPreviewModal } from '../components/AttachmentPreviewModal.jsx';
import {
  ButtonLink, Alert, Badge, Button, Card, EmptyState, Field, Input, LoadingPage, Modal, PageHeader, Select, StatCard, Textarea, Toast,
} from '../components/ui.jsx';

export default function PhotosPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [projects, setProjects] = useState([]);
  const [journal, setJournal] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);

  const [filterProject, setFilterProject] = useState('');
  const [filterKind, setFilterKind] = useState('all');
  const [preview, setPreview] = useState(null);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kind: 'journal',
    project_id: '',
    date: todayIso(),
    title: '',
    progress: '0',
    notes: '',
    category: 'materiaux',
    amount: '',
    supplier: '',
    client_name: '',
    payment_method: 'mobile_money',
    reference: '',
    attachment: null,
    metaInfo: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projRes, opsRes, expRes, payRes] = await Promise.all([
        api('/api/projects?limit=100'),
        api('/api/operations'),
        api('/api/expenses?limit=100'),
        api('/api/payments?limit=100'),
      ]);
      const projList = projRes.projects || [];
      setProjects(projList);
      setJournal((opsRes.journal || []).filter((j) => j.has_photo));
      setExpenses((expRes.expenses || []).filter((e) => e.has_receipt));
      setPayments((payRes.payments || []).filter((p) => p.has_proof));
      setForm((prev) => ({
        ...prev,
        project_id: prev.project_id || projList.find((p) => p.status !== 'archive')?.id || projList[0]?.id || '',
      }));
    } catch (e) {
      setError(e.message || 'Impossible de charger la galerie de photos et reçus.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const activeProjects = useMemo(() => projects.filter((p) => p.status !== 'archive'), [projects]);

  const items = useMemo(() => {
    const list = [
      ...journal.map((j) => ({
        uid: `journal-${j.id}`,
        kind: 'journal',
        kindLabel: 'Photo chantier',
        project_id: j.project_id,
        projectName: projectMap.get(j.project_id)?.name || 'Chantier',
        title: j.title,
        subtitle: `Avancement déclaré : ${j.progress}%${j.author ? ` · ${j.author}` : ''}`,
        date: j.entry_date,
        amount: null,
        mime: 'image/jpeg',
        url: `/api/operations?photo_id=${j.id}`,
        downloadUrl: `/api/operations?photo_id=${j.id}`,
      })),
      ...expenses.map((e) => ({
        uid: `expense-${e.id}`,
        kind: 'expense',
        kindLabel: 'Reçu dépense',
        project_id: e.project_id,
        projectName: e.project_name || projectMap.get(e.project_id)?.name || 'Chantier',
        title: e.description || CATEGORY_LABELS[e.category] || 'Dépense chantier',
        subtitle: `${CATEGORY_LABELS[e.category] || e.category}${e.supplier ? ` · ${e.supplier}` : ''}`,
        date: e.expense_date,
        amount: Number(e.amount || 0),
        mime: e.receipt_mime || 'image/jpeg',
        url: `/api/files?kind=expense&id=${e.id}&inline=1`,
        downloadUrl: `/api/files?kind=expense&id=${e.id}`,
      })),
      ...payments.map((p) => ({
        uid: `payment-${p.id}`,
        kind: 'payment',
        kindLabel: 'Preuve client',
        project_id: p.project_id,
        projectName: p.project_name || projectMap.get(p.project_id)?.name || 'Chantier',
        title: p.client_name || 'Encaissement client',
        subtitle: `${PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method} · Réf. ${p.reference}`,
        date: p.payment_date,
        amount: Number(p.amount || 0),
        mime: p.proof_mime || 'image/jpeg',
        url: `/api/files?kind=proof&id=${p.id}&inline=1`,
        downloadUrl: `/api/files?kind=proof&id=${p.id}`,
      })),
    ];

    return list
      .filter((it) => (!filterProject || it.project_id === filterProject))
      .filter((it) => (filterKind === 'all' || it.kind === filterKind))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [journal, expenses, payments, projectMap, filterProject, filterKind]);

  const handleQuickPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCompressing(true);
    try {
      const att = await readFileAsAttachment(file);
      const kb = Math.max(1, Math.round((att.data.length * 3) / 4 / 1024));
      const origKb = Math.max(1, Math.round(file.size / 1024));
      const wasOpt = att.mime !== file.type || kb < origKb * 0.95;
      const defaultKind = att.mime === 'application/pdf' ? 'expense' : form.kind;
      const selectedProj = activeProjects.find((p) => p.id === (filterProject || form.project_id)) || activeProjects[0];
      setForm((prev) => ({
        ...prev,
        kind: defaultKind,
        project_id: selectedProj?.id || prev.project_id,
        client_name: prev.client_name || selectedProj?.client_name || '',
        attachment: att,
        metaInfo: `${att.filename} (${wasOpt ? `optimisée : ${origKb} Ko → ${kb} Ko` : `${kb} Ko`})`,
      }));
      setCaptureOpen(true);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setCompressing(false);
    }
  };

  const handleSaveCapture = async (e) => {
    e.preventDefault();
    if (!form.project_id) {
      setToast({ type: 'error', message: 'Sélectionnez d’abord un chantier.' });
      return;
    }
    if (!form.attachment) {
      setToast({ type: 'error', message: 'Prenez une photo ou choisissez un fichier.' });
      return;
    }
    setSaving(true);
    try {
      if (form.kind === 'journal') {
        if (!form.attachment.mime.startsWith('image/')) {
          throw new Error('Le journal photo accepte les images (JPG, PNG, WebP). Choisissez « Reçu dépense » pour un PDF.');
        }
        await api('/api/operations', {
          method: 'POST',
          body: {
            action: 'journal',
            request_id: crypto.randomUUID(),
            project_id: form.project_id,
            date: form.date,
            title: (form.title || 'Photo d’avancement chantier').trim(),
            progress: Math.min(100, Math.max(0, Number(form.progress) || 0)),
            notes: form.notes.trim(),
            photo: form.attachment,
          },
        });
      } else if (form.kind === 'expense') {
        const amt = Number(String(form.amount).replace(/[^\d]/g, ''));
        if (!amt || amt <= 0) throw new Error('Indiquez le montant de la dépense en FCFA.');
        await api('/api/expenses', {
          method: 'POST',
          body: {
            project_id: form.project_id,
            category: form.category,
            amount: amt,
            expense_date: form.date,
            supplier: form.supplier.trim(),
            description: (form.title || 'Achat sur justificatif photo').trim(),
            receipt: form.attachment,
          },
        });
      } else {
        const amt = Number(String(form.amount).replace(/[^\d]/g, ''));
        if (!amt || amt <= 0) throw new Error('Indiquez le montant de l’encaissement en FCFA.');
        await api('/api/payments', {
          method: 'POST',
          body: {
            project_id: form.project_id,
            client_name: (form.client_name || projectMap.get(form.project_id)?.client_name || 'Client').trim(),
            amount: amt,
            payment_date: form.date,
            payment_method: form.payment_method,
            reference: (form.reference || `PHOTO-${Date.now().toString().slice(-6)}`).trim(),
            memo: form.notes.trim(),
            proof: form.attachment,
          },
        });
      }
      setCaptureOpen(false);
      setForm((prev) => ({ ...prev, title: '', amount: '', supplier: '', notes: '', reference: '', attachment: null, metaInfo: '' }));
      setToast({ type: 'success', message: 'Pièce enregistrée et classée dans le chantier.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingPage label="Chargement des photos et justificatifs…" />;

  const totalCount = journal.length + expenses.length + payments.length;

  return (
    <div>
      <PageHeader
        eyebrow="Terrain & Preuves"
        title="Photos & reçus"
        subtitle="Photographiez vos chantiers, factures fournisseurs et preuves de règlements : compression mobile automatique et visionneuse HD."
        actions={activeProjects.length > 0 ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#e5a93b] px-4 py-2 text-sm font-bold text-[#141210] shadow-sm transition hover:bg-[#f0b84c]">
            <span>📷 Prendre une photo</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleQuickPick} />
          </label>
        ) : isAdmin ? (
          <ButtonLink to="/chantiers?nouveau=1">+ Créer d’abord un chantier</ButtonLink>
        ) : null}
      />

      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      {/* Zone de prise de photo immédiate sur mobile & ordinateur */}
      {activeProjects.length > 0 ? (
        <section className="cp-dropzone mb-6 p-5 sm:p-6" aria-label="Prise de photo rapide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#854d0e]">Capture directe smartphone &amp; PC</p>
              <h2 className="mt-1 text-lg font-extrabold text-[#141210]">
                {compressing ? 'Optimisation automatique de votre photo en cours…' : 'Ajouter une photo de chantier ou un reçu en 2 clics'}
              </h2>
              <p className="mt-0.5 text-sm text-[#574f45]">
                Les photos lourdes du téléphone sont automatiquement allégées en JPEG net avant l’envoi pour économiser la 4G.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#141210] px-4 py-2.5 text-sm font-bold text-[#eab956] ring-1 ring-[#eab956]/45 transition hover:bg-[#221e1a]">
                <span>📷 Appareil photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={compressing}
                  className="sr-only"
                  onChange={handleQuickPick}
                />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#cfc7b8] bg-white px-4 py-2.5 text-sm font-semibold text-[#141210] transition hover:bg-[#faf7f0]">
                <span>📁 Galerie / PDF</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                  disabled={compressing}
                  className="sr-only"
                  onChange={handleQuickPick}
                />
              </label>
            </div>
          </div>
        </section>
      ) : (
        <Card className="mb-6">
          <EmptyState
            title="Créez votre premier chantier pour y rattacher des photos et reçus"
            message="Chaque photo d’avancement, facture matériau ou preuve Mobile Money est automatiquement rangée dans le dossier de son chantier."
            action={isAdmin ? <ButtonLink to="/chantiers?nouveau=1">+ Nouveau chantier</ButtonLink> : null}
          />
        </Card>
      )}

      {/* Synthèse KPI */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Total pièces classées" value={totalCount} sub="Toutes preuves confondues" />
        <StatCard tone="gold" label="Photos de chantier" value={journal.length} sub="Avancement & constats terrain" />
        <StatCard tone="green" label="Reçus de dépenses" value={expenses.length} sub="Factures & bons fournisseurs" />
        <StatCard tone="slate" label="Preuves d’encaissement" value={payments.length} sub="Virements, reçus & Mobile Money" />
      </div>

      {/* Barre de filtres */}
      <div className="cp-filter-bar mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer par type de pièce">
          {[
            ['all', `Toutes (${totalCount})`],
            ['journal', `Photos chantier (${journal.length})`],
            ['expense', `Reçus dépenses (${expenses.length})`],
            ['payment', `Preuves clients (${payments.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterKind(key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition sm:text-sm ${
                filterKind === key
                  ? 'bg-[#141210] text-[#eab956] ring-1 ring-[#eab956]/45 shadow-sm'
                  : 'bg-white text-[#3f3932] ring-1 ring-[#dfd8c8] hover:bg-[#fdf8ec]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="sm:w-64">
          <Select
            aria-label="Filtrer les pièces par chantier"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">Tous les chantiers</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Grille visuelle des photos et justificatifs */}
      {items.length === 0 ? (
        <EmptyState
          title="Aucune photo ou pièce jointe pour ce filtre"
          message="Utilisez le bouton « 📷 Prendre une photo » ci-dessus pour capturer un avancement chantier, un reçu fournisseur ou une preuve de règlement."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isPdf = item.mime === 'application/pdf';
            return (
              <article
                key={item.uid}
                className="cp-card-surface cp-card-lift flex flex-col overflow-hidden rounded-2xl"
              >
                <button
                  type="button"
                  onClick={() => setPreview(item)}
                  className="group relative block h-48 w-full overflow-hidden bg-[#141210] text-left"
                >
                  {isPdf ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-[#eab956]">
                      <span className="rounded-xl border border-[#eab956]/40 bg-white/5 px-3 py-1.5 text-sm font-extrabold">
                        Document PDF
                      </span>
                      <span className="text-xs text-[#dfd9ce]">Cliquer pour ouvrir l’aperçu</span>
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute left-3 top-3">
                    <Badge className={
                      item.kind === 'journal'
                        ? 'bg-[#141210]/90 text-[#eab956] ring-[#eab956]/45'
                        : item.kind === 'expense'
                          ? 'bg-amber-50/95 text-amber-900 ring-amber-300'
                          : 'bg-emerald-50/95 text-emerald-900 ring-emerald-300'
                    }>
                      {item.kindLabel}
                    </Badge>
                  </span>
                </button>

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#574f45]">
                      <span className="truncate font-bold text-[#854d0e]">{item.projectName}</span>
                      <span className="shrink-0">{formatDate(item.date)}</span>
                    </div>
                    <h3 className="mt-1.5 line-clamp-1 font-bold text-[#141210]">{item.title}</h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[#574f45]">{item.subtitle}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#ece6d9] pt-3">
                    <span className="text-sm font-extrabold tabular text-[#141210]">
                      {item.amount !== null ? formatFcfa(item.amount) : 'Constat photo'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreview(item)}
                      className="rounded-lg bg-[#fdf8ec] px-3 py-1.5 text-xs font-bold text-[#854d0e] ring-1 ring-[#e6ce96] transition hover:bg-[#faeccd]"
                    >
                      Agrandir / Zoom
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modale d’enregistrement rapide après prise de photo */}
      <Modal
        open={captureOpen}
        title="Classer la photo ou le justificatif"
        onClose={() => !saving && setCaptureOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSaveCapture}>
          {form.metaInfo && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900">
              ✓ Pièce prête : {form.metaInfo}
            </div>
          )}

          <Field label="Où classer cette pièce ?" htmlFor="cap-kind" required>
            <Select
              id="cap-kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="journal">📷 Photo d’avancement du chantier (Journal photo)</option>
              <option value="expense">🧾 Facture / reçu d’une dépense BTP</option>
              <option value="payment">💰 Preuve d’encaissement client (Mobile Money, virement…)</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chantier concerné" htmlFor="cap-project" required>
              <Select
                id="cap-project"
                value={form.project_id}
                onChange={(e) => {
                  const p = projectMap.get(e.target.value);
                  setForm((f) => ({ ...f, project_id: e.target.value, client_name: p?.client_name || f.client_name }));
                }}
              >
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="cap-date" required>
              <Input
                id="cap-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
          </div>

          {form.kind === 'journal' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Objet de la photo" htmlFor="cap-title" required>
                  <Input
                    id="cap-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex. Coulage dalle R+1"
                    required
                  />
                </Field>
                <Field label="Avancement constaté (%)" htmlFor="cap-prog">
                  <Input
                    id="cap-prog"
                    type="number"
                    min="0"
                    max="100"
                    value={form.progress}
                    onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Observations (facultatif)" htmlFor="cap-notes">
                <Textarea
                  id="cap-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Détails sur les travaux photographiés…"
                />
              </Field>
            </>
          )}

          {form.kind === 'expense' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Catégorie BTP" htmlFor="cap-cat" required>
                  <Select
                    id="cap-cat"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Montant (FCFA)" htmlFor="cap-amt" required>
                  <Input
                    id="cap-amt"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d]/g, '') }))}
                    placeholder="Ex. 185000"
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fournisseur" htmlFor="cap-sup">
                  <Input
                    id="cap-sup"
                    value={form.supplier}
                    onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                    placeholder="Ex. Bernabé / Quincaillerie"
                  />
                </Field>
                <Field label="Désignation" htmlFor="cap-desc">
                  <Input
                    id="cap-desc"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex. 50 sacs de ciment CPJ 42.5"
                  />
                </Field>
              </div>
            </>
          )}

          {form.kind === 'payment' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Montant encaissé (FCFA)" htmlFor="cap-pay-amt" required>
                  <Input
                    id="cap-pay-amt"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d]/g, '') }))}
                    placeholder="Ex. 1500000"
                    required
                  />
                </Field>
                <Field label="Mode de règlement" htmlFor="cap-pay-method" required>
                  <Select
                    id="cap-pay-method"
                    value={form.payment_method}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                  >
                    {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom du client" htmlFor="cap-pay-client" required>
                  <Input
                    id="cap-pay-client"
                    value={form.client_name}
                    onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Référence transaction / reçu" htmlFor="cap-pay-ref" required>
                  <Input
                    id="cap-pay-ref"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="Ex. WAVE-884512"
                    required
                  />
                </Field>
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setCaptureOpen(false)} disabled={saving}>Annuler</Button>
            <Button type="submit" loading={saving}>Enregistrer dans le chantier</Button>
          </div>
        </form>
      </Modal>

      <AttachmentPreviewModal
        item={preview ? {
          title: `${preview.projectName} — ${preview.title}`,
          url: preview.url,
          downloadUrl: preview.downloadUrl,
          mime: preview.mime,
        } : null}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
