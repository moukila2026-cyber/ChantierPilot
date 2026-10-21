import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate, todayIso } from '../lib/format.js';
import { STATUSES, STATUS_LABELS, STATUS_STYLES } from '../lib/constants.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, LoadingPage,
  Modal, PageHeader, Pagination, Select, Spinner, Textarea, Toast,
} from '../components/ui.jsx';

const EMPTY_PROJECT = {
  name: '', client_name: '', client_phone: '', location: '', budget: '',
  start_date: todayIso(), end_date: '', status: 'en_cours',
  retention_bps: 0, retention_release_date: '', notes: '',
};

export function ProjectForm({ initial, onSubmit, onCancel, busy, fields }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_PROJECT, ...initial }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const bps = Number(form.retention_bps) || 0;
        onSubmit({
          ...form,
          budget: form.budget === '' ? 0 : Number(form.budget),
          end_date: form.end_date || null,
          retention_bps: bps,
          retention_release_date: bps > 0 && form.retention_release_date ? form.retention_release_date : null,
        });
      }}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du chantier" htmlFor="p-name" error={fields?.name} required>
          <Input id="p-name" value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="Ex. Villa Cocody — lot 3" error={fields?.name} />
        </Field>
        <Field label="Client" htmlFor="p-client" error={fields?.client_name} required>
          <Input id="p-client" value={form.client_name} onChange={(e) => set('client_name', e.target.value)}
            placeholder="Nom du client" error={fields?.client_name} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Téléphone client (WhatsApp)" htmlFor="p-phone" error={fields?.client_phone}>
          <Input id="p-phone" value={form.client_phone || ''} onChange={(e) => set('client_phone', e.target.value)}
            placeholder="Ex. +225 07 00 00 00 00" error={fields?.client_phone} />
        </Field>
        <Field label="Localisation" htmlFor="p-loc" error={fields?.location}>
          <Input id="p-loc" value={form.location} onChange={(e) => set('location', e.target.value)}
            placeholder="Quartier, ville" error={fields?.location} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget prévisionnel (FCFA)" htmlFor="p-budget" error={fields?.budget} required
          hint="Montant entier, sans décimale.">
          <Input id="p-budget" inputMode="numeric" pattern="[0-9]*" value={form.budget}
            onChange={(e) => set('budget', e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Ex. 15000000" error={fields?.budget} />
        </Field>
        <Field label="Statut" htmlFor="p-status" error={fields?.status}>
          <Select id="p-status" value={form.status} onChange={(e) => set('status', e.target.value)} error={fields?.status}>
            {STATUSES.filter(([v]) => v !== 'archive').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de début" htmlFor="p-start" error={fields?.start_date} required>
          <Input id="p-start" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} error={fields?.start_date} />
        </Field>
        <Field label="Date de fin (optionnelle)" htmlFor="p-end" error={fields?.end_date}>
          <Input id="p-end" type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} error={fields?.end_date} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 border-t border-[#eee8db] pt-3">
        <Field label="Retenue de garantie contractuelle" htmlFor="p-ret" error={fields?.retention_bps}
          hint="Ex. 5 % ou 10 % libérables à la réception définitive.">
          <Select id="p-ret" value={String(form.retention_bps || 0)} onChange={(e) => set('retention_bps', Number(e.target.value))}>
            <option value="0">Aucune retenue (0 %)</option>
            <option value="500">5 % (retenue courante)</option>
            <option value="750">7,5 %</option>
            <option value="1000">10 % (retenue renforcée)</option>
          </Select>
        </Field>
        <Field label="Date prévue de mainlevée" htmlFor="p-ret-date" error={fields?.retention_release_date}>
          <Input
            id="p-ret-date"
            type="date"
            disabled={!Number(form.retention_bps)}
            value={form.retention_release_date || ''}
            onChange={(e) => set('retention_release_date', e.target.value)}
            error={fields?.retention_release_date}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor="p-notes" error={fields?.notes}>
        <Textarea id="p-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)}
          placeholder="Informations utiles (facultatif)" error={fields?.notes} />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" loading={busy}>{initial ? 'Enregistrer les modifications' : 'Créer le chantier'}</Button>
      </div>
    </form>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState({ loading: true, projects: [] });
  const [statusFilter, setStatusFilter] = useState('actifs');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (isAdmin && searchParams.get('nouveau') === '1') {
      setEditTarget(null);
      setFields({});
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [isAdmin, searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'tous') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('limit', '25');
      params.set('offset', String((page - 1) * 25));
      const data = await api(`/api/projects?${params.toString()}`);
      const lastPage = Math.max(1, Math.ceil(data.pagination.total / 25));
      if (page > lastPage) { setPage(lastPage); return; }
      setState({ loading: false, projects: data.projects, pagination: data.pagination });
    } catch (e) {
      setState({ loading: false, projects: [], pagination: null, error: e.message });
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const submit = async (payload) => {
    setBusy(true);
    setFields({});
    try {
      if (editTarget) {
        await api(`/api/projects/${editTarget.id}`, { method: 'PATCH', body: payload });
        setToast({ type: 'success', message: 'Chantier mis à jour.' });
      } else {
        await api('/api/projects', { method: 'POST', body: payload });
        setToast({ type: 'success', message: 'Chantier créé.' });
      }
      setModalOpen(false);
      setEditTarget(null);
      load();
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      const newStatus = archiveTarget.status === 'archive' ? 'en_cours' : 'archive';
      await api(`/api/projects/${archiveTarget.id}`, { method: 'PATCH', body: { status: newStatus } });
      setToast({ type: 'success', message: newStatus === 'archive' ? 'Chantier archivé.' : 'Chantier rouvert.' });
      setArchiveTarget(null);
      load();
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Portefeuille BTP"
        title="Chantiers"
        subtitle={isAdmin ? "Créez, suivez en FCFA et archivez l’ensemble de vos chantiers." : "Consultez les chantiers de votre entreprise et saisissez les opérations de terrain."}
        actions={isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Link to="/photos"><Button variant="secondary">📷 Photos & reçus</Button></Link>
            <Button onClick={() => { setEditTarget(null); setFields({}); setModalOpen(true); }}>+ Nouveau chantier</Button>
          </div>
        ) : <Link to="/photos"><Button>📷 Photos & reçus</Button></Link>}
      />

      <div className="cp-filter-bar mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par nom ou client…"
            aria-label="Rechercher un chantier"
            className="pl-10"
          />
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#786f63]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.15 3.15a1 1 0 01-1.42 1.42l-3.15-3.15A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
        </div>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="sm:w-48" aria-label="Filtrer par statut">
          <option value="actifs">Chantiers actifs</option>
          <option value="tous">Tous les statuts</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>

      {state.loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-amber-600" /></div>
      ) : state.error ? (
        <Alert type="error">{state.error}</Alert>
      ) : state.projects.length === 0 ? (
        <EmptyState
          title="Aucun chantier trouvé"
          message={search || statusFilter !== 'actifs' ? 'Ajustez vos filtres ou créez un nouveau chantier.' : 'Créez votre premier chantier pour démarrer.'}
          action={isAdmin ? <Button onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ Nouveau chantier</Button> : null}
        />
      ) : (
        <>
          {/* Tableau — ordinateur */}
          <Card pad={false} className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#141210] text-left text-xs font-bold uppercase tracking-wide text-[#eab956]">
                  <th className="px-5 py-3">Chantier</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="px-3 py-3">Période</th>
                  <th className="px-3 py-3 text-right">Budget</th>
                  <th className="px-3 py-3 text-right">Dépenses</th>
                  <th className="px-3 py-3 text-right">Encaissé</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ede7da]">
                {state.projects.map((p) => (
                  <tr key={p.id} className="hover:bg-[#faf7f0]">
                    <td className="px-5 py-3">
                      <Link to={`/chantiers/${p.id}`} className="font-semibold text-[#141210] hover:text-amber-700">{p.name}</Link>
                      <p className="text-xs text-[#574f45]">{p.client_name}{p.location ? ` · ${p.location}` : ''}</p>
                    </td>
                    <td className="px-3 py-3"><Badge className={STATUS_STYLES[p.status]}>{STATUS_LABELS[p.status]}</Badge></td>
                    <td className="px-3 py-3 text-xs text-[#574f45]">
                      {formatDate(p.start_date)} → {p.end_date ? formatDate(p.end_date) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{formatFcfa(p.budget)}</td>
                    <td className="px-3 py-3 text-right tabular text-rose-700">{formatFcfa(p.expenses_total)}</td>
                    <td className="px-3 py-3 text-right tabular text-emerald-700">{formatFcfa(p.payments_total)}</td>
                    <td className="px-5 py-3 text-right">
                      {isAdmin && (<div className="flex justify-end gap-1">
                        <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs"
                          onClick={() => { setEditTarget(p); setFields({}); setModalOpen(true); }}>
                          Modifier
                        </Button>
                        <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs"
                          onClick={() => setArchiveTarget(p)}>
                          {p.status === 'archive' ? 'Rouvrir' : 'Archiver'}
                        </Button>
                      </div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cartes — mobile */}
          <div className="space-y-3 md:hidden">
            {state.projects.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/chantiers/${p.id}`} className="font-semibold text-[#141210]">{p.name}</Link>
                  <Badge className={STATUS_STYLES[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-[#574f45]">{p.client_name}{p.location ? ` · ${p.location}` : ''}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[#786f63]">Budget</p>
                    <p className="font-semibold tabular text-[#1c1916]">{formatFcfa(p.budget)}</p>
                  </div>
                  <div>
                    <p className="text-[#786f63]">Dépenses</p>
                    <p className="font-semibold tabular text-rose-700">{formatFcfa(p.expenses_total)}</p>
                  </div>
                  <div>
                    <p className="text-[#786f63]">Encaissé</p>
                    <p className="font-semibold tabular text-emerald-700">{formatFcfa(p.payments_total)}</p>
                  </div>
                </div>
                {isAdmin && (<div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs"
                    onClick={() => { setEditTarget(p); setFields({}); setModalOpen(true); }}>
                    Modifier
                  </Button>
                  <Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs" onClick={() => setArchiveTarget(p)}>
                    {p.status === 'archive' ? 'Rouvrir' : 'Archiver'}
                  </Button>
                </div>)}
              </Card>
            ))}
          </div>
        </>
      )}

      <Pagination pagination={state.pagination} onPageChange={setPage} />

      <Modal
        open={modalOpen}
        title={editTarget ? `Modifier « ${editTarget.name} »` : 'Nouveau chantier'}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
      >
        <ProjectForm
          initial={editTarget ? {
            name: editTarget.name,
            client_name: editTarget.client_name,
            location: editTarget.location || '',
            budget: String(editTarget.budget),
            start_date: editTarget.start_date?.slice(0, 10),
            end_date: editTarget.end_date?.slice(0, 10) || '',
            status: editTarget.status === 'archive' ? 'en_cours' : editTarget.status,
            notes: editTarget.notes || '',
          } : null}
          fields={fields}
          busy={busy}
          onSubmit={submit}
          onCancel={() => { setModalOpen(false); setEditTarget(null); }}
        />
      </Modal>

      <ConfirmDialog
        open={!!archiveTarget}
        title={archiveTarget?.status === 'archive' ? 'Rouvrir le chantier' : 'Archiver le chantier'}
        message={
          archiveTarget?.status === 'archive'
            ? `Le chantier « ${archiveTarget?.name} » redeviendra actif et acceptera de nouvelles opérations.`
            : `Le chantier « ${archiveTarget?.name} » sera archivé : plus de nouvelles dépenses ni encaissements, mais l'historique reste consultable.`
        }
        confirmLabel={archiveTarget?.status === 'archive' ? 'Rouvrir' : 'Archiver'}
        loading={busy}
        onConfirm={toggleArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
