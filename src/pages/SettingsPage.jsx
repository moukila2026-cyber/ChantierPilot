import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import {
  Alert, Button, Card, Field, Input, LoadingPage, PageHeader, Pagination, PasswordInput, Spinner, Toast,
} from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const EXPORTS = [
  ['/api/export?scope=projects&format=csv', 'Chantiers (CSV)'],
  ['/api/export?scope=expenses&format=csv', 'Dépenses (CSV)'],
  ['/api/export?scope=payments&format=csv', 'Encaissements (CSV)'],
  ['/api/export?scope=all&format=csv', 'Export complet (CSV)'],
  ['/api/export?scope=all&format=json', 'Export JSON (partiel)'],
];

const ACTION_LABELS = {
  creation: 'Création',
  modification: 'Modification',
  suppression: 'Suppression',
  changement_statut: 'Changement de statut',
};


function TeamSection({ onToast }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const load = useCallback(() => {
    api('/api/team').then((d) => setUsers(d.users)).catch((err) => {
      setUsers([]);
      onToast({ type: 'error', message: err.message });
    });
  }, [onToast]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault(); setBusy(true); setFields({});
    try {
      await api('/api/team', { method: 'POST', body: form });
      setForm({ full_name: '', email: '', password: '' });
      onToast({ type: 'success', message: 'Compte agent créé. Transmettez-lui son mot de passe par un canal sûr (jamais dans ChantierPilot), il pourra le changer dans ses Paramètres.' });
      load();
    } catch (err) { setFields(err.fields || {}); onToast({ type: 'error', message: err.message }); }
    finally { setBusy(false); }
  };

  const patchUser = async (id, body, message) => {
    try {
      await api(`/api/team/${id}`, { method: 'PATCH', body });
      onToast({ type: 'success', message });
      load();
      return true;
    } catch (err) {
      onToast({ type: 'error', message: err.message });
      return false;
    }
  };

  const resetPassword = async (event, id) => {
    event.preventDefault();
    if (resetBusy) return;
    setResetBusy(true);
    try {
      const saved = await patchUser(id, { password: newPassword }, 'Mot de passe réinitialisé : ses anciennes sessions sont déconnectées.');
      if (saved) { setResetFor(null); setNewPassword(''); }
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <Card className="mt-6">
      <h2 className="font-bold text-[#141210]">Équipe — comptes agents</h2>
      <p className="mt-1 text-sm text-[#574f45]">
        Seul l’administrateur peut créer, désactiver ou réinitialiser un compte.
        Un agent voit les chantiers de l’entreprise, saisit dépenses et encaissements
        et joint des justificatifs. Il ne peut ni supprimer, ni gérer les chantiers,
        les réglages, les exports ou les autres comptes.
      </p>
      <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={create} noValidate>
        <Field label="Nom complet de l’agent" htmlFor="t-name" error={fields.full_name} required>
          <Input id="t-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={fields.full_name} />
        </Field>
        <Field label="E-mail de l’agent" htmlFor="t-email" error={fields.email} required>
          <Input id="t-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fields.email} />
        </Field>
        <Field label="Mot de passe provisoire" htmlFor="t-password" error={fields.password} required hint="10 caractères min., lettre + chiffre.">
          <PasswordInput id="t-password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div><Button type="submit" loading={busy}>Créer le compte agent</Button></div>
      </form>
      {users === null ? (
        <div className="flex justify-center py-6"><Spinner className="h-6 w-6 text-amber-600" /></div>
      ) : (
        <ul className="mt-5 divide-y divide-[#ede7da]">
          {users.map((u) => (
            <li key={u.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#1c1916]">{u.full_name} <span className="ml-1 rounded-full bg-[#f3eee3] px-2 py-0.5 text-xs text-[#574f45]">{u.role === 'admin' ? 'Administrateur' : 'Agent'}</span>{!u.is_active && <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Désactivé</span>}</p>
                  <p className="text-xs text-[#574f45]">{u.email}</p>
                </div>
                {u.role === 'member' && (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" disabled={resetBusy} onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setNewPassword(''); }}>Réinitialiser le mot de passe</Button>
                    {u.is_active
                      ? <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs text-rose-600" onClick={() => patchUser(u.id, { is_active: false }, 'Compte désactivé : ses sessions sont coupées immédiatement.')}>Désactiver</Button>
                      : <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => patchUser(u.id, { is_active: true }, 'Compte réactivé.')}>Réactiver</Button>}
                  </div>
                )}
              </div>
              {resetFor === u.id && (
                <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => resetPassword(e, u.id)}>
                  <Field label="Nouveau mot de passe provisoire" htmlFor={`rp-${u.id}`} required>
                    <PasswordInput id={`rp-${u.id}`} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </Field>
                  <Button type="submit" loading={resetBusy} className="min-h-9 px-3 py-1 text-xs">Valider</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { user, company, refresh } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);
  const [auditRows, setAuditRows] = useState(null);
  const [auditPagination, setAuditPagination] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const [health, setHealth] = useState(null);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        rccm: company.rccm || '',
        tax_number: company.tax_number || '',
        tax_regime: company.tax_regime || '',
        phone: company.phone || '',
        email: company.email || '',
        address: company.address || '',
        city: company.city || '',
      });
    }
  }, [company]);

  useEffect(() => {
    if (!isAdmin) { setAuditRows([]); setAuditPagination(null); return; }
    api(`/api/audit?limit=25&offset=${(auditPage - 1) * 25}`)
      .then((d) => {
        const lastPage = Math.max(1, Math.ceil(d.pagination.total / 25));
        if (auditPage > lastPage) { setAuditPage(lastPage); return; }
        setAuditRows(d.audit);
        setAuditPagination(d.pagination);
      })
      .catch(() => { setAuditRows([]); setAuditPagination(null); });
    api('/api/health').then(setHealth).catch(() => setHealth(null));
  }, [auditPage, isAdmin]);

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
          <h2 className="font-bold text-[#141210]">Profil de l'entreprise</h2>
          <p className="mt-1 text-sm text-[#574f45]">Ces informations apparaissent en tête des rapports PDF.</p>
          <form className="mt-4 space-y-4" onSubmit={saveCompany} noValidate><fieldset disabled={!isAdmin} className="space-y-4">
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
            <Field label="N° de compte contribuable (NCC)" htmlFor="s-tax-number" error={fields.tax_number}><Input id="s-tax-number" maxLength={100} value={form.tax_number||''} onChange={e=>setForm({...form,tax_number:e.target.value})}/></Field>
            <Field label="Régime fiscal" htmlFor="s-tax-regime" error={fields.tax_regime}><Input id="s-tax-regime" maxLength={160} value={form.tax_regime||''} onChange={e=>setForm({...form,tax_regime:e.target.value})}/></Field>
            <Field label="RCCM" htmlFor="s-rccm" error={fields.rccm}>
              <Input id="s-rccm" value={form.rccm} onChange={(e) => setForm({ ...form, rccm: e.target.value })} error={fields.rccm} />
            </Field>
            </fieldset>
            {isAdmin ? <Button type="submit" loading={busy}>Enregistrer</Button> : <p className="mt-3 text-sm text-[#574f45]">Seul l’administrateur peut modifier le profil de l’entreprise.</p>}
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="font-bold text-[#141210]">Mon compte</h2>
            <p className="mt-1 text-sm text-[#574f45]">{user?.full_name} · {user?.email} · rôle : {user?.role === 'admin' ? 'administrateur' : 'membre'}</p>
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

          {isAdmin && (<Card>
            <h2 className="font-bold text-[#141210]">Export &amp; sauvegarde</h2>
            <p className="mt-1 text-sm text-[#574f45]">
              Ces exports concernent uniquement votre entreprise ; ils sont partiels et excluent les pièces jointes.
              Ils ne remplacent pas une sauvegarde serveur restaurée et vérifiée (voir docs/SAUVEGARDES.md).
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXPORTS.map(([href, label]) => (
                <a key={href} href={href} download
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#cfc6b2] bg-white px-4 py-2 text-sm font-semibold text-[#2c2721] hover:bg-[#faf7f0]">
                  {label}
                </a>
              ))}
            </div>
          </Card>)}
        </div>
      </div>

      {isAdmin && <TeamSection onToast={setToast} />}

      {isAdmin && (<Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#141210]">Journal d'activité</h2>
          {health && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              health.database === 'ok' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              Base de données : {health.database === 'ok' ? 'connectée' : 'indisponible'} · pilote {health.driver}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[#574f45]">
          Traçabilité des actions réalisées dans votre espace (créations, modifications, suppressions).
        </p>
        {auditRows === null ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-amber-600" /></div>
        ) : auditRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#574f45]">Aucune activité enregistrée.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#ede7da]">
            {auditRows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm text-[#1c1916]">
                    <span className="font-semibold">{ACTION_LABELS[row.action] || row.action}</span>
                    {' · '}{row.summary || row.entity}
                  </p>
                  <p className="text-xs text-[#574f45]">{row.actor ? `par ${row.actor}` : ''}</p>
                </div>
                <span className="shrink-0 text-xs text-[#786f63]">{formatDate(row.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          pagination={auditPagination}
          onPageChange={(nextPage) => { setAuditRows(null); setAuditPage(nextPage); }}
        />
      </Card>)}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
