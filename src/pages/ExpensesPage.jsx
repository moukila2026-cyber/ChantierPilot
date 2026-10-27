import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate } from '../lib/format.js';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants.js';
import {
  ButtonLink, Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader,
  Pagination, Select, Spinner, StatCard, Toast,
} from '../components/ui.jsx';
import { ExpenseForm } from '../components/forms.jsx';
import { AttachmentPreviewModal } from '../components/AttachmentPreviewModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ExpensesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState({ loading: true, expenses: [], projects: [], summary: null });
  const [filters, setFilters] = useState({ q: '', project_id: '', category: '', from: '', to: '' });
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
      if (filters.category) params.set('category', filters.category);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      params.set('limit', '25');
      params.set('offset', String((page - 1) * 25));
      const [expensesData, projectsData] = await Promise.all([
        api(`/api/expenses?${params.toString()}`),
        api('/api/projects?status=tous&limit=100'),
      ]);
      const lastPage = Math.max(1, Math.ceil(expensesData.pagination.total / 25));
      if (page > lastPage) { setPage(lastPage); return; }
      setState({
        loading: false,
        expenses: expensesData.expenses,
        summary: expensesData.summary,
        pagination: expensesData.pagination,
        projects: projectsData.projects.filter((p) => p.status !== 'archive' || filters.project_id === p.id),
      });
    } catch (e) {
      setState({ loading: false, expenses: [], projects: [], summary: null, pagination: null, error: e.message });
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
        category: payload.category,
        amount: payload.amount,
        expense_date: payload.expense_date,
        supplier: payload.supplier,
        description: payload.description,
        receipt: payload.receipt,
      };
      if (editTarget) {
        await api(`/api/expenses/${editTarget.id}`, { method: 'PATCH', body });
        setToast({ type: 'success', message: 'Dépense mise à jour.' });
      } else {
        await api('/api/expenses', { method: 'POST', body });
        setToast({ type: 'success', message: 'Dépense enregistrée.' });
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
      setToast({ type: 'success', message: 'Dépense supprimée.' });
      setConfirm(null); load();
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const pageTotal = state.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const filteredTotal = state.summary?.total_amount ?? pageTotal;
  const filteredCount = state.summary?.count ?? state.expenses.length;
  const withProofCount = state.summary?.with_proof_count ?? state.expenses.filter((e) => e.has_receipt).length;
  const hasActiveFilters = Boolean(filters.q || filters.project_id || filters.category || filters.from || filters.to);

  return (
    <div>
      <PageHeader
        eyebrow="Trésorerie & Achats"
        title="Dépenses"
        subtitle="Toutes les dépenses de votre entreprise, avec recherche instantanée et photos de reçus."
        actions={(
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/photos" variant="secondary">📷 Photos & reçus</ButtonLink>
            <Button onClick={() => { setEditTarget(null); setFields({}); setModalOpen(true); }} disabled={state.projects.length === 0}>+ Nouvelle dépense</Button>
          </div>
        )}
      />

      {state.projects.length === 0 && !state.loading && (
        <div className="mb-4">
          <Alert type="info">
            Créez d’abord un chantier pour enregistrer des dépenses.{' '}
            <Link to="/chantiers" className="font-semibold underline">Aller aux chantiers</Link>
          </Alert>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard featured label={hasActiveFilters ? 'Total des dépenses filtrées' : 'Total cumulé des dépenses'} value={formatFcfa(filteredTotal)} />
        <StatCard label="Nombre d’écritures" value={filteredCount} sub={hasActiveFilters ? 'Périmètre filtré actif' : 'Tous chantiers'} />
        <StatCard label="Pièces justificatives jointes" value={`${withProofCount} / ${filteredCount}`} tone="green" sub="Bons, factures ou photos" />
      </div>

      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-60 flex-1">
            <Input
              value={filters.q}
              onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }}
              placeholder="Rechercher un fournisseur, matériau, libellé ou chantier…"
              aria-label="Rechercher dans les dépenses"
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="secondary"
              onClick={() => { setFilters({ q: '', project_id: '', category: '', from: '', to: '' }); setPage(1); }}
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
          <Select value={filters.category} onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }} aria-label="Filtrer par catégorie">
            <option value="">Toutes les catégories</option>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} aria-label="Date de début" />
          <Input type="date" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} aria-label="Date de fin" />
        </div>
      </Card>

      {state.loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-amber-600" /></div>
      ) : state.error ? (
        <Alert type="error">{state.error}</Alert>
      ) : state.expenses.length === 0 ? (
        <EmptyState
          title="Aucune dépense trouvée"
          message="Modifiez vos filtres ou enregistrez une nouvelle dépense."
          action={state.projects.length > 0 ? <Button onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ Nouvelle dépense</Button> : null}
        />
      ) : (
        <>
          <Card pad={false} className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#141210] text-left text-xs font-bold uppercase tracking-wide text-[#eab956]">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Chantier</th>
                  <th className="px-3 py-3">Catégorie</th>
                  <th className="px-3 py-3">Fournisseur / description</th>
                  <th className="px-3 py-3 text-right">Montant</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ede7da]">
                {state.expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-[#faf7f0]">
                    <td className="px-5 py-3 whitespace-nowrap text-[#574f45]">{formatDate(e.expense_date)}</td>
                    <td className="px-3 py-3">
                      <Link to={`/chantiers/${e.project_id}`} className="font-medium text-[#1c1916] hover:text-amber-700">{e.project_name}</Link>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className="bg-[#f3eee3] text-[#2c2721] ring-[#ded7c7]">{CATEGORY_LABELS[e.category] || e.category}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-[#1c1916]">{e.supplier || '—'}</p>
                      <p className="text-xs text-[#574f45]">{e.description}</p>
                      {e.has_receipt && (
                        <div className="mt-1 flex items-center gap-3 text-xs font-semibold text-amber-800">
                          <button
                            type="button"
                            className="underline hover:text-[#141210]"
                            onClick={() => setPreview({
                              url: `/api/files?kind=expense&id=${e.id}`,
                              filename: e.receipt_filename,
                              mime: e.receipt_mime,
                              title: `${e.supplier || 'Dépense'} — ${formatFcfa(e.amount)}`,
                            })}
                          >
                            👁 Aperçu du justificatif
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
                            setEditTarget({ ...e, amount: String(e.amount), expense_date: e.expense_date?.slice(0, 10), receipt: null });
                            setFields({}); setModalOpen(true);
                          }}>Modifier</Button>
                        {isAdmin && (<Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                          onClick={() => setConfirm({ url: `/api/expenses/${e.id}` })}>Supprimer</Button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ded7c7] px-5 py-3 text-sm font-bold tabular text-[#141210]">
              <span className="text-xs font-medium text-[#574f45]">Page affichée : {formatFcfa(pageTotal)}</span>
              <span>Total filtré : {formatFcfa(filteredTotal)}</span>
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {state.expenses.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#141210]">{CATEGORY_LABELS[e.category] || e.category}</p>
                    <Link to={`/chantiers/${e.project_id}`} className="text-xs text-[#574f45] hover:text-amber-700">{e.project_name}</Link>
                  </div>
                  <p className="font-semibold tabular text-rose-700">{formatFcfa(e.amount)}</p>
                </div>
                <p className="mt-1 text-xs text-[#574f45]">{formatDate(e.expense_date)} · {e.supplier || '—'}</p>
                {e.description && <p className="mt-1 text-xs text-[#574f45]">{e.description}</p>}
                {e.has_receipt && (
                  <button
                    type="button"
                    className="mt-1.5 text-xs font-semibold text-amber-800 underline"
                    onClick={() => setPreview({
                      url: `/api/files?kind=expense&id=${e.id}`,
                      filename: e.receipt_filename,
                      mime: e.receipt_mime,
                      title: `${e.supplier || 'Dépense'} — ${formatFcfa(e.amount)}`,
                    })}
                  >
                    👁 Voir le justificatif
                  </button>
                )}
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs"
                    onClick={() => {
                      setEditTarget({ ...e, amount: String(e.amount), expense_date: e.expense_date?.slice(0, 10), receipt: null });
                      setFields({}); setModalOpen(true);
                    }}>Modifier</Button>
                  {isAdmin && (<Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs text-rose-600"
                    onClick={() => setConfirm({ url: `/api/expenses/${e.id}` })}>Supprimer</Button>)}
                </div>
              </Card>
            ))}
            <p className="text-center text-sm font-bold tabular text-[#2c2721]">Total filtré : {formatFcfa(filteredTotal)}</p>
          </div>
        </>
      )}

      <Pagination pagination={state.pagination} onPageChange={setPage} />

      <Modal open={modalOpen} title={editTarget ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={() => { setModalOpen(false); setEditTarget(null); }}>
        <ExpenseForm
          projects={state.projects} initial={editTarget} fields={fields} busy={busy}
          onSubmit={submit} onCancel={() => { setModalOpen(false); setEditTarget(null); }}
        />
      </Modal>

      <AttachmentPreviewModal item={preview} onClose={() => setPreview(null)} />

      <ConfirmDialog
        open={!!confirm}
        title="Supprimer cette dépense ?"
        message="La dépense sera supprimée définitivement de l’historique."
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
