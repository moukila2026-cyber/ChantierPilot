// GET/PATCH /api/company — profil de l'entreprise (utilisé dans le rapport PDF).

import { withTenant } from '../_lib/db.js';
import { companyUpdateSchema, parseOrThrow } from '../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle } from '../_lib/http.js';
import { requireAuth, ensureAdmin, run, audit } from '../_lib/pipeline.js';
import { optionalSql } from '../_lib/compat.js';
import { kvGet, kvPut } from '../_lib/kv.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const company = await withTenant(ctx, async (client) => {
          const row = (await client.query('SELECT * FROM companies WHERE id = $1', [ctx.companyId])).rows[0];
          const extra = await kvGet(client, ctx, 'company_meta', ctx.companyId);
          return {
            ...row,
            tax_number: row?.tax_number || extra?.tax_number || '',
            tax_regime: row?.tax_regime || extra?.tax_regime || '',
          };
        });
        return sendJson(res, 200, { company });
      }

      if (req.method === 'PATCH') {
        if (!ensureAdmin(ctx, res)) return;
        const data = parseOrThrow(companyUpdateSchema, await readJsonBody(req));
        const company = await withTenant(ctx, async (client) => {
          const updatedExt = await optionalSql(client, 'sp_company_patch_ext', async () => (
            await client.query(
              `UPDATE companies SET
                 name       = COALESCE($2, name),
                 rccm       = COALESCE($3, rccm),
                 phone      = COALESCE($4, phone),
                 email      = COALESCE($5, email),
                 address    = COALESCE($6, address),
                 city       = COALESCE($7, city),
                 tax_number = COALESCE($8, tax_number),
                 tax_regime = COALESCE($9, tax_regime)
               WHERE id = $1
               RETURNING *`,
              [ctx.companyId, data.name ?? null, data.rccm ?? null, data.phone ?? null,
                data.email ?? null, data.address ?? null, data.city ?? null, data.tax_number ?? null, data.tax_regime ?? null],
            )
          ).rows[0], null);
          let row = updatedExt;
          if (!row) {
            row = (await client.query(
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
            )).rows[0];
            const prev = await kvGet(client, ctx, 'company_meta', ctx.companyId);
            const extra = {
              tax_number: data.tax_number ?? prev?.tax_number ?? '',
              tax_regime: data.tax_regime ?? prev?.tax_regime ?? '',
            };
            await kvPut(client, ctx, 'company_meta', ctx.companyId, extra);
            row = { ...row, ...extra };
          }
          await audit(client, ctx, 'modification', 'entreprise', ctx.companyId, 'Profil entreprise mis à jour');
          return row;
        });
        return sendJson(res, 200, { company });
      }

      return methodNotAllowed(res, 'GET, PATCH');
    });
  });
}
