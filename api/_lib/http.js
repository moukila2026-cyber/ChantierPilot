// Pipeline HTTP commun : en-têtes de sécurité, réponses JSON, contrôle
// d'origine (anti-CSRF), limitation de débit, lecture de corps.

/**
 * Environnement déployé ? NODE_ENV=production, ou déploiement Vercel
 * (production comme préproduction) : cookie Secure/__Host-, HSTS et CSP.
 */
export function isProductionEnv(env = process.env) {
  return env.NODE_ENV === 'production'
    || env.VERCEL_ENV === 'production'
    || env.VERCEL_ENV === 'preview';
}

const IS_PROD = isProductionEnv();

export const MAX_BODY_BYTES = 3 * 1024 * 1024; // corps JSON max (justificatifs inclus)

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
      "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  }
}

export function sendJson(res, status, data) {
  securityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function fail(res, status, code, message, fields) {
  sendJson(res, status, { error: { code, message, ...(fields ? { fields } : {}) } });
}

export function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  fail(res, 405, 'methode_non_autorisee', `Méthode non autorisée (attendu : ${allow}).`);
}

/** Vérifie que la requête vient bien de notre application (anti-CSRF). */
export function assertSameOrigin(req) {
  const method = (req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true; // clients non-navigateurs (tests, scripts) — les cookies SameSite protègent les navigateurs
  let allowed = [];
  try {
    allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  } catch { /* ignore */ }
  const host = req.headers.host;
  if (host) {
    allowed.push(`https://${host}`, `http://${host}`);
  }
  return allowed.includes(origin);
}

// --- Limitation de débit en mémoire (par instance). Le verrouillage de
// compte persistant est géré en base (failed_login_attempts / locked_until),
// ce qui couvre le multi-instances. -------------------------------------
const buckets = new Map();

export function rateLimit(req, key, limit, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'inconnu';
  const k = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(k) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return { ok: false, retryAfter };
  }
  recent.push(now);
  buckets.set(k, recent);
  if (buckets.size > 5000) {
    for (const [kk, vv] of buckets) {
      if (vv.every((t) => now - t >= windowMs)) buckets.delete(kk);
    }
  }
  return { ok: true };
}

/** Lit et valide un corps JSON (compatible Vercel qui pré-parse req.body). */
export async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Corps de requête trop volumineux (3 Mo maximum).'), { status: 413, code: 'corps_trop_volumineux' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Corps JSON invalide.'), { status: 400, code: 'json_invalide' }));
      }
    });
    req.on('error', reject);
  });
}

export function parseQuery(req, url) {
  const q = {};
  for (const [k, v] of url.searchParams.entries()) q[k] = v;
  return q;
}

/** Pagination bornée côté serveur : un client ne peut pas demander des lots sans limite. */
export function parsePagination(query, defaultLimit = 25, maxLimit = 100) {
  const asInt = (value, fallback) => {
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const limit = Math.min(maxLimit, Math.max(1, asInt(query.limit, defaultLimit)));
  const offset = asInt(query.offset, 0);
  return { limit, offset };
}

export function paginationMeta(limit, offset, total) {
  const count = Number(total) || 0;
  return { limit, offset, total: count, hasMore: offset + limit < count };
}

/** Enveloppe standard : contrôle d'origine, erreurs traduites, journal. */
export async function handle(req, res, fn) {
  try {
    if (!assertSameOrigin(req)) {
      return fail(res, 403, 'origine_refusee', 'Requête refusée : origine non autorisée.');
    }
    await fn();
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error('[api]', err);
      return fail(res, 500, 'erreur_serveur', 'Erreur interne. L\'incident est journalisé ; réessayez ou contactez le support.');
    }
    return fail(res, status, err.code || 'requete_invalide', err.message || 'Requête invalide.', err.fields);
  }
}
