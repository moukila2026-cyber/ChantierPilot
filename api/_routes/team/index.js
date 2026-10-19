// GET /api/team — liste des comptes de l'entreprise (administrateur uniquement).
// POST /api/team — création d'un compte agent (« member ») par l'administrateur.
// Aucun compte n'est créé manuellement en base : tout passe par cette API,
// avec hachage du mot de passe, journalisation et cloisonnement RLS.

import crypto from 'node:crypto';
import { withTenant } from '../../_lib/db.js';
import { hashPassword } from '../../_lib/auth.js';
import { teamCreateSchema, parseOrThrow } from '../../_lib/validate.js';
import { readJsonBody, rateLimit, sendJson, methodNotAllowed, handle, fail } from '../../_lib/http.js';
import { requireAdmin, run, audit } from '../../_lib/pipeline.js';

const PUBLIC_COLS = 'id, full_name, email, role, is_active, created_at, updated_at';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAdmin(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const users = await withTenant(ctx, async (client) => {
          const { rows } = await client.query(
            `SELECT ${PUBLIC_COLS} FROM app_users WHERE company_id = $1 ORDER BY (role = 'admin') DESC, created_at ASC`,
            [ctx.companyId],
          );
          return rows;
        });
        return sendJson(res, 200, { users });
      }

      if (req.method === 'POST') {
        const rl = rateLimit(req, 'team-create', 20, 60 * 60 * 1000);
        if (!rl.ok) {
          res.setHeader('Retry-After', String(rl.retryAfter));
          return fail(res, 429, 'trop_de_tentatives', `Trop de créations de comptes. Réessayez dans ${rl.retryAfter} s.`);
        }
        const data = parseOrThrow(teamCreateSchema, await readJsonBody(req));
        const passwordHash = await hashPassword(data.password);
        const userId = crypto.randomUUID();
        try {
          const user = await withTenant(ctx, async (client) => {
            const { rows } = await client.query(
              `INSERT INTO app_users (id, company_id, email, password_hash, full_name, role, auth_provider)
               VALUES ($1, $2, $3, $4, $5, 'member', 'local')
               RETURNING ${PUBLIC_COLS}`,
              [userId, ctx.companyId, data.email, passwordHash, data.full_name],
            );
            await audit(client, ctx, 'creation', 'utilisateur', rows[0].id,
              `Compte agent « ${data.full_name} » (${data.email}) créé`);
            return rows[0];
          });
          return sendJson(res, 201, { user });
        } catch (err) {
          if (err.code === '23505') {
            return fail(res, 409, 'email_deja_utilise', 'Un compte existe déjà avec cette adresse e-mail.');
          }
          throw err;
        }
      }

      return methodNotAllowed(res, 'GET, POST');
    });
  });
}
