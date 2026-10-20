import { checkQuota } from '../../_lib/billing.js';
// GET /api/projects — liste des chantiers (avec totaux calculés en SQL).
// POST /api/projects — création d'un chantier (avec retenue de garantie & WhatsApp optionnels).

import { withTenant } from '../../_lib/db.js';
import { projectCreateSchema, parseOrThrow, STATUS_LABELS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, parseQuery, parsePagination, paginationMeta } from '../../_lib/http.js';
import { requireAuth, ensureAdmin, run, audit } from '../../_lib/pipeline.js';
import { optionalSql } from '../../_lib/compat.js';
import { kvList, kvPut } from '../../_lib/kv.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://local');
        const q = parseQuery(req, url);
        const status = q.status && !['tous', 'actifs'].includes(q.status) ? q.status : null;
        const search = q.q ? q.q.trim().slice(0, 80) : null;
        const activeOnly = q.status === 'actifs';
        const page = parsePagination(q);

        const result = await withTenant(ctx, async (client) => {
          const where = `($1::text IS NULL OR p.status = $1)
            AND (NOT $2::boolean OR p.status <> 'archive')
            AND ($3::text IS NULL OR p.name ILIKE '%' || $3 || '%' OR p.client_name ILIKE '%' || $3 || '%')`;
          const params = [status, activeOnly, search];
          const [{ rows }, countResult, metaList] = await Promise.all([
            client.query(
              `SELECT p.*,
                      COALESCE(e.total, 0)::bigint AS expenses_total,
                      COALESCE(pm.total, 0)::bigint AS payments_total
               FROM projects p
               LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM expenses GROUP BY project_id) e
                 ON e.project_id = p.id
               LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM payments GROUP BY project_id) pm
                 ON pm.project_id = p.id
               WHERE ${where}
               ORDER BY (p.status = 'archive'), p.created_at DESC, p.id DESC
               LIMIT $4 OFFSET $5`,
              [...params, page.limit, page.offset],
            ),
            client.query(`SELECT COUNT(*)::int AS total FROM projects p WHERE ${where}`, params),
            kvList(client, ctx, 'project_meta'),
          ]);
          const metaMap = new Map(metaList.map((m) => [m.id, m]));
          const enriched = rows.map((p) => {
            const m = metaMap.get(p.id);
            return {
              ...p,
              client_phone: p.client_phone || m?.client_phone || '',
              retention_bps: Number(p.retention_bps ?? m?.retention_bps ?? 0),
              retention_release_date: p.retention_release_date ?? m?.retention_release_date ?? null,
              retention_released: Boolean(p.retention_released ?? m?.retention_released ?? false),
            };
          });
          return { rows: enriched, total: countResult.rows[0].total };
        });

        return sendJson(res, 200, {
          projects: result.rows,
          pagination: paginationMeta(page.limit, page.offset, result.total),
          labels: { status: STATUS_LABELS },
        });
      }

      if (req.method === 'POST') {
        if (!ensureAdmin(ctx, res)) return;
        const data = parseOrThrow(projectCreateSchema, await readJsonBody(req));
        const project = await withTenant(ctx, async (client) => {
          if (!['archive', 'termine'].includes(data.status)) await checkQuota(client, ctx, 'projects');
          const insertedExt = await optionalSql(
            client,
            'sp_proj_create_ext',
            async () => (
              await client.query(
                `INSERT INTO projects (
                   company_id, name, client_name, client_phone, location, budget,
                   start_date, end_date, status, notes,
                   retention_bps, retention_release_date, retention_released, created_by
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                 RETURNING *`,
                [
                  ctx.companyId, data.name, data.client_name, data.client_phone || '',
                  data.location, data.budget, data.start_date, data.end_date, data.status, data.notes,
                  data.retention_bps ?? 0, data.retention_release_date ?? null, data.retention_released ?? false,
                  ctx.userId,
                ],
              )
            ).rows[0],
            null,
          );

          let row = insertedExt;
          if (!row) {
            row = (
              await client.query(
                `INSERT INTO projects (company_id, name, client_name, location, budget, start_date, end_date, status, notes, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [ctx.companyId, data.name, data.client_name, data.location, data.budget,
                  data.start_date, data.end_date, data.status, data.notes, ctx.userId],
              )
            ).rows[0];
            const meta = {
              client_phone: data.client_phone || '',
              retention_bps: data.retention_bps ?? 0,
              retention_release_date: data.retention_release_date ?? null,
              retention_released: data.retention_released ?? false,
            };
            await kvPut(client, ctx, 'project_meta', row.id, meta);
            row = { ...row, ...meta };
          }
          await audit(client, ctx, 'creation', 'chantier', row.id, `Chantier « ${data.name} » créé`);
          return row;
        });
        return sendJson(res, 201, { project });
      }

      return methodNotAllowed(res, 'GET, POST');
    });
  });
}

export const LABELS = { STATUS_LABELS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS };
