import { withTenant } from '../_lib/db.js';
import { handle, readJsonBody, sendJson, fail } from '../_lib/http.js';
import { requireAdmin, run } from '../_lib/pipeline.js';
import { optionalSql, throwIfMissingSchemaWrite } from '../_lib/compat.js';

export default async function handler(req, res) {
  return handle(req, res, () => run(res, async () => {
    const ctx = await requireAdmin(req, res);
    if (!ctx) return;
    if (req.method === 'GET') {
      const companies = await withTenant(ctx, async client => optionalSql(
        client,
        'sp_operator_list',
        async () => (await client.query('SELECT api_operator_list() AS companies')).rows[0].companies,
        null,
      ));
      if (companies === null) return fail(res, 403, 'droits_insuffisants', 'Accès réservé aux opérateurs.');
      return sendJson(res, 200, { companies });
    }
    const data = await readJsonBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(data.company_id || '') || typeof data.suspended !== 'boolean' || typeof data.reason !== 'string' || data.reason.trim().length < 5 || data.reason.length > 500) return fail(res, 422, 'donnees_invalides', 'Entreprise, statut et motif (5 à 500 caractères) obligatoires.');
    await withTenant(ctx, async client => {
      try {
        await client.query('SELECT api_operator_suspend($1,$2,$3)', [data.company_id, data.suspended, data.reason.trim()]);
      } catch (err) {
        throwIfMissingSchemaWrite(err);
        throw err;
      }
    });
    return sendJson(res, 200, { ok: true });
  }));
}
