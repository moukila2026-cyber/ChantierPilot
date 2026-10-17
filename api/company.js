// GET/PATCH /api/company — profil de l'entreprise (utilisé dans le rapport PDF).

import { withTenant } from '../_lib/db.js';
import { companyUpdateSchema, parseOrThrow } from '../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle } from '../_lib/http.js';
import { requireAuth, run, audit } from '../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const company = await withTenant(ctx, async (client) => {
          const { rows } = await client.query('SELECT * FROM companies WHERE id = $1', [ctx.companyId]);
          return rows[0];
        });
        return sendJson(res, 200, { company });
      }

      if (req.method === 'PATCH') {
        const data = parseOrThrow(companyUpdateSchema, await readJsonBody(req));
        const company = await withTenant(ctx, async (client) => {
          const { rows } = await client.query(
            `UPDATE companies SET
               name    = COALESCE($2, name),
               rccm    = COALESCE($3, rccm),
               phone   = COALESCE($4, phone),
               email   = COALESCE($5, email),
               address = COALESCE($6, address),
               city    = COALESCE($7, city)
             WHERE id = $1
             RETURNING *`,
            [ctx.companyId, data.name ?? null, data.rccm ?? null, data.phone ?? null,
              data.email ?? null, data.address ?? null, data.city ?? null],
          );
          await audit(client, ctx, 'modification', 'entreprise', ctx.companyId, 'Profil entreprise mis à jour');
          return rows[0];
        });
        return sendJson(res, 200, { company });
      }

      return methodNotAllowed(res, 'GET, PATCH');
    });
  });
}
