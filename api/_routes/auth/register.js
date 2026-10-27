// POST /api/auth/register — crée une entreprise + son compte administrateur.
// Une seule transaction : entreprise, utilisateur, session, audit.

import { withTenant } from '../../_lib/db.js';
import { hashPassword, setSessionCookie, sha256hex, newSessionToken, SESSION_TTL_MS } from '../../_lib/auth.js';
import { registerSchema, parseOrThrow } from '../../_lib/validate.js';
import { readJsonBody, sendJson, fail, methodNotAllowed, handle } from '../../_lib/http.js';
import { registrationRateLimit } from '../../_lib/register-rate-limit.js';
import { run, audit } from '../../_lib/pipeline.js';
import crypto from 'node:crypto';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    const rl = await registrationRateLimit(req);
    if (rl.unavailable) {
      return fail(res, 503, 'limitation_indisponible',
        'Inscription temporairement indisponible. Réessayez plus tard ou contactez le support.');
    }
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      return fail(res, 429, 'trop_de_tentatives', `Trop d'inscriptions depuis cette adresse. Réessayez dans ${rl.retryAfter} s.`);
    }

    await run(res, async () => {
      const data = parseOrThrow(registerSchema, await readJsonBody(req));

      const companyId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(data.user.password);
      const token = newSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);

      let created;
      try {
        created = await withTenant(
          { companyId, userId, role: 'admin' },
          async (client) => {
            await client.query(
              `INSERT INTO companies (id, name, rccm, phone, email, address, city)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [companyId, data.company.name, data.company.rccm, data.company.phone,
                data.company.email, data.company.address, data.company.city],
            );
            // Force explicitement 2 semaines complètes (14 jours pleins) d'essai gratuit,
            // même si la colonne `trial_until` sur une base existante portait un ancien DEFAULT plus court.
            await client.query('SAVEPOINT sp_register_trial_14d');
            try {
              await client.query(
                "UPDATE companies SET trial_until = now() + interval '14 days' WHERE id = $1",
                [companyId],
              );
              await client.query('RELEASE SAVEPOINT sp_register_trial_14d');
            } catch {
              await client.query('ROLLBACK TO SAVEPOINT sp_register_trial_14d').catch(() => {});
            }
            await client.query(
              `INSERT INTO app_users (id, company_id, email, password_hash, full_name, role, auth_provider)
               VALUES ($1, $2, $3, $4, $5, 'admin', 'local')`,
              [userId, companyId, data.user.email, passwordHash, data.user.full_name],
            );
            await client.query(
              `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
               VALUES ($1, $2, $3, $4)`,
              [userId, sha256hex(token), expiresAt, userAgent],
            );
            await audit(client, { companyId, userId }, 'creation', 'entreprise', companyId,
              `Entreprise « ${data.company.name} » créée`);
            const company = await client.query('SELECT * FROM companies WHERE id = $1', [companyId]);
            return { company: company.rows[0] };
          },
        );
      } catch (err) {
        if (err.code === '23505') {
          return fail(res, 409, 'email_deja_utilise', 'Un compte existe déjà avec cette adresse e-mail.');
        }
        throw err;
      }

      setSessionCookie(res, token);
      sendJson(res, 201, {
        user: { id: userId, full_name: data.user.full_name, email: data.user.email, role: 'admin' },
        company: created.company,
      });
    });
  });
}
