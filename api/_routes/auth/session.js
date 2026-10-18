// GET /api/auth/session — profil de l'utilisateur connecté + son entreprise.
// Lecture strictement dans le contexte de l'entreprise (RLS).
import { withTenant } from '../../_lib/db.js';
import { sendJson, methodNotAllowed, handle } from '../../_lib/http.js';
import { requireAuth, run } from '../../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      const company = await withTenant(ctx, async (client) => {
        const { rows } = await client.query('SELECT * FROM companies WHERE id = $1', [ctx.companyId]);
        return rows[0] || null;
      });

      sendJson(res, 200, {
        user: { id: ctx.userId, full_name: ctx.fullName, email: ctx.email, role: ctx.role },
        company,
      });
    });
  });
}
