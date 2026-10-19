import { readRawBody } from './_lib/body.js';
import { resolvePath } from './_lib/router.js';
export const config = { api: { bodyParser: false } };
// Point d'entrée UNIQUE de l'API sur Vercel (une seule fonction serverless).
// vercel.json réécrit toutes les URL /api/... vers cette fonction ; le
// routeur (api/_lib/router.js) appelle le bon gestionnaire de api/_routes/.

import { dispatch } from './_lib/router.js';
import { fail } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      req.rawBody = await readRawBody(req);
      if (resolvePath(req.url).pathname !== '/api/billing/webhook') {
        try { req.body = JSON.parse(req.rawBody.toString() || '{}'); }
        catch { return fail(res, 400, 'json_invalide', 'Corps JSON invalide.'); }
      }
    }
    await dispatch(req, res);
  } catch (err) {
    if (err.status === 413) return fail(res, 413, 'corps_trop_volumineux', 'Corps trop volumineux.');
    console.error('[api]', err);
    if (!res.headersSent) {
      fail(res, 500, 'erreur_serveur', 'Erreur interne. L\'incident est journalisé ; réessayez ou contactez le support.');
    }
  }
}
