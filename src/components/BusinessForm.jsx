import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from './ui.jsx';
import { FileField } from './forms.jsx';

// Formulaires métier explicites et accessibles, utilisés dans les modules terrain, commerce et gestion avancée.
export default function BusinessForm({ fields, initial = {}, onSubmit, onCancel, busy, submitLabel = 'Enregistrer' }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? f.value ?? (f.type === 'file' ? null : '')])));
  const [fileError, setFileError] = useState('');
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (fileError) return;
        onSubmit(Object.fromEntries(fields.map((f) => [f.key, f.type === 'number' ? Number(values[f.key]) : values[f.key]])));
      }}
    >
      {fields.map((f) => (
        f.type === 'file' ? (
          <FileField
            key={f.key}
            label={f.label}
            hint="JPEG, PNG ou PDF · 2 Mo maximum (journal : photos seulement)."
            value={values[f.key]}
            error={fileError}
            onChange={(value, error) => { set(f.key, value); setFileError(error || ''); }}
          />
        ) : (
          <Field key={f.key} label={f.label} htmlFor={`business-${f.key}`} hint={f.hint} required={f.required !== false}>
            {f.options ? (
              <Select id={`business-${f.key}`} required={f.required !== false} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Sélectionner…</option>
                {f.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            ) : f.type === 'textarea' ? (
              <Textarea id={`business-${f.key}`} maxLength={f.max || 2000} required={f.required !== false} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <Input
                id={`business-${f.key}`}
                type={f.type || 'text'}
                min={f.min ?? (f.type === 'number' ? 1 : undefined)}
                max={f.max}
                step={f.step || 1}
                maxLength={f.type === 'text' || !f.type ? 240 : undefined}
                required={f.required !== false}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </Field>
        )
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
