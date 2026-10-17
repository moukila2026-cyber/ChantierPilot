import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatFcfa, formatDate } from '../lib/format.js';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/constants.js';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Input, LoadingPage,
  Modal, PageHeader, Select, Spinner, Toast,
} from '../components/ui.jsx';
import { ExpenseForm } from '../components/forms.jsx';

export default function ExpensesPage() {
  const [state, setState] = useState({ loading: true, expenses: [], projects: [] });
  const [filters, setFilters] = useState({ project_id: '', category: '', from: '', to: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const params = new URLSearchParams();
      if (filters.project_id) params.set('project_id', filters.project_id);
      if (filters.category) params.set('category', filters.category);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const [expensesData, projectsData] = await Promise.all([
        api(`/api/expenses?${params.toString()}`),
        api('/api/projects?status=tous'),
      ]);
      setState({
        loading: false,
        expenses: expensesData.expenses,
        projects: projectsData.projects.filter((p) => p.status !== 'archive' || filters.project_id === p.id),
      });
    } catch (e) {
      setState({ loading: false, expenses: [], projects: [], error: e.message });
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 250);
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

  const total = state.expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <PageHeader
        title="Dépenses"
        subtitle="Toutes les dépenses de votre entreprise, tous chantiers confondus."
        actions={<Button onClick={() => { setEditTarget(null); setFields({}); setModalOpen(true); }} disabled={state.projects.length === 0}>+ Nouvelle dépense</Button>}
      />

      {state.projects.length === 0 && !state.loading && (
        <div className="mb-4">
          <Alert type="info">
            Créez d'abord un chantier pour enregistrer des dépenses.{' '}
            <Link to="/chantiers" className="font-semibold underline">Aller aux chantiers</Link>
          </Alert>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={filters.project_id} onChange={(e) => setFilters({ ...filters, project_id: e.target.value })} aria-label="Filtrer par chantier">
            <option value="">Tous les chantiers</option>
            {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} aria-label="Filtrer par catégorie">
            <option value="">Toutes les catégories</option>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="Date de début" />
          <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="Date de fin" />
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
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Chantier</th>
                  <th className="px-3 py-3">Catégorie</th>
                  <th className="px-3 py-3">Fournisseur / description</th>
                  <th className="px-3 py-3 text-right">Montant</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(e.expense_date)}</td>
                    <td className="px-3 py-3">
                      <Link to={`/chantiers/${e.project_id}`} className="font-medium text-slate-800 hover:text-amber-700">{e.project_name}</Link>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{CATEGORY_LABELS[e.category] || e.category}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{e.supplier || '—'}</p>
                      <p className="text-xs text-slate-500">{e.description}</p>
                      {e.has_receipt && (
                        <a className="text-xs font-medium text-amber-700 hover:underline" href={`/api/files?kind=expense&id=${e.id}`} target="_blank" rel="noreferrer">
                          📎 Justificatif
                        </a>
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
                        <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs text-rose-600"
                          onClick={() => setConfirm({ url: `/api/expenses/${e.id}` })}>Supprimer</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-200 px-5 py-3 text-right text-sm font-bold tabular text-slate-900">
              Total affiché : {formatFcfa(total)}
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {state.expenses.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{CATEGORY_LABELS[e.category] || e.category}</p>
                    <Link to={`/chantiers/${e.project_id}`} className="text-xs text-slate-500 hover:text-amber-700">{e.project_name}</Link>
                  </div>
                  <p className="font-semibold tabular text-rose-700">{formatFcfa(e.amount)}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(e.expense_date)} · {e.supplier || '—'}</p>
                {e.description && <p className="mt-1 text-xs text-slate-600">{e.description}</p>}
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs"
                    onClick={() => {
                      setEditTarget({ ...e, amount: String(e.amount), expense_date: e.expense_date?.slice(0, 10), receipt: null });
                      setFields({}); setModalOpen(true);
                    }}>Modifier</Button>
                  <Button variant="secondary" className="min-h-9 flex-1 py-1 text-xs text-rose-600"
                    onClick={() => setConfirm({ url: `/api/expenses/${e.id}` })}>Supprimer</Button>
                </div>
              </Card>
            ))}
            <p className="text-center text-sm font-bold tabular text-slate-700">Total : {formatFcfa(total)}</p>
          </div>
        </>
      )}

      <Modal open={modalOpen} title={editTarget ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={() => { setModalOpen(false); setEditTarget(null); }}>
        <ExpenseForm
          projects={state.projects} initial={editTarget} fields={fields} busy={busy}
          onSubmit={submit} onCancel={() => { setModalOpen(false); setEditTarget(null); }}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="Supprimer cette dépense ?"
        message="La dépense sera supprimée définitivement de l'historique."
        confirmLabel="Supprimer"
        loading={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
