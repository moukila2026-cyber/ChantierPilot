// Formulaires partagés : dépense et encaissement (utilisés dans la fiche
// chantier et dans les listes globales).
import { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../lib/constants.js';
import { todayIso } from '../lib/format.js';
import { readFileAsAttachment } from '../lib/file.js';
import { Button, Field, Input, Select, Textarea } from './ui.jsx';

export function FileField({ label, hint, value, onChange, error }) {
  const [compressing, setCompressing] = useState(false);
  const [wasCompressed, setWasCompressed] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) { setWasCompressed(false); onChange(null); return; }
    setCompressing(true);
    try {
      const att = await readFileAsAttachment(file);
      const finalBytes = Math.round(((att?.data?.length || 0) * 3) / 4);
      setWasCompressed(Boolean(att && (att.mime !== file.type || finalBytes < file.size * 0.95)));
      onChange(att);
    } catch (err) {
      setWasCompressed(false);
      onChange(null, err.message);
      e.target.value = '';
    } finally {
      setCompressing(false);
    }
  };

  return (
    <Field label={label} error={error} hint={hint || 'Photo mobile compressée automatiquement ou PDF (2 Mo max).'}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
          disabled={compressing}
          className="block w-full text-sm text-[#574f45] file:mr-3 file:rounded-xl file:border file:border-[#e6ce96] file:bg-[#fdf8ec] file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-[#141210] hover:file:bg-[#faeccd]"
          onChange={handleFile}
        />
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#e6ce96] bg-[#fdf8ec] px-3.5 py-1.5 text-xs font-bold text-[#141210] transition hover:bg-[#faeccd]">
          <span>📷 Prendre une photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={compressing}
            className="sr-only"
            onChange={handleFile}
          />
        </label>
      </div>
      {compressing && (
        <p className="mt-1.5 text-xs font-semibold text-amber-800">Optimisation automatique de la photo…</p>
      )}
      {value && !compressing && (
        <p className="mt-1.5 text-xs font-semibold text-emerald-700">
          ✓ {value.filename} ({Math.max(1, Math.round((value.data.length * 3) / 4 / 1024))} Ko{wasCompressed ? ' · photo optimisée' : ''})
          {' — '}
          <button type="button" onClick={() => { setWasCompressed(false); onChange(null); }} className="underline">retirer</button>
        </p>
      )}
    </Field>
  );
}

export function ExpenseForm({ projects, initial, defaultProjectId, onSubmit, onCancel, busy, fields }) {
  const [form, setForm] = useState(initial || {
    project_id: defaultProjectId || projects[0]?.id || '',
    category: 'materiaux', amount: '', expense_date: todayIso(),
    supplier: '', description: '', receipt: null,
  });
  const [fileError, setFileError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ ...form, amount: form.amount === '' ? 0 : Number(form.amount) });
    }} noValidate>
      {!initial && (
        <Field label="Chantier" htmlFor="e-project" error={fields?.project_id} required>
          <Select id="e-project" value={form.project_id} onChange={(e) => set('project_id', e.target.value)} error={fields?.project_id}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Catégorie" htmlFor="e-cat" error={fields?.category} required>
          <Select id="e-cat" value={form.category} onChange={(e) => set('category', e.target.value)} error={fields?.category}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Montant (FCFA)" htmlFor="e-amount" error={fields?.amount} required>
          <Input id="e-amount" inputMode="numeric" pattern="[0-9]*" value={form.amount}
            onChange={(e) => set('amount', e.target.value.replace(/[^\d]/g, ''))} placeholder="Ex. 250000" error={fields?.amount} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="e-date" error={fields?.expense_date} required>
          <Input id="e-date" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} error={fields?.expense_date} />
        </Field>
        <Field label="Fournisseur" htmlFor="e-sup" error={fields?.supplier}>
          <Input id="e-sup" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Ex. Quincaillerie du Plateau" error={fields?.supplier} />
        </Field>
      </div>
      <Field label="Description" htmlFor="e-desc" error={fields?.description}>
        <Textarea id="e-desc" value={form.description} onChange={(e) => set('description', e.target.value)}
          placeholder="Objet de la dépense" error={fields?.description} />
      </Field>
      <FileField
        label="Justificatif (facultatif)"
        hint="JPEG, PNG ou PDF — 2 Mo maximum."
        value={form.receipt}
        error={fileError || fields?.receipt}
        onChange={(att, err) => { setFileError(err || null); set('receipt', att); }}
      />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>{initial ? 'Enregistrer' : 'Ajouter la dépense'}</Button>
      </div>
    </form>
  );
}

export function PaymentForm({ projects, initial, defaultProjectId, defaultClient, onSubmit, onCancel, busy, fields }) {
  const [form, setForm] = useState(initial || {
    project_id: defaultProjectId || projects[0]?.id || '',
    client_name: defaultClient || '', amount: '', payment_date: todayIso(),
    reference: '', payment_method: 'especes', memo: '', proof: null,
  });
  const [fileError, setFileError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ ...form, amount: form.amount === '' ? 0 : Number(form.amount) });
    }} noValidate>
      {!initial && (
        <Field label="Chantier" htmlFor="y-project" error={fields?.project_id} required>
          <Select id="y-project" value={form.project_id} onChange={(e) => set('project_id', e.target.value)} error={fields?.project_id}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" htmlFor="y-client" error={fields?.client_name} required>
          <Input id="y-client" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} error={fields?.client_name} />
        </Field>
        <Field label="Montant (FCFA)" htmlFor="y-amount" error={fields?.amount} required>
          <Input id="y-amount" inputMode="numeric" pattern="[0-9]*" value={form.amount}
            onChange={(e) => set('amount', e.target.value.replace(/[^\d]/g, ''))} placeholder="Ex. 500000" error={fields?.amount} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="y-date" error={fields?.payment_date} required>
          <Input id="y-date" type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} error={fields?.payment_date} />
        </Field>
        <Field label="Mode de paiement" htmlFor="y-method" error={fields?.payment_method} required>
          <Select id="y-method" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)} error={fields?.payment_method}>
            {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Référence (obligatoire)" htmlFor="y-ref" error={fields?.reference} required
        hint="N° de reçu, référence de virement, transaction Mobile Money… C'est la trace écrite du paiement.">
        <Input id="y-ref" value={form.reference} onChange={(e) => set('reference', e.target.value)}
          placeholder="Ex. REC-2026-014 ou TXN-884512" error={fields?.reference} />
      </Field>
      <Field label="Mémo" htmlFor="y-memo" error={fields?.memo}>
        <Textarea id="y-memo" value={form.memo} onChange={(e) => set('memo', e.target.value)} error={fields?.memo} />
      </Field>
      <FileField
        label="Justificatif (facultatif)"
        hint="Avec un justificatif joint, l'encaissement est considéré comme prouvé. Sans, il reste une déclaration documentée par sa référence."
        value={form.proof}
        error={fileError || fields?.proof}
        onChange={(att, err) => { setFileError(err || null); set('proof', att); }}
      />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>{initial ? 'Enregistrer' : 'Enregistrer l\'encaissement'}</Button>
      </div>
    </form>
  );
}

export { CATEGORY_LABELS, PAYMENT_METHOD_LABELS };
