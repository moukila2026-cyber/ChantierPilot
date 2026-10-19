import { checkQuota } from '../../_lib/billing.js';
// PATCH /api/team/:id — administrateur uniquement :
//   * activer / désactiver un compte agent (la désactivation coupe
//     immédiatement ses sessions : api_lookup_session exige is_active) ;
//   * réinitialiser son mot de passe (toutes ses sessions sont révoquées) ;
//   * corriger son nom.
// Aucune suppression définitive : les comptes sont conservés pour la traçabilité.

import { withTenant } from '../../_lib/db.js';
import { hashPassword } from '../../_lib/auth.js';
import { teamUpdateSchema, parseOrThrow } from '../../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, fail } from '../../_lib/http.js';
import { requireAdmin, run, audit } from '../../_lib/pipeline.js';

const PUBLIC_COLS = 'id, full_name, email, role, is_active, created_at, updated_at';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'PATCH') return methodNotAllowed(res, 'PATCH');
    await run(res, async () => {
      const ctx = await requireAdmin(req, res);
      if (!ctx) return;
      const id = req.query?.id || req.url.split('/').filter(Boolean).pop()?.split('?')[0];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(id || '')) return fail(res, 404, 'introuvable', 'Compte introuvable.');

      const data = parseOrThrow(teamUpdateSchema, await readJsonBody(req));
      if (id === ctx.userId && data.is_active === false) {
        return fail(res, 422, 'action_interdite', 'Vous ne pouvez pas désactiver votre propre compte administrateur.');
      }

      const passwordHash = data.password ? await hashPassword(data.password) : null;

      const user = await withTenant(ctx, async (client) => {
        const current = (await client.query(
          'SELECT id, full_name, email, role FROM app_users WHERE id = $1 AND company_id = $2',
          [id, ctx.companyId],
        )).rows[0];
        if (!current) return null;
        if (current.role === 'admin' && id !== ctx.userId) {
          const err = new Error('Un administrateur ne peut pas modifier le compte d’un autre administrateur.');
          err.status = 403; err.code = 'droits_insuffisants';
          throw err;
        }
        if (data.is_active === true) {
          const active = (await client.query('SELECT is_active FROM app_users WHERE id=$1', [id])).rows[0];
          if (!active.is_active) await checkQuota(client, ctx, 'users');
        }
        const { rows } = await client.query(
          `UPDATE app_users SET
             full_name = COALESCE($2, full_name),
             is_active = COALESCE($3, is_active),
             password_hash = COALESCE($4, password_hash),
             failed_login_attempts = CASE WHEN $4::text IS NOT NULL THEN 0 ELSE failed_login_attempts END,
             locked_until = CASE WHEN $4::text IS NOT NULL THEN NULL ELSE locked_until END
           WHERE id = $1 AND company_id = $5
           RETURNING ${PUBLIC_COLS}`,
          [id, data.full_name ?? null, data.is_active ?? null, passwordHash, ctx.companyId],
        );
        // Révocation des sessions de l'agent : désactivation ou nouveau mot de passe.
        if (data.is_active === false || passwordHash) {
          await client.query('SELECT api_admin_revoke_sessions($1)', [id]);
        }
        const actions = [];
        if (data.is_active === false) actions.push('désactivé');
        if (data.is_active === true) actions.push('réactivé');
        if (passwordHash) actions.push('mot de passe réinitialisé');
        if (data.full_name) actions.push('nom corrigé');
        await audit(client, ctx, 'modification', 'utilisateur', id,
          `Compte « ${current.full_name} » (${current.email}) : ${actions.join(', ') || 'modifié'}`);
        return rows[0];
      });

      if (!user) return fail(res, 404, 'introuvable', 'Compte introuvable.');
      return sendJson(res, 200, { user });
    });
  });
}
