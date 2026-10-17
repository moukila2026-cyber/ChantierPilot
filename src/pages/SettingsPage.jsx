import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import {
  Alert, Button, Card, Field, Input, LoadingPage, PageHeader, PasswordInput, Spinner, Toast,
} from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const EXPORTS = [
  ['/api/export?scope=projects&format=csv', 'Chantiers (CSV)'],
  ['/api/export?scope=expenses&format=csv', 'Dépenses (CSV)'],
  ['/api/export?scope=payments&format=csv', 'Encaissements (CSV)'],
  ['/api/export?scope=all&format=csv', 'Export complet (CSV)'],
  ['/api/export?scope=all&format=json', 'Sauvegarde JSON'],
];

const ACTION_LABELS = {
  creation: 'Création',
  modification: 'Modification',
  suppression: 'Suppression',
  changement_statut: 'Changement de statut',
};

export default function SettingsPage() {
  const { user, company, refresh } = useAuth();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);
  const [auditRows, setAuditRows] = useState(null);
  const [health, setHealth] = useState(null);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        rccm: company.rccm || '',
        phone: company.phone || '',
        email: company.email || '',
        address: company.address || '',
        city: company.city || '',
      });
    }
  }, [company]);

  useEffect(() => {
    api('/api/audit').then((d) => setAuditRows(d.audit)).catch(() => setAuditRows([]));
    api('/api/health').then(setHealth).catch(() => setHealth(null));
  }, []);

  if (!form) return <LoadingPage />;

  const saveCompany = async (e) => {
    e.preventDefault();
    setBusy(true); setFields({});
    try {
      await api('/api/company', { method: 'PATCH', body: form });
      await refresh();
      setToast({ type: 'success', message: 'Profil de l\'entreprise mis à jour.' });
    } catch (err) {
      setFields(err.fields || {});
      setToast({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true); setPwError(null);
    try {
      const r = await api('/api/auth/password', { method: 'POST', body: pw });
      setToast({ type: 'success', message: r.message });
      setPw({ current_password: '', new_password: '' });
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Paramètres" subtitle="Profil de l'entreprise, sécurité, exports et journal d'activité." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold text-slate-900">Profil de l'entreprise</h2>
          <p className="mt-1 text-sm text-slate-500">Ces informations apparaissent en tête des rapports PDF.</p>
          <form className="mt-4 space-y-4" onSubmit={saveCompany} noValidate>
            <Field label="Nom de l'entreprise" htmlFor="s-name" error={fields.name} required>
              <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ville" htmlFor="s-city" error={fields.city}>
                <Input id="s-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} error={fields.city} />
              </Field>
              <Field label="Téléphone" htmlFor="s-phone" error={fields.phone}>
                <Input id="s-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={fields.phone} />
              </Field>
            </div>
            <Field label="E-mail professionnel" htmlFor="s-email" error={fields.email}>
              <Input id="s-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fields.email} />
            </Field>
            <Field label="Adresse" htmlFor="s-address" error={fields.address}>
              <Input id="s-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} error={fields.address} />
            </Field>
            <Field label="RCCM" htmlFor="s-rccm" error={fields.rccm}>
              <Input id="s-rccm" value={form.rccm} onChange={(e) => setForm({ ...form, rccm: e.target.value })} error={fields.rccm} />
            </Field>
            <Button type="submit" loading={busy}>Enregistrer</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="font-bold text-slate-900">Mon compte</h2>
            <p className="mt-1 text-sm text-slate-500">{user?.full_name} · {user?.email} · rôle : {user?.role === 'admin' ? 'administrateur' : 'membre'}</p>
            <form className="mt-4 space-y-4" onSubmit={changePassword} noValidate>
              {pwError && <Alert type="error">{pwError}</Alert>}
              <Field label="Mot de passe actuel" htmlFor="pw-current" required>
                <PasswordInput id="pw-current" autoComplete="current-password" value={pw.current_password}
                  onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
              </Field>
              <Field label="Nouveau mot de passe" htmlFor="pw-new" required hint="Au moins 10 caractères, avec une lettre et un chiffre.">
                <PasswordInput id="pw-new" autoComplete="new-password" value={pw.new_password}
                  onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              </Field>
              <Button type="submit" loading={pwBusy} variant="secondary">Changer le mot de passe</Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-bold text-slate-900">Export &amp; sauvegarde</h2>
            <p className="mt-1 text-sm text-slate-500">
              Exportez vos données à tout moment (uniquement celles de votre entreprise).
              Pour une sauvegarde complète serveur, voir docs/SAUVEGARDES.md.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXPORTS.map(([href, label]) => (
                <a key={href} href={href} download
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {label}
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Journal d'activité</h2>
          {health && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              health.database === 'ok' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              Base de données : {health.database === 'ok' ? 'connectée' : 'indisponible'} · pilote {health.driver}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Traçabilité des actions réalisées dans votre espace (créations, modifications, suppressions).
        </p>
        {auditRows === null ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-amber-600" /></div>
        ) : auditRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Aucune activité enregistrée.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {auditRows.slice(0, 25).map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">{ACTION_LABELS[row.action] || row.action}</span>
                    {' · '}{row.summary || row.entity}
                  </p>
                  <p className="text-xs text-slate-500">{row.actor ? `par ${row.actor}` : ''}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatDate(row.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
