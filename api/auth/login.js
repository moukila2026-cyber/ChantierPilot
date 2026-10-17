// POST /api/auth/login — vérifie les identifiants, ouvre une session.
// Lutte contre le force brute : limitation de débit + verrouillage de compte
// persistant en base (failed_login_attempts / locked_until).

import { bootQuery, withTenant } from '../_lib/db.js';
import { verifyPassword, setSessionCookie, sha256hex, newSessionToken, SESSION_TTL_MS } from '../_lib/auth.js';
import { loginSchema, parseOrThrow } from '../_lib/validate.js';
import { readJsonBody, rateLimit, sendJson, fail, methodNotAllowed, handle } from '../_lib/http.js';
import { run } from '../_lib/pipeline.js';

const GENERIC_ERROR = 'Adresse e-mail ou mot de passe incorrect.';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    const rl = rateLimit(req, 'login', 12, 60 * 1000);
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      return fail(res, 429, 'trop_de_tentatives', `Trop de tentatives de connexion. Réessayez dans ${rl.retryAfter} s.`);
    }

    await run(res, async () => {
      const data = parseOrThrow(loginSchema, await readJsonBody(req));

      const { rows } = await bootQuery('SELECT api_lookup_user($1) AS u', [data.email]);
      const user = rows[0]?.u;

      if (!user || user.auth_provider !== 'local' || !user.password_hash) {
        await bootQuery('SELECT api_fail_login($1)', [data.email]).catch(() => {});
        return fail(res, 401, 'identifiants_incorrects', GENERIC_ERROR);
      }

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const minutes = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
        return fail(res, 429, 'compte_verrouille',
          `Trop de tentatives échouées. Le compte est temporairement verrouillé, réessayez dans ${minutes} minute(s).`);
      }

      if (!user.is_active) {
        return fail(res, 403, 'compte_desactive', 'Ce compte est désactivé. Contactez l\'administrateur de votre entreprise.');
      }

      const ok = await verifyPassword(data.password, user.password_hash);
      if (!ok) {
        const lock = await bootQuery('SELECT api_fail_login($1) AS l', [data.email]);
        const lockInfo = lock.rows[0]?.l;
        if (lockInfo?.locked_until && new Date(lockInfo.locked_until) > new Date()) {
          return fail(res, 429, 'compte_verrouille',
            'Trop de tentatives échouées. Le compte est verrouillé 15 minutes par sécurité.');
        }
        return fail(res, 401, 'identifiants_incorrects', GENERIC_ERROR);
      }

      await bootQuery('SELECT api_succeed_login($1)', [data.email]).catch(() => {});

      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const ctx = { companyId: user.company_id, userId: user.user_id, role: user.role };

      await withTenant(ctx, async (client) => {
        await client.query(
          `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
           VALUES ($1, $2, $3, $4)`,
          [user.user_id, sha256hex(token), expiresAt, String(req.headers['user-agent'] || '').slice(0, 300)],
        );
        // Hygiène : purge périodique des vielles sessions (best effort).
        await client.query('SELECT api_cleanup_sessions()').catch(() => {});
      });

      setSessionCookie(res, token);
      sendJson(res, 200, {
        user: { id: user.user_id, full_name: user.full_name, email: data.email, role: user.role },
        company: { id: user.company_id },
      });
    });
  });
}
