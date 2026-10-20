import { projectAlerts, operationalAlerts, retentionAmount } from '../../shared/alerts.js';
// GET /api/dashboard — indicateurs de l'entreprise, calculés CÔTÉ SQL.
// Aucun montant n'est jamais calculé depuis le navigateur : la base fait foi.

import { withTenant } from '../_lib/db.js';
import { sendJson, methodNotAllowed, handle } from '../_lib/http.js';
import { requireAuth, run } from '../_lib/pipeline.js';
import { optionalSql } from '../_lib/compat.js';
import { kvList } from '../_lib/kv.js';
import { CATEGORY_LABELS } from '../_lib/validate.js';
import { enrichSubcontracts } from './subcontracts.js';

function lastMonths(count = 6, today = new Date().toISOString().slice(0, 10)) {
  const [y0, m0] = today.slice(0, 7).split('-').map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      const today = new Date().toISOString().slice(0, 10);

      const data = await withTenant(ctx, async (client) => {
        const [
          totalsRes,
          perProjectRes,
          recentRes,
          byCategoryRes,
          topSuppliersRes,
          expMonthsRes,
          payMonthsRes,
          metaList,
        ] = await Promise.all([
          client.query(
            `SELECT
               COALESCE((SELECT SUM(budget) FROM projects WHERE status <> 'archive'), 0)::bigint AS budget_total,
               COALESCE((SELECT SUM(amount) FROM expenses), 0)::bigint AS expenses_total,
               COALESCE((SELECT SUM(amount) FROM payments), 0)::bigint AS payments_total,
               (SELECT COUNT(*) FROM projects WHERE status <> 'archive')::int AS active_projects,
               (SELECT COUNT(*) FROM projects)::int AS all_projects`,
          ),
          client.query(
            `SELECT p.*,
                    COALESCE(e.total, 0)::bigint AS expenses_total,
                    COALESCE(pm.total, 0)::bigint AS payments_total
             FROM projects p
             LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM expenses GROUP BY project_id) e ON e.project_id = p.id
             LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM payments GROUP BY project_id) pm ON pm.project_id = p.id
             WHERE p.status <> 'archive'
             ORDER BY p.created_at DESC`,
          ),
          client.query(
            `SELECT * FROM (
               SELECT e.id, 'depense'::text AS kind, e.expense_date AS date, e.amount,
                      e.description AS label, p.name AS project_name, e.created_at
               FROM expenses e JOIN projects p ON p.id = e.project_id
               UNION ALL
               SELECT pm.id, 'encaissement'::text, pm.payment_date, pm.amount,
                      pm.memo, p.name, pm.created_at
               FROM payments pm JOIN projects p ON p.id = pm.project_id
             ) t ORDER BY t.created_at DESC LIMIT 8`,
          ),
          client.query(
            `SELECT e.category, COALESCE(SUM(e.amount), 0)::bigint AS amount, COUNT(*)::int AS count
             FROM expenses e JOIN projects p ON p.id = e.project_id
             WHERE p.status <> 'archive'
             GROUP BY e.category
             ORDER BY amount DESC`,
          ),
          client.query(
            `SELECT TRIM(e.supplier) AS supplier, COALESCE(SUM(e.amount), 0)::bigint AS amount, COUNT(*)::int AS count
             FROM expenses e JOIN projects p ON p.id = e.project_id
             WHERE p.status <> 'archive' AND TRIM(e.supplier) <> ''
             GROUP BY TRIM(e.supplier)
             ORDER BY amount DESC
             LIMIT 5`,
          ),
          client.query(
            `SELECT to_char(e.expense_date, 'YYYY-MM') AS month, COALESCE(SUM(e.amount), 0)::bigint AS amount
             FROM expenses e JOIN projects p ON p.id = e.project_id
             WHERE p.status <> 'archive' AND e.expense_date >= (CURRENT_DATE - INTERVAL '6 months')
             GROUP BY 1`,
          ),
          client.query(
            `SELECT to_char(pm.payment_date, 'YYYY-MM') AS month, COALESCE(SUM(pm.amount), 0)::bigint AS amount
             FROM payments pm JOIN projects p ON p.id = pm.project_id
             WHERE p.status <> 'archive' AND pm.payment_date >= (CURRENT_DATE - INTERVAL '6 months')
             GROUP BY 1`,
          ),
          kvList(client, ctx, 'project_meta'),
        ]);

        const metaMap = new Map(metaList.map((m) => [m.id, m]));
        const perProject = perProjectRes.rows.map((p) => {
          const m = metaMap.get(p.id);
          return {
            ...p,
            client_phone: p.client_phone || m?.client_phone || '',
            retention_bps: Number(p.retention_bps ?? m?.retention_bps ?? 0),
            retention_release_date: p.retention_release_date ?? m?.retention_release_date ?? null,
            retention_released: Boolean(p.retention_released ?? m?.retention_released ?? false),
          };
        });

        const overdueInvoices = await optionalSql(
          client,
          'sp_dash_inv',
          async () => (
            await client.query(
              `SELECT d.id, d.project_id, d.number, d.client_name,
                      GREATEST(d.total - COALESCE(p.paid, 0) - COALESCE(c.credited, 0), 0)::bigint AS remaining
               FROM commercial_documents d
               LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments WHERE invoice_id IS NOT NULL GROUP BY invoice_id) p ON p.invoice_id = d.id
               LEFT JOIN (SELECT source_id, SUM(total) AS credited FROM commercial_documents WHERE kind = 'credit' GROUP BY source_id) c ON c.source_id = d.id
               WHERE d.kind = 'invoice' AND d.due_date < current_date
                 AND d.total - COALESCE(p.paid, 0) - COALESCE(c.credited, 0) > 0
               ORDER BY d.due_date ASC LIMIT 5`,
            )
          ).rows,
          async () => (await kvList(client, ctx, 'docs'))
            .filter((d) => {
              const due = d.due_date instanceof Date ? d.due_date.toISOString().slice(0, 10) : String(d.due_date || '').slice(0, 10);
              return d.kind === 'invoice' && due && due < today && Number(d.total) - Number(d.paid || 0) - Number(d.credited || 0) > 0;
            })
            .map((d) => ({ ...d, remaining: Math.max(0, Number(d.total) - Number(d.paid || 0) - Number(d.credited || 0)) }))
            .slice(0, 5),
        );

        const openAdvances = await optionalSql(
          client,
          'sp_dash_adv',
          async () => (
            await client.query(
              `SELECT a.id, a.project_id, p.name AS project_name,
                      (a.amount - COALESCE(SUM(e.amount), 0))::bigint AS remaining
               FROM cash_advances a
               JOIN projects p ON p.id = a.project_id
               LEFT JOIN advance_entries e ON e.advance_id = a.id
               WHERE a.status = 'open'
               GROUP BY a.id, p.name
               HAVING (a.amount - COALESCE(SUM(e.amount), 0)) > 0
               LIMIT 4`,
            )
          ).rows,
          [],
        );

        const lowStock = await optionalSql(
          client,
          'sp_dash_stock',
          async () => (
            await client.query(
              `SELECT m.project_id, i.name, i.unit, i.minimum_milli,
                      SUM(CASE WHEN m.kind = 'consume' THEN -m.quantity_milli ELSE m.quantity_milli END)::bigint AS available_milli
               FROM stock_movements m JOIN inventory_items i ON i.id = m.item_id
               WHERE i.minimum_milli > 0
               GROUP BY m.project_id, i.id
               HAVING SUM(CASE WHEN m.kind = 'consume' THEN -m.quantity_milli ELSE m.quantity_milli END) <= i.minimum_milli
               LIMIT 4`,
            )
          ).rows,
          [],
        );

        const sqlSubs = await optionalSql(
          client,
          'sp_dash_subs',
          async () => (
            await client.query(
              `SELECT s.*, p.name AS project_name
               FROM subcontracts s JOIN projects p ON p.id = s.project_id
               WHERE s.status = 'actif' AND p.status <> 'archive'`,
            )
          ).rows,
          [],
        );
        const [kvSubs, subExpRes] = await Promise.all([
          kvList(client, ctx, 'subcontracts'),
          client.query("SELECT project_id, supplier, description, amount FROM expenses WHERE category = 'sous_traitance'"),
        ]);
        const projNameMap = new Map(perProject.map((p) => [p.id, p.name]));
        const subMap = new Map();
        for (const s of kvSubs) {
          if (s.status === 'actif' && projNameMap.has(s.project_id)) {
            subMap.set(s.id, { ...s, project_name: projNameMap.get(s.project_id) });
          }
        }
        for (const s of sqlSubs) subMap.set(s.id, s);
        const overpaidSubcontracts = enrichSubcontracts([...subMap.values()], subExpRes.rows)
          .filter((s) => s.overpaid_alert);

        return {
          totals: totalsRes.rows[0],
          perProject,
          recent: recentRes.rows,
          byCategory: byCategoryRes.rows,
          topSuppliers: topSuppliersRes.rows,
          expMonths: expMonthsRes.rows,
          payMonths: payMonthsRes.rows,
          extraAlerts: operationalAlerts({ overdueInvoices, overpaidSubcontracts, openAdvances, lowStock }),
        };
      });

      const budget = Number(data.totals.budget_total);
      const expenses = Number(data.totals.expenses_total);
      const payments = Number(data.totals.payments_total);
      const retentionHeld = data.perProject.reduce(
        (sum, p) => sum + (p.retention_released ? 0 : retentionAmount(p)),
        0,
      );

      const expByMonth = new Map(data.expMonths.map((r) => [r.month, Number(r.amount)]));
      const payByMonth = new Map(data.payMonths.map((r) => [r.month, Number(r.amount)]));
      const monthlyCashflow = lastMonths(6, today).map((month) => {
        const pay = payByMonth.get(month) || 0;
        const exp = expByMonth.get(month) || 0;
        return { month, payments: pay, expenses: exp, net: pay - exp };
      });

      sendJson(res, 200, {
        totals: {
          budget_total: budget,
          expenses_total: expenses,
          payments_total: payments,
          reste_a_encaisser: budget - payments,
          resultat_provisionnel: payments - expenses,
          ecart_budget: budget - expenses,
          retention_held: retentionHeld,
          active_projects: data.totals.active_projects,
          all_projects: data.totals.all_projects,
        },
        alerts: [...projectAlerts(data.perProject, today), ...data.extraAlerts]
          .sort((a, b) => (a.kind === 'danger' ? 0 : 1) - (b.kind === 'danger' ? 0 : 1)),
        analytics: {
          by_category: data.byCategory.map((r) => ({
            category: r.category,
            label: CATEGORY_LABELS[r.category] || r.category,
            amount: Number(r.amount),
            count: r.count,
          })),
          top_suppliers: data.topSuppliers.map((r) => ({
            supplier: r.supplier,
            amount: Number(r.amount),
            count: r.count,
          })),
          monthly_cashflow: monthlyCashflow,
        },
        projects: data.perProject,
        recent: data.recent,
        notice: 'Résultat provisoire = encaissements déclarés − dépenses enregistrées. Les encaissements sont des déclarations documentées par une référence ; ils ne sont prouvés qu\'avec un justificatif joint.',
      });
    });
  });
}
