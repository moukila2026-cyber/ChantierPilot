// POST /api/auth/password — changement de mot de passe (vérifie l'ancien).

import { withTenant } from '../_lib/db.js';
import { hashPassword, verifyPassword } from '../_lib/auth.js';
import { parseOrThrow, loginSchema } from '../_lib/validate.js';
import { z } from 'zod';
import { readJsonBody, sendJson, methodNotAllowed, handle, fail } from '../_lib/http.js';
import { requireAuth, run, audit } from '../_lib/pipeline.js';

const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Mot de passe actuel requis.').max(200),
  new_password: z.string().min(10, 'Le nouveau mot de passe doit contenir au moins 10 caractères.')
    .max(200)
    .refine((s) => /[a-zà-ÿ]/i.test(s) && /\d/.test(s), 'Le mot de passe doit contenir au moins une lettre et un chiffre.'),
}).strict();

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      const data = parseOrThrow(passwordChangeSchema, await readJsonBody(req));

      const result = await withTenant(ctx, async (client) => {
        const { rows } = await client.query(
          'SELECT password_hash FROM app_users WHERE id = $1', [ctx.userId],
        );
        const user = rows[0];
        if (!user || !(await verifyPassword(data.current_password, user.password_hash))) {
          return { ok: false };
        }
        const hash = await hashPassword(data.new_password);
        await client.query('UPDATE app_users SET password_hash = $2 WHERE id = $1', [ctx.userId, hash]);
        // Révocation des autres sessions par sécurité.
        await client.query(
          'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2',
          [ctx.userId, ctx.sessionId],
        );
        await audit(client, ctx, 'modification', 'compte', ctx.userId, 'Mot de passe modifié');
        return { ok: true };
      });

      if (!result.ok) {
        return fail(res, 401, 'mot_de_passe_incorrect', 'Le mot de passe actuel est incorrect.');
      }
      sendJson(res, 200, { ok: true, message: 'Mot de passe modifié. Les autres sessions ont été déconnectées.' });
    });
  });
}
