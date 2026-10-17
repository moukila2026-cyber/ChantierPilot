// Enchaînement commun des endpoints : authentification + erreurs traduites.

import { fail, handle, methodNotAllowed, sendJson } from './http.js';
import { getSessionContext, touchSession } from './auth.js';
import { translatePgError } from './db.js';

export { fail, handle, methodNotAllowed, sendJson };

/** Exige une session valide. Renvoie le contexte ou null (erreur déjà envoyée). */
export async function requireAuth(req, res) {
  const ctx = await getSessionContext(req);
  if (!ctx) {
    fail(res, 401, 'non_authentifie', 'Session expirée ou absente. Veuillez vous reconnecter.');
    return null;
  }
  // Expiration glissante (best effort : n'interrompt pas la requête).
  touchSession(ctx).catch(() => {});
  return ctx;
}

export function toHttpError(err) {
  return translatePgError(err) || { status: err.status || 500, code: err.code || 'erreur_serveur', message: err.message };
}

/** Wrapper : gère les erreurs SQL traduites + erreurs métier. */
export async function run(res, fn) {
  try {
    await fn();
  } catch (err) {
    const mapped = toHttpError(err);
    if (mapped.status >= 500) {
      console.error('[api]', err);
      return fail(res, 500, 'erreur_serveur', 'Erreur interne. L\'incident est journalisé ; réessayez ou contactez le support.');
    }
    return fail(res, mapped.status, mapped.code, mapped.message, err.fields);
  }
}

/** Journal d'audit (best effort : ne casse jamais la requête principale). */
export async function audit(client, ctx, action, entity, entityId, summary) {
  try {
    await client.query(
      `INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ctx.companyId, ctx.userId, action, entity, entityId || null, String(summary || '').slice(0, 500)],
    );
  } catch (e) {
    console.error('[audit]', e.message);
  }
}
