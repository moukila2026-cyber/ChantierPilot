// GET /api/projects/:id/report — rapport PDF du chantier (identité entreprise incluse).

import { withTenant } from '../../../_lib/db.js';
import { buildProjectReport } from '../../../_lib/pdf.js';
import { securityHeaders, fail, methodNotAllowed, handle } from '../../../_lib/http.js';
import { requireAuth, ensureAdmin, run } from '../../../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      if (!ensureAdmin(ctx, res)) return;
      const id = req.query?.id || req.url.split('/').filter(Boolean).pop()?.split('?')[0];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(id || '')) return fail(res, 404, 'introuvable', 'Chantier introuvable.');

      const data = await withTenant(ctx, async (client) => {
        const company = (await client.query('SELECT * FROM companies WHERE id = $1', [ctx.companyId])).rows[0];
        const project = (await client.query('SELECT * FROM projects WHERE id = $1', [id])).rows[0];
        if (!project) return null;
        const expenses = (await client.query(
          `SELECT * FROM expenses WHERE project_id = $1 ORDER BY expense_date ASC, created_at ASC`, [id],
        )).rows;
        const payments = (await client.query(
          `SELECT id, client_name, amount, payment_date, reference, payment_method, memo,
                  (proof IS NOT NULL) AS has_proof
           FROM payments WHERE project_id = $1 ORDER BY payment_date ASC, created_at ASC`, [id],
        )).rows;
        const totals = {
          budget: Number(project.budget),
          expenses_total: expenses.reduce((s, e) => s + Number(e.amount), 0),
          payments_total: payments.reduce((s, p) => s + Number(p.amount), 0),
        };
        totals.reste_a_encaisser = totals.budget - totals.payments_total;
        totals.resultat_provisionnel = totals.payments_total - totals.expenses_total;
        return { company, project, expenses, payments, totals };
      });

      if (!data) return fail(res, 404, 'introuvable', 'Chantier introuvable.');

      const buffer = await buildProjectReport(data);
      const safeName = data.project.name.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60);
      securityHeaders(res);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="rapport-${safeName || 'chantier'}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(buffer.length));
      res.end(buffer);
    });
  });
}
