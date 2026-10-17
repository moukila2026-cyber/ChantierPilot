// Authentification : mots de passe (scrypt, sel par mot de passe), sessions
// opaques côté serveur, cookies httpOnly. Aucun secret n'est jamais exposé
// au navigateur. Compatible avec un remplacement futur par Neon Auth
// (voir docs/NEON_AUTH.md).

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { bootQuery, withTenant } from './db.js';

const scrypt = promisify(crypto.scrypt);

// Paramètres scrypt : mémoire ~32 Mo par hash, élevé mais jouable sur serverless.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export const SESSION_COOKIE = '__Host-cp_session';
export const SESSION_COOKIE_DEV = 'cp_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours, glissant

export function cookieName() {
  // Préfixe __Host- exige Secure + Path=/ + pas de Domain → durcissement réel.
  return process.env.NODE_ENV === 'production' ? SESSION_COOKIE : SESSION_COOKIE_DEV;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function sha256hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers?.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

/** Crée une session en base (seul le hash du jeton est stocké). */
export async function createSession(ctx, userAgent) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await withTenant(ctx, async (client) => {
    await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [ctx.userId, sha256hex(token), expiresAt, String(userAgent || '').slice(0, 300)],
    );
  });
  return { token, expiresAt };
}

/** Récupère le contexte utilisateur depuis le cookie de session. */
export async function getSessionContext(req) {
  const token = parseCookies(req)[cookieName()];
  if (!token || token.length < 20 || token.length > 200) return null;
  const { rows } = await bootQuery('SELECT api_lookup_session($1) AS ctx', [sha256hex(token)]);
  const ctx = rows[0]?.ctx;
  if (!ctx) return null;
  return {
    sessionId: ctx.session_id,
    userId: ctx.user_id,
    companyId: ctx.company_id,
    role: ctx.role,
    fullName: ctx.full_name,
    email: ctx.email,
    expiresAt: ctx.expires_at,
    tokenHash: sha256hex(token),
  };
}

/** Fait glisser l'expiration de la session (max 7 jours à chaque usage). */
export async function touchSession(ctx) {
  await withTenant(ctx, async (client) => {
    await client.query(
      `UPDATE sessions SET last_seen_at = now(), expires_at = GREATEST(expires_at, now() + ($2 || ' milliseconds')::interval)
       WHERE id = $1`,
      [ctx.sessionId, String(SESSION_TTL_MS)],
    );
  });
}

export async function revokeSession(ctx) {
  await withTenant(ctx, async (client) => {
    await client.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [ctx.sessionId]);
  });
}
