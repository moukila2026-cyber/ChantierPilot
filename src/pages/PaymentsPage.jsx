import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate } from '../lib/format.js';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../lib/constants.js';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader,
  Pagination, Select, Spinner, StatCard, Toast,
} from '../components/ui.jsx';
import { PaymentForm } from '../components/forms.jsx';
import { AttachmentPreviewModal } from '../components/AttachmentPreviewModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PaymentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState({ loading: true, payments: [], projects: [], summary: null });
  const [filters, setFilters] = useState({ q: '', project_id: '', method: '', from: '', to: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!state.loading && searchParams.get('nouveau') === '1') {
      if (state.projects.length > 0) {
        setEditTarget(null);
        setFields({});
        setModalOpen(true);
      }
      setSearchParams({}, { replace: true });
    }
  }, [state.loading, state.projects.length, searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.project_id) params.set('project_id', filters.project_id);
      if (filters.method) params.set('method', filters.method);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      params.set('limit', '25');
      params.set('offset', String((page - 1) * 25));
      const [paymentsData, projectsData] = await Promise.all([
        api(`/api/payments?${params.toString()}`),
        api('/api/projects?status=tous&limit=100'),
      ]);
      const lastPage = Math.max(1, Math.ceil(paymentsData.pagination.total / 25));
      if (page > lastPage) { setPage(lastPage); return; }
      setState({
        loading: false,
        payments: paymentsData.payments,
        summary: paymentsData.summary,
        pagination: paymentsData.pagination,
        projects: projectsData.projects.filter((p) => p.status !== 'archive' || filters.project_id === p.id),
      });
    } catch (e) {
      setState({ loading: false, payments: [], projects: [], summary: null, pagination: null, error: e.message });
    }
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(load, 220);
    return () => clearTimeout(t);
  }, [load]);

  const submit = async (payload) => {
    setBusy(true); setFields({});
    try {
      const body = {
        project_id: payload.project_id,
        client_name: payload.client_name,
        amount: payload.amount,
        payment_date: payload.payment_date,
        reference: payload.reference,
        payment_method: payload.payment_method,
        memo: payload.memo,
        proof: payload.proof,
      };
      if (editTarget) {
        await api(`/api/payments/${editTarget.id}`, { method: 'PATCH', body });
        setToast({ type: 'success', message: 'Encaissement mis à jour.' });
      } else {
        await api('/api/payments', { method: 'POST', body });
        setToast({ type: 'success', message: 'Encaissement enregistré (déclaration documentée).' });
      }
      setModalOpen(false); setEditTarget(null); load();
    } catch (e) {
      setFields(e.fields || {});
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(confirm.url, { method: 'DELETE' });
      setToast({ type: 'success', message: 'Encaissement supprimé.' });
      setConfirm(null); load();
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const pageTotal = state.payments.reduce((s, p) => s + Number(p.amount), 0);
  const filteredTotal = state.summary?.total_amount ?? pageTotal;
  const filteredCount = state.summary?.count ?? state.payments.length;
  const withProofCount = state.summary?.with_proof_count ?? state.payments.filter((p) => p.has_proof).length;
  const hasActiveFilters = Boolean(filters.q || filters.project_id || filters.method || filters.from || filters.to);

  return (
    <div>
      <PageHeader
        title="Encaissements"
        subtitle="Paiements clients déclarés, documentés par une référence — prouvés lorsqu’un justificatif est joint."
        actions={<Button onClick={() => { setEditTarget(null); setFields({}); setModalOpen(true); }} disabled={state.projects.length === 0}>+ Nouvel encaissement</Button>}
      />

      {state.projects.length === 0 && !state.loading && (
        <div className="mb-4">
          <Alert type="info">
            Créez d’abord un chantier pour enregistrer des encaissements.{' '}
            <Link to="/chantiers" className="font-semibold underline">Aller aux chantiers</Link>
          </Alert>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard featured label={hasActiveFilters ? 'Total des encaissements filtrés' : 'Total cumulé des encaissements'} value={formatFcfa(filteredTotal)} />
        <StatCard label="Règlements enregistrés" value={filteredCount} sub={hasActiveFilters ? 'Périmètre filtré actif' : 'Tous chantiers'} />
        <StatCard label="Prouvés par justificatif" value={`${withProofCount} / ${filteredCount}`} tone="green" sub="Reçus, chèques ou captures" />
      </div>

      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-60 flex-1">
            <Input
              value={filters.q}
              onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }}
              placeholder="Rechercher un client, n° de reçu, transaction Mobile Money ou chantier…"
              aria-label="Rechercher dans les encaissements"
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="secondary"
              onClick={() => { setFilters({ q: '', project_id: '', method: '', from: '', to: '' }); setPage(1); }}
            >
              Réinitialiser
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={filters.project_id} onChange={(e) => { setFilters({ ...filters, project_id: e.target.value }); setPage(1); }} aria-label="Filtrer par chantier">
            <option value="">Tous les chantiers</option>
            {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={filters.method} onChange={(e) => { setFilters({ ...filters, method: e.target.value }); setPage(1); }} aria-label="Filtrer par mode">
            <option value="">Tous les modes</option>
            {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} aria-label="Date de début" />
          <Input type="date" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} aria-label="Date de fin" />
        </div>
      </Card>

      {state.loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-amber-600" /></div>
      ) : state.error ? (
        <Alert type="error">{state.error}</Alert>
      ) : state.payments.length === 0 ? (
        <EmptyState
          title="Aucun encaissement trouvé"
          message="Modifiez vos filtres ou enregistrez un nouvel encaissement."
          action={state.projects.length > 0 ? <Button onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ Nouvel encaissement</Button> : null}
        />
      ) : (
        <>
          <Card pad={false} className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#141210] text-left text-xs font-bold uppercase tracking-wide text-[#eab956]">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Chantier / client</th>
                  <th className="px-3 py-3">Référence / mode</th>
                  <th className="px-3 py-3 text-right">Montant</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(p.payment_date)}</td>
                    <td className="px-3 py-3">
                      <Link to={`/chantiers/${p.project_id}`} className="font-medium text-slate-800 hover:text-amber-700">{p.project_name}</Link>
                      <p className="text-xs text-slate-500">{p.client_name}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{p.reference}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</Badge>
                        <Badge className={p.has_proof ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>
                          {p.has_proof ? 'Prouvé' : 'Déclaré'}
                        </Badge>
                      </div>
                      {p.has_proof && (
                        <div className="mt-1 flex items-center gap-3 text-xs font-semibold text-amber-800">
                          <button
                            type="button"
                            className="underline hover:text-slate-900"
                            onClick={() => setPreview({
                              url: `/api/files?kind=proof&id=${p.id}`,
                              filename: p.proof_filename,
                              mime: p.proof_mime,
                              title: `${p.client_name} — ${formatFcfa(p.amount)}`,
                            })}
                          >
                            👁 Aperçu
                          </button>
                          <a className="hover:underline" href={`/api/files?kind=proof&id=${p.id}`} target="_blank" rel="noreferrer">
                            Télécharger
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular text-emerald-700">{formatFcfa(p.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs"
                          onClick={() => {
                            setEditTarget({ ...p, amount: String(p.amount), payment_date: p.payment_date?.slice(0, 10), proof: null });
                            setFields({}); setModalOpen(true);
                          }}>Modifier</Button>
                        {isAdmin && (<Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                          onClick={() => setConfirm({ url: `/api/payments/${p.id}` })}>Supprimer</Button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-sm font-bold tabular text-slate-900">
              <span className="text-xs font-medium text-slate-500">Page affichée : {formatFcfa(pageTotal)}</span>
              <span>Total filtré : {formatFcfa(filteredTotal)}</span>
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {state.payments.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.client_name}</p>
                    <Link to={`/chantiers/${p.project_id}`} className="text-xs text-slate-500 hover:text-amber-700">{p.project_name}</Link>
                  </div>
                  <p className="font-semibold tabular text-emerald-700">{formatFcfa(p.amount)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(p.payment_date)} · {p.reference}</p>
                <Badge className={`mt-1 ${p.has_proof ? 'bg-emerald-100 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                  {p.has_proof ? 'Justificatif joint' : 'Déclaré (référence)'}
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
                    👁 Aperçu
                  </button>
                )}
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs"
                    onClick={() => {
                      setEditTarget({ ...p, amount: String(p.amount), payment_date: p.payment_date?.slice(0, 10), proof: null });
                      setFields({}); setModalOpen(true);
                    }}>Modifier</Button>
                  {isAdmin && (<Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs text-rose-600"
                    onClick={() => setConfirm({ url: `/api/payments/${p.id}` })}>Supprimer</Button>)}
                </div>
              </Card>
            ))}
            <p className="text-center text-sm font-bold tabular text-slate-700">Total filtré : {formatFcfa(filteredTotal)}</p>
          </div>
        </>
      )}

      <Pagination pagination={state.pagination} onPageChange={setPage} />

      <Modal open={modalOpen} title={editTarget ? 'Modifier l’encaissement' : 'Nouvel encaissement'} onClose={() => { setModalOpen(false); setEditTarget(null); }}>
        <PaymentForm
          projects={state.projects} initial={editTarget} fields={fields} busy={busy}
          onSubmit={submit} onCancel={() => { setModalOpen(false); setEditTarget(null); }}
        />
      </Modal>

      <AttachmentPreviewModal item={preview} onClose={() => setPreview(null)} />

      <ConfirmDialog
        open={!!confirm}
        title="Supprimer cet encaissement ?"
        message="L’encaissement sera supprimé définitivement. Cette action sera tracée dans le journal d’audit."
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
