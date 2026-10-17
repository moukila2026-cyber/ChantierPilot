// PATCH/DELETE /api/payments/:id — modification ou suppression d'un encaissement.

import { withTenant } from '../_lib/db.js';
import { paymentUpdateSchema, parseOrThrow, PAYMENT_METHOD_LABELS } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, fail } from '../_lib/http.js';
import { requireAuth, run, audit } from '../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      const id = req.query?.id || req.url.split('/').filter(Boolean).pop()?.split('?')[0];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(id || '')) return fail(res, 404, 'introuvable', 'Encaissement introuvable.');

      if (req.method === 'PATCH') {
        const data = parseOrThrow(paymentUpdateSchema, await readJsonBody(req));
        let proof;
        if (data.proof !== undefined) {
          proof = data.proof === null
            ? { buffer: null, filename: null, mime: null, size: null }
            : decodeFileAttachment(data.proof);
        }

        const payment = await withTenant(ctx, async (client) => {
          const current = (await client.query('SELECT * FROM payments WHERE id = $1', [id])).rows[0];
          if (!current) return null;

          const { rows } = await client.query(
            `UPDATE payments SET
               client_name = COALESCE($2, client_name),
               amount = COALESCE($3, amount),
               payment_date = COALESCE($4, payment_date),
               reference = COALESCE($5, reference),
               payment_method = COALESCE($6, payment_method),
               memo = COALESCE($7, memo),
               proof = CASE WHEN $8::boolean THEN $9 ELSE proof END,
               proof_filename = CASE WHEN $8::boolean THEN $10 ELSE proof_filename END,
               proof_mime = CASE WHEN $8::boolean THEN $11 ELSE proof_mime END,
               proof_size = CASE WHEN $8::boolean THEN $12 ELSE proof_size END
             WHERE id = $1
             RETURNING id, company_id, project_id, client_name, amount, payment_date, reference,
                       payment_method, memo, (proof IS NOT NULL) AS has_proof, proof_filename, proof_mime,
                       created_by, created_at, updated_at`,
            [id, data.client_name ?? null, data.amount ?? null, data.payment_date ?? null,
              data.reference ?? null, data.payment_method ?? null, data.memo ?? null,
              proof !== undefined, proof?.buffer ?? null, proof?.filename ?? null,
              proof?.mime ?? null, proof?.size ?? null],
          );
          await audit(client, ctx, 'modification', 'encaissement', id,
            `Encaissement modifié (${PAYMENT_METHOD_LABELS[rows[0].payment_method] || ''}, ${rows[0].amount} FCFA, réf. ${rows[0].reference})`);
          return rows[0];
        });

        if (!payment) return fail(res, 404, 'introuvable', 'Encaissement introuvable.');
        return sendJson(res, 200, { payment });
      }

      if (req.method === 'DELETE') {
        const deleted = await withTenant(ctx, async (client) => {
          const current = (await client.query('SELECT amount, reference FROM payments WHERE id = $1', [id])).rows[0];
          if (!current) return null;
          await client.query('DELETE FROM payments WHERE id = $1', [id]);
          await audit(client, ctx, 'suppression', 'encaissement', id,
            `Encaissement supprimé (${current.amount} FCFA, réf. ${current.reference})`);
          return true;
        });
        if (!deleted) return fail(res, 404, 'introuvable', 'Encaissement introuvable.');
        return sendJson(res, 200, { ok: true });
      }

      return methodNotAllowed(res, 'PATCH, DELETE');
    });
  });
}
