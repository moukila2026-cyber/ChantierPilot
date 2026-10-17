// GET /api/audit — journal d'audit de l'entreprise (lecture seule).

import { withTenant } from './_lib/db.js';
import { sendJson, methodNotAllowed, handle } from './_lib/http.js';
import { requireAuth, run } from './_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      const rows = await withTenant(ctx, async (client) => {
        const { rows } = await client.query(
          `SELECT a.id, a.action, a.entity, a.entity_id, a.summary, a.created_at,
                  u.full_name AS actor
           FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id
           WHERE a.company_id = $1
           ORDER BY a.created_at DESC
           LIMIT 300`,
          [ctx.companyId],
        );
        return rows;
      });

      sendJson(res, 200, { audit: rows });
    });
  });
}
