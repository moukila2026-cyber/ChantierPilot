import { readRawBody } from '../api/_lib/body.js';
// Serveur API local — exécute exactement le même routeur que la fonction
// serverless Vercel (api/index.js → api/_lib/router.js).

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadEnv } from './env.mjs';

loadEnv();

// Le routeur est chargé APRÈS loadEnv() : les modules de l'API lisent
// process.env à leur initialisation.
const { dispatch } = await import('../api/_lib/router.js');

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

    // Sur Vercel, le corps JSON est pré-analysé dans req.body : on reproduit
    // ce comportement, puis on passe par le MÊME routeur que la production.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try {
        if (url.pathname === '/api/billing/webhook') req.rawBody = await readRawBody(req);
        else req.body = await parseJsonBody(req);
      } catch (e) {
        res.statusCode = e.status || 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: { code: e.code || 'json_invalide', message: e.message } }));
      }
    }
    try {
      await dispatch(req, res);
    } catch (e) {
      console.error('[dev-api]', e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: { code: 'erreur_serveur', message: 'Erreur interne.' } }));
      }
    }
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.API_PORT || 8787);
  createApiServer().listen(port, '0.0.0.0', () => {
    console.log(`✓ API locale démarrée sur http://localhost:${port}`);
  });
}
