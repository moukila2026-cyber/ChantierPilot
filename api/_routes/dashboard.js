// GET /api/dashboard — indicateurs de l'entreprise, calculés CÔTÉ SQL.
// Aucun montant n'est jamais calculé depuis le navigateur : la base fait foi.

import { withTenant } from '../_lib/db.js';
import { sendJson, methodNotAllowed, handle } from '../_lib/http.js';
import { requireAuth, run } from '../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      const data = await withTenant(ctx, async (client) => {
        const totals = (await client.query(
          `SELECT
             COALESCE((SELECT SUM(budget) FROM projects WHERE status <> 'archive'), 0)::bigint AS budget_total,
             COALESCE((SELECT SUM(amount) FROM expenses), 0)::bigint AS expenses_total,
             COALESCE((SELECT SUM(amount) FROM payments), 0)::bigint AS payments_total,
             (SELECT COUNT(*) FROM projects WHERE status <> 'archive')::int AS active_projects,
             (SELECT COUNT(*) FROM projects)::int AS all_projects`,
        )).rows[0];

        const perProject = (await client.query(
          `SELECT p.id, p.name, p.client_name, p.status, p.budget, p.start_date, p.end_date, p.location,
                  COALESCE(e.total, 0)::bigint AS expenses_total,
                  COALESCE(pm.total, 0)::bigint AS payments_total
           FROM projects p
           LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM expenses GROUP BY project_id) e ON e.project_id = p.id
           LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM payments GROUP BY project_id) pm ON pm.project_id = p.id
           WHERE p.status <> 'archive'
           ORDER BY p.created_at DESC`,
        )).rows;

        const recent = (await client.query(
          `SELECT * FROM (
             SELECT e.id, 'depense'::text AS kind, e.expense_date AS date, e.amount,
                    e.description AS label, p.name AS project_name, e.created_at
             FROM expenses e JOIN projects p ON p.id = e.project_id
             UNION ALL
             SELECT pm.id, 'encaissement'::text, pm.payment_date, pm.amount,
                    pm.memo, p.name, pm.created_at
             FROM payments pm JOIN projects p ON p.id = pm.project_id
           ) t ORDER BY t.created_at DESC LIMIT 8`,
        )).rows;

        return { totals, perProject, recent };
      });

      const budget = Number(data.totals.budget_total);
      const expenses = Number(data.totals.expenses_total);
      const payments = Number(data.totals.payments_total);

      sendJson(res, 200, {
        totals: {
          budget_total: budget,
          expenses_total: expenses,
          payments_total: payments,
          reste_a_encaisser: budget - payments,
          resultat_provisionnel: payments - expenses,
          ecart_budget: budget - expenses,
          active_projects: data.totals.active_projects,
          all_projects: data.totals.all_projects,
        },
        projects: data.perProject,
        recent: data.recent,
        notice: 'Résultat provisoire = encaissements déclarés − dépenses enregistrées. Les encaissements sont des déclarations documentées par une référence ; ils ne sont prouvés qu\'avec un justificatif joint.',
      });
    });
  });
}
