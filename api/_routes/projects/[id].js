import { checkQuota } from '../../_lib/billing.js';
// GET /api/projects/:id — fiche complète (infos, totaux, retenue de garantie, sous-traitants, analyse & historique).
// PATCH /api/projects/:id — modification / archivage / réouverture / mainlevée de retenue.

import { withTenant } from '../../_lib/db.js';
import { projectUpdateSchema, parseOrThrow, STATUS_LABELS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, fail } from '../../_lib/http.js';
import { requireAuth, ensureAdmin, run, audit } from '../../_lib/pipeline.js';
import { optionalSql } from '../../_lib/compat.js';
import { kvGet, kvList, kvPut } from '../../_lib/kv.js';
import { enrichSubcontracts } from '../subcontracts.js';

function computeTotals(project, expenses, payments) {
  const budget = Number(project.budget);
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const retentionBps = Number(project.retention_bps || 0);
  const retentionAmount = Math.round((budget * retentionBps) / 10000);
  const retentionLocked = project.retention_released ? 0 : retentionAmount;
  return {
    budget,
    expenses_total: expensesTotal,
    payments_total: paymentsTotal,
    reste_a_encaisser: budget - paymentsTotal,
    resultat_provisionnel: paymentsTotal - expensesTotal,
    ecart_budget: budget - expensesTotal,
    retention_amount: retentionAmount,
    retention_locked: retentionLocked,
    collectible_remaining: Math.max(0, budget - retentionLocked - paymentsTotal),
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
          const rawProject = p.rows[0];
          if (!rawProject) return null;

          const meta = await kvGet(client, ctx, 'project_meta', id);
          const project = {
            ...rawProject,
            client_phone: rawProject.client_phone || meta?.client_phone || '',
            retention_bps: Number(rawProject.retention_bps ?? meta?.retention_bps ?? 0),
            retention_release_date: rawProject.retention_release_date ?? meta?.retention_release_date ?? null,
            retention_released: Boolean(rawProject.retention_released ?? meta?.retention_released ?? false),
          };

          const [expensesRes, paymentsRes, timelineRes, byCatRes, topSupRes, kvSubs] = await Promise.all([
            client.query(
              `SELECT e.id, e.company_id, e.project_id, e.category, e.amount, e.expense_date,
                      e.supplier, e.description,
                      (e.receipt IS NOT NULL) AS has_receipt,
                      e.receipt_filename, e.receipt_mime, e.receipt_size,
                      e.created_by, e.created_at, e.updated_at,
                      u.full_name AS created_by_name
               FROM expenses e LEFT JOIN app_users u ON u.id = e.created_by
               WHERE e.project_id = $1 ORDER BY e.expense_date DESC, e.created_at DESC`,
              [id],
            ),
            client.query(
              `SELECT p.id, p.company_id, p.project_id, p.client_name, p.amount, p.payment_date,
                      p.reference, p.payment_method, p.memo,
                      (p.proof IS NOT NULL) AS has_proof,
                      p.proof_filename, p.proof_mime, p.created_by, p.created_at, p.updated_at,
                      u.full_name AS created_by_name
               FROM payments p LEFT JOIN app_users u ON u.id = p.created_by
               WHERE p.project_id = $1 ORDER BY p.payment_date DESC, p.created_at DESC`,
              [id],
            ),
            client.query(
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
            ),
            client.query(
              `SELECT category, COALESCE(SUM(amount), 0)::bigint AS amount, COUNT(*)::int AS count
               FROM expenses WHERE project_id = $1
               GROUP BY category ORDER BY amount DESC`,
              [id],
            ),
            client.query(
              `SELECT TRIM(supplier) AS supplier, COALESCE(SUM(amount), 0)::bigint AS amount, COUNT(*)::int AS count
               FROM expenses WHERE project_id = $1 AND TRIM(supplier) <> ''
               GROUP BY TRIM(supplier) ORDER BY amount DESC LIMIT 5`,
              [id],
            ),
            kvList(client, ctx, 'subcontracts'),
          ]);
          const sqlSubs = await optionalSql(
            client,
            'sp_proj_subs',
            async () => (await client.query('SELECT * FROM subcontracts WHERE project_id = $1 ORDER BY created_at DESC', [id])).rows,
            [],
          );

          let commercial = null;
          if (ctx.role === 'admin') {
            commercial = await optionalSql(client, 'sp_project_commercial', async () => (
              await client.query(`SELECT
                (SELECT total FROM commercial_documents WHERE project_id=$1 AND kind='quote' AND status='accepted' LIMIT 1) AS contract_total,
                (SELECT estimated_cost FROM commercial_documents WHERE project_id=$1 AND kind='quote' AND status='accepted' LIMIT 1) AS estimated_cost,
                COALESCE((SELECT SUM(CASE WHEN kind='credit' THEN -total ELSE total END) FROM commercial_documents WHERE project_id=$1 AND kind IN ('invoice','credit')),0)::bigint AS billed,
                COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=$1 AND invoice_id IS NOT NULL),0)::bigint AS allocated_payments,
                COALESCE((SELECT SUM(amount) FROM purchase_orders WHERE project_id=$1 AND status='approved'),0)::bigint AS committed_purchases,
                COALESCE((SELECT SUM(cost) FROM attendance WHERE project_id=$1 AND status='pending'),0)::bigint AS pending_labor,
                (SELECT count(*) FROM site_tasks WHERE project_id=$1 AND kind='reserve' AND status<>'validated')::int AS open_reserves`, [id])
            ).rows[0], null);
          }

          const subMap = new Map();
          for (const s of kvSubs) if (s.project_id === id) subMap.set(s.id, s);
          for (const s of sqlSubs) subMap.set(s.id, s);
          const subExpenses = expensesRes.rows.filter((e) => e.category === 'sous_traitance');
          const subcontracts = enrichSubcontracts([...subMap.values()], subExpenses);

          return {
            project,
            expenses: expensesRes.rows,
            payments: paymentsRes.rows,
            timeline: timelineRes.rows,
            commercial,
            subcontracts,
            analytics: {
              by_category: byCatRes.rows.map((r) => ({
                category: r.category,
                label: CATEGORY_LABELS[r.category] || r.category,
                amount: Number(r.amount),
                count: r.count,
              })),
              top_suppliers: topSupRes.rows.map((r) => ({
                supplier: r.supplier,
                amount: Number(r.amount),
                count: r.count,
              })),
            },
          };
        });

        if (!data) return fail(res, 404, 'introuvable', 'Chantier introuvable.');
        return sendJson(res, 200, {
          ...data,
          totals: computeTotals(data.project, data.expenses, data.payments),
          labels: { status: STATUS_LABELS, category: CATEGORY_LABELS, payment_method: PAYMENT_METHOD_LABELS },
        });
      }

      if (req.method === 'PATCH') {
        if (!ensureAdmin(ctx, res)) return;
        const data = parseOrThrow(projectUpdateSchema, await readJsonBody(req));
        const project = await withTenant(ctx, async (client) => {
          const current = (await client.query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
          if (!current) return null;

          if (['archive', 'termine'].includes(current.status) && data.status && !['archive', 'termine'].includes(data.status)) {
            await checkQuota(client, ctx, 'projects');
          }

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
          const prevMeta = await kvGet(client, ctx, 'project_meta', id);
          const nextReleaseDate = data.retention_release_date === undefined
            ? (current.retention_release_date ?? prevMeta?.retention_release_date ?? null)
            : data.retention_release_date;

          const updatedExt = await optionalSql(
            client,
            'sp_proj_patch_ext',
            async () => (
              await client.query(
                `UPDATE projects SET
                   name                   = COALESCE($2, name),
                   client_name            = COALESCE($3, client_name),
                   client_phone           = COALESCE($4, client_phone),
                   location               = COALESCE($5, location),
                   budget                 = COALESCE($6, budget),
                   start_date             = COALESCE($7, start_date),
                   end_date               = $8,
                   status                 = $9,
                   notes                  = COALESCE($10, notes),
                   archived_at            = $11,
                   retention_bps          = COALESCE($12, retention_bps),
                   retention_release_date = $13,
                   retention_released     = COALESCE($14, retention_released)
                 WHERE id = $1
                 RETURNING *`,
                [
                  id, data.name ?? null, data.client_name ?? null, data.client_phone ?? null,
                  data.location ?? null, data.budget ?? null, data.start_date ?? null,
                  endDate, status, data.notes ?? null, archivedAt,
                  data.retention_bps ?? null, nextReleaseDate, data.retention_released ?? null,
                ],
              )
            ).rows[0],
            null,
          );

          let row = updatedExt;
          if (!row) {
            row = (
              await client.query(
                `UPDATE projects SET
                   name        = COALESCE($2, name),
                   client_name = COALESCE($3, client_name),
                   location    = COALESCE($4, location),
                   budget      = COALESCE($5, budget),
                   start_date  = COALESCE($6, start_date),
                   end_date    = $7,
                   status      = $8,
                   notes       = COALESCE($9, notes),
                   archived_at = $10
                 WHERE id = $1
                 RETURNING *`,
                [id, data.name ?? null, data.client_name ?? null, data.location ?? null,
                  data.budget ?? null, data.start_date ?? null, endDate, status,
                  data.notes ?? null, archivedAt],
              )
            ).rows[0];
            const meta = {
              client_phone: data.client_phone ?? prevMeta?.client_phone ?? '',
              retention_bps: data.retention_bps ?? prevMeta?.retention_bps ?? 0,
              retention_release_date: nextReleaseDate,
              retention_released: data.retention_released ?? prevMeta?.retention_released ?? false,
            };
            await kvPut(client, ctx, 'project_meta', id, meta);
            row = { ...row, ...meta };
          }

          await audit(
            client, ctx, status !== current.status ? 'changement_statut' : 'modification',
            'chantier', id, `Chantier « ${row.name} » — statut : ${STATUS_LABELS[status]}`,
          );
          return row;
        });

        if (!project) return fail(res, 404, 'introuvable', 'Chantier introuvable.');
        return sendJson(res, 200, { project });
      }

      return methodNotAllowed(res, 'GET, PATCH');
    });
  });
}
