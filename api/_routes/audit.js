// GET /api/audit — journal d'audit de l'entreprise (lecture seule).

import { withTenant } from '../_lib/db.js';
import { sendJson, methodNotAllowed, handle, parseQuery, parsePagination, paginationMeta } from '../_lib/http.js';
import { requireAuth, ensureAdmin, run } from '../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      if (!ensureAdmin(ctx, res)) return;

      const url = new URL(req.url, 'http://local');
      const page = parsePagination(parseQuery(req, url));
      const result = await withTenant(ctx, async (client) => {
        const [{ rows }, countResult] = await Promise.all([
          client.query(
            `SELECT a.id, a.action, a.entity, a.entity_id, a.summary, a.created_at,
                    u.full_name AS actor
             FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id
             WHERE a.company_id = $1
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT $2 OFFSET $3`,
            [ctx.companyId, page.limit, page.offset],
          ),
          client.query('SELECT COUNT(*)::int AS total FROM audit_log WHERE company_id = $1', [ctx.companyId]),
        ]);
        return { rows, total: countResult.rows[0].total };
      });

      sendJson(res, 200, {
        audit: result.rows,
        pagination: paginationMeta(page.limit, page.offset, result.total),
      });
    });
  });
}
