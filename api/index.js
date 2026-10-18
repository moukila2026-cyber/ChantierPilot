// Point d'entrée UNIQUE de l'API sur Vercel (une seule fonction serverless).
// vercel.json réécrit toutes les URL /api/... vers cette fonction ; le
// routeur (api/_lib/router.js) appelle le bon gestionnaire de api/_routes/.

import { dispatch } from './_lib/router.js';
import { fail } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    await dispatch(req, res);
  } catch (err) {
    console.error('[api]', err);
    if (!res.headersSent) {
      fail(res, 500, 'erreur_serveur', 'Erreur interne. L\'incident est journalisé ; réessayez ou contactez le support.');
    }
  }
}
