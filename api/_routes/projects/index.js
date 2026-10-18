// GET /api/projects — liste des chantiers (avec totaux calculés en SQL).
// POST /api/projects — création d'un chantier.

import { withTenant } from '../../_lib/db.js';
import { projectCreateSchema, parseOrThrow, STATUS_LABELS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, parseQuery, parsePagination, paginationMeta } from '../../_lib/http.js';
import { requireAuth, run, audit } from '../../_lib/pipeline.js';

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
          const [{ rows }, countResult] = await Promise.all([
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
          ]);
          return { rows, total: countResult.rows[0].total };
        });

        return sendJson(res, 200, {
          projects: result.rows,
          pagination: paginationMeta(page.limit, page.offset, result.total),
          labels: { status: STATUS_LABELS },
        });
      }

      if (req.method === 'POST') {
        const data = parseOrThrow(projectCreateSchema, await readJsonBody(req));
        const project = await withTenant(ctx, async (client) => {
          const { rows } = await client.query(
            `INSERT INTO projects (company_id, name, client_name, location, budget, start_date, end_date, status, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [ctx.companyId, data.name, data.client_name, data.location, data.budget,
              data.start_date, data.end_date, data.status, data.notes, ctx.userId],
          );
          await audit(client, ctx, 'creation', 'chantier', rows[0].id, `Chantier « ${data.name} » créé`);
          return rows[0];
        });
        return sendJson(res, 201, { project });
      }

      return methodNotAllowed(res, 'GET, POST');
    });
  });
}

export const LABELS = { STATUS_LABELS, CATEGORY_LABELS, PAYMENT_METHOD_LABELS };
