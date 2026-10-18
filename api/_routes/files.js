// GET /api/files?kind=expense|proof&id=uuid — téléchargement d'un justificatif.
// Strictement limité aux pièces de l'entreprise connectée (RLS).

import { withTenant } from '../_lib/db.js';
import { securityHeaders, fail, methodNotAllowed, handle } from '../_lib/http.js';
import { requireAuth, run } from '../_lib/pipeline.js';

const KINDS = {
  expense: { table: 'expenses', column: 'receipt', nameCol: 'receipt_filename', mimeCol: 'receipt_mime' },
  proof: { table: 'payments', column: 'proof', nameCol: 'proof_filename', mimeCol: 'proof_mime' },
};

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      const url = new URL(req.url, 'http://local');
      const kind = url.searchParams.get('kind');
      const id = url.searchParams.get('id');
      const spec = KINDS[kind];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!spec || !uuidRe.test(id || '')) {
        return fail(res, 404, 'introuvable', 'Fichier introuvable.');
      }

      const file = await withTenant(ctx, async (client) => {
        const { rows } = await client.query(
          `SELECT ${spec.column} AS data, ${spec.nameCol} AS filename, ${spec.mimeCol} AS mime
           FROM ${spec.table} WHERE id = $1`,
          [id],
        );
        return rows[0] || null;
      });

      if (!file || !file.data) {
        return fail(res, 404, 'introuvable', 'Aucun fichier joint à cet enregistrement.');
      }

      securityHeaders(res);
      res.statusCode = 200;
      res.setHeader('Content-Type', file.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${String(file.filename || 'piece-jointe').replace(/["\\]/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(file.data);
    });
  });
}
