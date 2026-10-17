// Serveur API local — exécute exactement les mêmes handlers que les
// fonctions serverless Vercel (api/**), derrière un routeur HTTP.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from './env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv();

const ROUTES = [
  ['GET', /^\/api\/health$/, 'api/health.js', []],
  ['POST', /^\/api\/auth\/register$/, 'api/auth/register.js', []],
  ['POST', /^\/api\/auth\/login$/, 'api/auth/login.js', []],
  ['POST', /^\/api\/auth\/logout$/, 'api/auth/logout.js', []],
  ['POST', /^\/api\/auth\/password$/, 'api/auth/password.js', []],
  ['GET', /^\/api\/auth\/session$/, 'api/auth/session.js', []],
  ['GET', /^\/api\/company$/, 'api/company.js', []],
  ['PATCH', /^\/api\/company$/, 'api/company.js', []],
  ['GET', /^\/api\/dashboard$/, 'api/dashboard.js', []],
  ['GET', /^\/api\/projects$/, 'api/projects/index.js', []],
  ['POST', /^\/api\/projects$/, 'api/projects/index.js', []],
  ['GET', /^\/api\/projects\/(?<id>[^/]+)$/, 'api/projects/[id].js', ['id']],
  ['PATCH', /^\/api\/projects\/(?<id>[^/]+)$/, 'api/projects/[id].js', ['id']],
  ['GET', /^\/api\/projects\/(?<id>[^/]+)\/report$/, 'api/projects/[id]/report.js', ['id']],
  ['GET', /^\/api\/expenses$/, 'api/expenses/index.js', []],
  ['POST', /^\/api\/expenses$/, 'api/expenses/index.js', []],
  ['PATCH', /^\/api\/expenses\/(?<id>[^/]+)$/, 'api/expenses/[id].js', ['id']],
  ['DELETE', /^\/api\/expenses\/(?<id>[^/]+)$/, 'api/expenses/[id].js', ['id']],
  ['GET', /^\/api\/payments$/, 'api/payments/index.js', []],
  ['POST', /^\/api\/payments$/, 'api/payments/index.js', []],
  ['PATCH', /^\/api\/payments\/(?<id>[^/]+)$/, 'api/payments/[id].js', ['id']],
  ['DELETE', /^\/api\/payments\/(?<id>[^/]+)$/, 'api/payments/[id].js', ['id']],
  ['GET', /^\/api\/files$/, 'api/files.js', []],
  ['GET', /^\/api\/export$/, 'api/export.js', []],
  ['GET', /^\/api\/audit$/, 'api/audit.js', []],
];

const handlerCache = new Map();

async function loadHandler(rel) {
  if (!handlerCache.has(rel)) {
    const mod = await import(pathToFileURL(path.join(ROOT, rel)).href);
    handlerCache.set(rel, mod.default);
  }
  return handlerCache.get(rel);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 3 * 1024 * 1024) {
        reject(Object.assign(new Error('Corps trop volumineux.'), { status: 413, code: 'corps_trop_volumineux' }));
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

export function createApiServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (!url.pathname.startsWith('/api/')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: { code: 'introuvable', message: 'Ressource inconnue.' } }));
    }

    for (const [method, re, rel] of ROUTES) {
      const m = url.pathname.match(re);
      if (m && (method === req.method || (method === 'GET' && req.method === 'HEAD'))) {
        req.query = { ...(m.groups || {}) };
        for (const [k, v] of url.searchParams.entries()) req.query[k] = v;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          try {
            req.body = await parseJsonBody(req);
          } catch (e) {
            res.statusCode = e.status || 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(JSON.stringify({ error: { code: e.code || 'json_invalide', message: e.message } }));
          }
        }
        try {
          const handler = await loadHandler(rel);
          await handler(req, res);
        } catch (e) {
          console.error('[dev-api]', e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: { code: 'erreur_serveur', message: 'Erreur interne.' } }));
          }
        }
        return;
      }
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'methode_non_autorisee', message: 'Route ou méthode inconnue.' } }));
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.API_PORT || 8787);
  createApiServer().listen(port, '0.0.0.0', () => {
    console.log(`✓ API locale démarrée sur http://localhost:${port}`);
  });
}
