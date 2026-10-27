import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { bootQuery } from './db.js';
import { isProductionEnv, rateLimit } from './http.js';
import { logTechnicalError } from './safe-log.js';

// Sur Vercel, les en-têtes d'adresse sont définis par la plateforme. En dehors
// de Vercel, une entrée directe ne doit pas pouvoir usurper X-Forwarded-For.
// Les tests isolés peuvent fournir une adresse synthétique par cet en-tête.
export function registrationClientIp(req, env = process.env) {
  const headers = req.headers || {};
  const vercel = Boolean(env.VERCEL) || ['production', 'preview'].includes(env.VERCEL_ENV);
  let raw;
  if (vercel) raw = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'];
  else if (env.NODE_ENV === 'test') raw = headers['x-forwarded-for'] || req.socket?.remoteAddress;
  else raw = req.socket?.remoteAddress;
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw !== 'string') return null;
  let ip = raw.split(',')[0].trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const family = isIP(ip);
  if (family === 4) return ip;
  if (family !== 6) return null;
  try {
    const host = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const mapped = host.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/i);
    if (mapped) {
      const high = parseInt(mapped[1], 16);
      const low = parseInt(mapped[2], 16);
      return [high >> 8, high & 255, low >> 8, low & 255].join('.');
    }
    return host.toLowerCase();
  } catch { return null; }
}

/** Limite glissante partagée par les instances ; en cas d'incident, refus sûr. */
export async function registrationRateLimit(req, { query = bootQuery, env = process.env } = {}) {
  const ip = registrationClientIp(req, env);
  if (!ip) return { ok: false, unavailable: true };
  // Une empreinte évite de stocker l'adresse brute ; elle reste néanmoins une
  // donnée pseudonymisée. Un nettoyage borné des compteurs expirés est tenté.
  const key = createHash('sha256').update('chantierpilot:register:').update(ip).digest('hex');
  try {
    const result = await query('SELECT allowed, retry_after FROM public.api_rate_limit_hit($1)', [key]);
    const row = result?.rows?.[0];
    const retry = row?.retry_after;
    if (typeof row?.allowed !== 'boolean' || !Number.isInteger(retry)
      || retry < 0 || retry > 3600 || (row.allowed ? retry !== 0 : retry < 1)) {
      throw new Error('Réponse de limitation invalide.');
    }
    // Transaction distincte du quota : aucune prise de verrous croisés. Une
    // erreur de nettoyage ne modifie pas le résultat du contrôle de sécurité.
    if (row.allowed) {
      try { await query('SELECT public.api_rate_limit_cleanup()'); }
      catch (error) { logTechnicalError('api', error); }
    }
    return { ok: row.allowed, retryAfter: retry };
  } catch (error) {
    // La simulation historique à sept tables tourne uniquement en test local.
    // Aucun repli en mémoire n'est autorisé en Preview ou Production.
    if (error?.code === '42883' && env.NODE_ENV === 'test' && !env.VERCEL && !isProductionEnv(env)) {
      return rateLimit(req, 'register', 10, 60 * 60 * 1000);
    }
    logTechnicalError('api', error);
    return { ok: false, unavailable: true };
  }
}
