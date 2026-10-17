// GET /api/payments — liste des encaissements.
// POST /api/payments — déclaration d'un encaissement (référence obligatoire).
// Un encaissement est une DÉCLARATION documentée : la référence (n° de reçu,
// réf. de virement…) est exigée, et un justificatif peut être joint.

import { withTenant } from '../_lib/db.js';
import { paymentSchema, parseOrThrow, PAYMENT_METHOD_LABELS } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, parseQuery, parsePagination, paginationMeta } from '../_lib/http.js';
import { requireAuth, run, audit } from '../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://local');
        const q = parseQuery(req, url);
        const projectId = q.project_id || null;
        const method = q.method && q.method !== 'tous' ? q.method : null;
        const from = q.from || null;
        const to = q.to || null;
        const page = parsePagination(q);

        const result = await withTenant(ctx, async (client) => {
          const where = `($1::uuid IS NULL OR p.project_id = $1)
            AND ($2::text IS NULL OR p.payment_method = $2)
            AND ($3::date IS NULL OR p.payment_date >= $3)
            AND ($4::date IS NULL OR p.payment_date <= $4)`;
          const params = [projectId, method, from, to];
          const [{ rows }, countResult] = await Promise.all([
            client.query(
              `SELECT p.id, p.company_id, p.project_id, p.client_name, p.amount, p.payment_date,
                      p.reference, p.payment_method, p.memo,
                      (p.proof IS NOT NULL) AS has_proof, p.proof_filename, p.proof_mime,
                      p.created_by, p.created_at, p.updated_at,
                      pr.name AS project_name, u.full_name AS created_by_name
               FROM payments p
               JOIN projects pr ON pr.id = p.project_id
               LEFT JOIN app_users u ON u.id = p.created_by
               WHERE ${where}
               ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC
               LIMIT $5 OFFSET $6`,
              [...params, page.limit, page.offset],
            ),
            client.query(`SELECT COUNT(*)::int AS total FROM payments p WHERE ${where}`, params),
          ]);
          return { rows, total: countResult.rows[0].total };
        });

        return sendJson(res, 200, {
          payments: result.rows,
          pagination: paginationMeta(page.limit, page.offset, result.total),
          labels: { payment_method: PAYMENT_METHOD_LABELS },
        });
      }

      if (req.method === 'POST') {
        const data = parseOrThrow(paymentSchema, await readJsonBody(req));
        const proof = decodeFileAttachment(data.proof);

        const payment = await withTenant(ctx, async (client) => {
          const project = (await client.query('SELECT status, name FROM projects WHERE id = $1', [data.project_id])).rows[0];
          if (!project) {
            const err = new Error('Chantier introuvable.');
            err.status = 404; err.code = 'introuvable';
            throw err;
          }
          if (project.status === 'archive') {
            const err = new Error('Ce chantier est archivé. Rouvrez-le pour enregistrer des encaissements.');
            err.status = 409; err.code = 'chantier_archive';
            throw err;
          }

          const { rows } = await client.query(
            `INSERT INTO payments (company_id, project_id, client_name, amount, payment_date, reference,
                                   payment_method, memo, proof, proof_filename, proof_mime, proof_size, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id, company_id, project_id, client_name, amount, payment_date, reference,
                       payment_method, memo, (proof IS NOT NULL) AS has_proof, proof_filename, proof_mime,
                       created_by, created_at, updated_at`,
            [ctx.companyId, data.project_id, data.client_name, data.amount, data.payment_date,
              data.reference, data.payment_method, data.memo,
              proof?.buffer || null, proof?.filename || null, proof?.mime || null,
              proof?.size || null, ctx.userId],
          );
          await audit(client, ctx, 'creation', 'encaissement', rows[0].id,
            `Encaissement déclaré de ${data.amount} FCFA (réf. ${data.reference}) sur « ${project.name} »`);
          return rows[0];
        });

        return sendJson(res, 201, { payment });
      }

      return methodNotAllowed(res, 'GET, POST');
    });
  });
}
