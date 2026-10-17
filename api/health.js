// GET /api/health — état du service (aucune donnée sensible).
// Permet de savoir si la base est configurée et quel pilote est actif.

import { bootQuery, driverName } from './_lib/db.js';
import { sendJson, methodNotAllowed, handle } from './_lib/http.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    let db = 'inconnu';
    try {
      await bootQuery('SELECT 1');
      db = 'ok';
    } catch (e) {
      db = 'indisponible';
    }
    sendJson(res, 200, {
      status: db === 'ok' ? 'ok' : 'degrade',
      time: new Date().toISOString(),
      database: db,
      driver: driverName(),
      currency: 'XOF (FCFA)',
    });
  });
}
