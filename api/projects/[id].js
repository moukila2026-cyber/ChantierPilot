// GET /api/projects/:id — fiche complète (infos, totaux, historique chronologique).
// PATCH /api/projects/:id — modification / archivage / réouverture.

import { withTenant } from '../_lib/db.js';
import { projectUpdateSchema, parseOrThrow, STATUS_LABELS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, fail } from '../_lib/http.js';
import { requireAuth, run, audit } from '../_lib/pipeline.js';

function computeTotals(project, expenses, payments) {
  const budget = Number(project.budget);
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  return {
    budget,
    expenses_total: expensesTotal,
    payments_total: paymentsTotal,
    reste_a_encaisser: budget - paymentsTotal,
    resultat_provisionnel: paymentsTotal - expensesTotal,
    ecart_budget: budget - expensesTotal,
  };
}

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      const id = req.query?.id || req.url.split('/').filter(Boolean).pop()?.split('?')[0];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(id || '')) {
        return fail(res, 404, 'introuvable', 'Chantier introuvable.');
      }

      if (req.method === 'GET') {
        const data = await withTenant(ctx, async (client) => {
          const p = await client.query('SELECT * FROM projects WHERE id = $1', [id]);
          const project = p.rows[0];
          if (!project) return null;

          const expenses = (await client.query(
            `SELECT e.*, u.full_name AS created_by_name
             FROM expenses e LEFT JOIN app_users u ON u.id = e.created_by
             WHERE e.project_id = $1 ORDER BY e.expense_date DESC, e.created_at DESC`,
            [id],
          )).rows;

          const payments = (await client.query(
            `SELECT p.id, p.company_id, p.project_id, p.client_name, p.amount, p.payment_date,
                    p.reference, p.payment_method, p.memo,
                    (p.proof IS NOT NULL) AS has_proof,
                    p.proof_filename, p.created_by, p.created_at, p.updated_at,
                    u.full_name AS created_by_name
             FROM payments p LEFT JOIN app_users u ON u.id = p.created_by
             WHERE p.project_id = $1 ORDER BY p.payment_date DESC, p.created_at DESC`,
            [id],
          )).rows;

          const timeline = (await client.query(
            `SELECT * FROM (
               SELECT e.id::text AS id, 'depense'::text AS kind, e.expense_date AS date, e.amount,
                      e.description AS label, e.supplier AS detail, NULL::text AS reference,
                      e.created_at, u.full_name AS actor
               FROM expenses e LEFT JOIN app_users u ON u.id = e.created_by
               WHERE e.project_id = $1
               UNION ALL
               SELECT p.id::text, 'encaissement'::text, p.payment_date, p.amount,
                      p.memo, p.client_name, p.reference, p.created_at, u.full_name
               FROM payments p LEFT JOIN app_users u ON u.id = p.created_by
               WHERE p.project_id = $1
               UNION ALL
               SELECT 'audit-' || a.id::text, 'evenement'::text, a.created_at::date, NULL::bigint,
                      a.summary, a.action, NULL::text, a.created_at, u.full_name
               FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id
               WHERE a.entity = 'chantier' AND a.entity_id = $1
             ) t
             ORDER BY t.date DESC, t.created_at DESC`,
            [id],
          )).rows;

          return { project, expenses, payments, timeline };
        });

        if (!data) return fail(res, 404, 'introuvable', 'Chantier introuvable.');
        return sendJson(res, 200, {
          ...data,
          totals: computeTotals(data.project, data.expenses, data.payments),
          labels: { status: STATUS_LABELS, category: CATEGORY_LABELS, payment_method: PAYMENT_METHOD_LABELS },
        });
      }

      if (req.method === 'PATCH') {
        const data = parseOrThrow(projectUpdateSchema, await readJsonBody(req));
        const project = await withTenant(ctx, async (client) => {
          const current = (await client.query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
          if (!current) return null;

          // Cohérence des dates : on vérifie le couple final.
          const startDate = data.start_date ?? current.start_date;
          const endDate = data.end_date === undefined ? current.end_date : data.end_date;
          if (endDate && endDate < startDate) {
            const err = new Error('La date de fin doit être postérieure à la date de début.');
            err.status = 422; err.code = 'dates_incoherentes';
            err.fields = { end_date: 'La date de fin doit être postérieure à la date de début.' };
            throw err;
          }

          const status = data.status ?? current.status;
          const archivedAt = status === 'archive' ? (current.archived_at || new Date()) : null;

          const { rows } = await client.query(
            `UPDATE projects SET
               name = COALESCE($2, name),
               client_name = COALESCE($3, client_name),
               location = COALESCE($4, location),
               budget = COALESCE($5, budget),
               start_date = COALESCE($6, start_date),
               end_date = $7,
               status = $8,
               notes = COALESCE($9, notes),
               archived_at = $10
             WHERE id = $1
             RETURNING *`,
            [id, data.name ?? null, data.client_name ?? null, data.location ?? null,
              data.budget ?? null, data.start_date ?? null, endDate, status,
              data.notes ?? null, archivedAt],
          );
          await audit(client, ctx, status !== current.status ? 'changement_statut' : 'modification',
            'chantier', id, `Chantier « ${rows[0].name} » — statut : ${STATUS_LABELS[status]}`);
          return rows[0];
        });

        if (!project) return fail(res, 404, 'introuvable', 'Chantier introuvable.');
        return sendJson(res, 200, { project });
      }

      return methodNotAllowed(res, 'GET, PATCH');
    });
  });
}
