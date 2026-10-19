import { protectLinkedExpense } from '../../_lib/operations.js';
// PATCH/DELETE /api/expenses/:id — modification ou suppression d'une dépense.

import { withTenant } from '../../_lib/db.js';
import { expenseUpdateSchema, parseOrThrow, CATEGORY_LABELS } from '../../_lib/validate.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, fail } from '../../_lib/http.js';
import { requireAuth, ensureAdmin, run, audit } from '../../_lib/pipeline.js';
import { decodeFileAttachment } from '../../_lib/files.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      const id = req.query?.id || req.url.split('/').filter(Boolean).pop()?.split('?')[0];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(id || '')) return fail(res, 404, 'introuvable', 'Dépense introuvable.');

      if (req.method === 'PATCH') {
        const data = parseOrThrow(expenseUpdateSchema, await readJsonBody(req));
        let receipt;
        if (data.receipt !== undefined) {
          receipt = data.receipt === null
            ? { buffer: null, filename: null, mime: null, size: null }
            : decodeFileAttachment(data.receipt);
        }

        const expense = await withTenant(ctx, async (client) => {
          const current = (await client.query('SELECT * FROM expenses WHERE id = $1', [id])).rows[0];
          if (!current) return null;
          await protectLinkedExpense(client,id);

          const { rows } = await client.query(
            `UPDATE expenses SET
               category = COALESCE($2, category),
               amount = COALESCE($3, amount),
               expense_date = COALESCE($4, expense_date),
               supplier = COALESCE($5, supplier),
               description = COALESCE($6, description),
               receipt = CASE WHEN $7::boolean THEN $8 ELSE receipt END,
               receipt_filename = CASE WHEN $7::boolean THEN $9 ELSE receipt_filename END,
               receipt_mime = CASE WHEN $7::boolean THEN $10 ELSE receipt_mime END,
               receipt_size = CASE WHEN $7::boolean THEN $11 ELSE receipt_size END
             WHERE id = $1
             RETURNING id, company_id, project_id, category, amount, expense_date, supplier, description,
                       (receipt IS NOT NULL) AS has_receipt, receipt_filename, receipt_mime,
                       created_by, created_at, updated_at`,
            [id, data.category ?? null, data.amount ?? null, data.expense_date ?? null,
              data.supplier ?? null, data.description ?? null,
              receipt !== undefined, receipt?.buffer ?? null, receipt?.filename ?? null,
              receipt?.mime ?? null, receipt?.size ?? null],
          );
          await audit(client, ctx, 'modification', 'depense', id,
            `Dépense modifiée (${CATEGORY_LABELS[rows[0].category] || rows[0].category}, ${rows[0].amount} FCFA)`);
          return rows[0];
        });

        if (!expense) return fail(res, 404, 'introuvable', 'Dépense introuvable.');
        return sendJson(res, 200, { expense });
      }

      if (req.method === 'DELETE') {
        if (!ensureAdmin(ctx, res)) return;
        const deleted = await withTenant(ctx, async (client) => {
          const current = (await client.query('SELECT amount, category FROM expenses WHERE id = $1', [id])).rows[0];
          if (!current) return null;
          await protectLinkedExpense(client,id);
          await client.query('DELETE FROM expenses WHERE id = $1', [id]);
          await audit(client, ctx, 'suppression', 'depense', id,
            `Dépense supprimée (${CATEGORY_LABELS[current.category] || current.category}, ${current.amount} FCFA)`);
          return true;
        });
        if (!deleted) return fail(res, 404, 'introuvable', 'Dépense introuvable.');
        return sendJson(res, 200, { ok: true });
      }

      return methodNotAllowed(res, 'PATCH, DELETE');
    });
  });
}
