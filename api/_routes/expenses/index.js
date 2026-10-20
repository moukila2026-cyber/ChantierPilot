// GET /api/expenses — liste des dépenses (filtres : chantier, catégorie, période, recherche plein-texte).
// POST /api/expenses — enregistrement d'une dépense (justificatif facultatif).

import { withTenant } from '../../_lib/db.js';
import { expenseSchema, parseOrThrow, CATEGORY_LABELS } from '../../_lib/validate.js';
import { decodeFileAttachment } from '../../_lib/files.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, parseQuery, parsePagination, paginationMeta } from '../../_lib/http.js';
import { requireAuth, run, audit } from '../../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://local');
        const q = parseQuery(req, url);
        const projectId = q.project_id || null;
        const category = q.category && q.category !== 'toutes' ? q.category : null;
        const from = q.from || null;
        const to = q.to || null;
        const search = q.q ? q.q.trim().slice(0, 120) : null;
        const page = parsePagination(q);

        const result = await withTenant(ctx, async (client) => {
          const where = `($1::uuid IS NULL OR e.project_id = $1)
            AND ($2::text IS NULL OR e.category = $2)
            AND ($3::date IS NULL OR e.expense_date >= $3)
            AND ($4::date IS NULL OR e.expense_date <= $4)
            AND ($5::text IS NULL OR e.supplier ILIKE '%' || $5 || '%' OR e.description ILIKE '%' || $5 || '%' OR p.name ILIKE '%' || $5 || '%')`;
          const params = [projectId, category, from, to, search];
          const [{ rows }, aggResult] = await Promise.all([
            client.query(
              `SELECT e.id, e.company_id, e.project_id, e.category, e.amount, e.expense_date,
                      e.supplier, e.description,
                      (e.receipt IS NOT NULL) AS has_receipt, e.receipt_filename, e.receipt_mime,
                      e.created_by, e.created_at, e.updated_at,
                      p.name AS project_name, u.full_name AS created_by_name
               FROM expenses e
               JOIN projects p ON p.id = e.project_id
               LEFT JOIN app_users u ON u.id = e.created_by
               WHERE ${where}
               ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
               LIMIT $6 OFFSET $7`,
              [...params, page.limit, page.offset],
            ),
            client.query(
              `SELECT COUNT(*)::int AS total,
                      COALESCE(SUM(e.amount), 0)::bigint AS total_amount,
                      COUNT(*) FILTER (WHERE e.receipt IS NOT NULL)::int AS with_proof_count
               FROM expenses e
               JOIN projects p ON p.id = e.project_id
               WHERE ${where}`,
              params,
            ),
          ]);
          const agg = aggResult.rows[0];
          return {
            rows,
            total: agg.total,
            summary: {
              total_amount: Number(agg.total_amount),
              count: agg.total,
              with_proof_count: agg.with_proof_count,
            },
          };
        });

        return sendJson(res, 200, {
          expenses: result.rows,
          summary: result.summary,
          pagination: paginationMeta(page.limit, page.offset, result.total),
          labels: { category: CATEGORY_LABELS },
        });
      }

      if (req.method === 'POST') {
        const data = parseOrThrow(expenseSchema, await readJsonBody(req));
        const receipt = decodeFileAttachment(data.receipt);

        const expense = await withTenant(ctx, async (client) => {
          const project = (await client.query('SELECT status, name FROM projects WHERE id = $1', [data.project_id])).rows[0];
          if (!project) {
            const err = new Error('Chantier introuvable.');
            err.status = 404; err.code = 'introuvable';
            throw err;
          }
          if (project.status === 'archive') {
            const err = new Error('Ce chantier est archivé. Rouvrez-le pour ajouter des dépenses.');
            err.status = 409; err.code = 'chantier_archive';
            throw err;
          }

          const { rows } = await client.query(
            `INSERT INTO expenses (company_id, project_id, category, amount, expense_date, supplier, description,
                                   receipt, receipt_filename, receipt_mime, receipt_size, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, company_id, project_id, category, amount, expense_date, supplier, description,
                       (receipt IS NOT NULL) AS has_receipt, receipt_filename, receipt_mime,
                       created_by, created_at, updated_at`,
            [ctx.companyId, data.project_id, data.category, data.amount, data.expense_date,
              data.supplier, data.description,
              receipt?.buffer || null, receipt?.filename || null, receipt?.mime || null,
              receipt?.size || null, ctx.userId],
          );
          await audit(client, ctx, 'creation', 'depense', rows[0].id,
            `Dépense de ${data.amount} FCFA (${CATEGORY_LABELS[data.category]}) sur « ${project.name} »`);
          return rows[0];
        });

        return sendJson(res, 201, { expense });
      }

      return methodNotAllowed(res, 'GET, POST');
    });
  });
}
