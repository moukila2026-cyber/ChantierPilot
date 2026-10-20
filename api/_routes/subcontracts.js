// GET / POST / PATCH / DELETE /api/subcontracts — suivi des contrats sous-traitants / tâcherons
// Forfait convenu, avancement %, versements automatiques rattachés aux dépenses `sous_traitance`,
// et alerte d'avance excessive (% réglé > % d'avancement réel du lot).

import crypto from 'node:crypto';
import { withTenant } from '../_lib/db.js';
import { subcontractSchema, subcontractUpdateSchema, parseOrThrow } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { readJsonBody, sendJson, methodNotAllowed, handle, parseQuery, fail } from '../_lib/http.js';
import { requireAuth, ensureAdmin, run, audit } from '../_lib/pipeline.js';
import { optionalSql } from '../_lib/compat.js';
import { kvDelete, kvGet, kvList, kvPut } from '../_lib/kv.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function enrichSubcontracts(rows, subExpenses) {
  return rows.map((s) => {
    const needle = String(s.subcontractor_name || '').trim().toLowerCase();
    const paidAmount = subExpenses
      .filter((e) => e.project_id === s.project_id && (
        String(e.description || '').includes(`[ST:${s.id}]`)
        || String(e.supplier || '').trim().toLowerCase() === needle
      ))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const agreed = Number(s.agreed_amount || 0);
    const paidPct = agreed > 0 ? Math.round((paidAmount / agreed) * 100) : 0;
    const progress = Number(s.progress || 0);
    return {
      ...s,
      paid_amount: paidAmount,
      remaining_amount: Math.max(0, agreed - paidAmount),
      paid_pct: paidPct,
      overpaid_alert: paidPct > progress && progress < 100,
    };
  });
}

export default async function handler(req, res) {
  await handle(req, res, async () => {
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

      if (req.method === 'GET') {
        const q = parseQuery(req, new URL(req.url, 'http://local'));
        const projectId = q.project_id || null;
        if (projectId && !UUID_RE.test(projectId)) {
          return fail(res, 422, 'validation', 'Identifiant de chantier invalide.');
        }

        const subcontracts = await withTenant(ctx, async (client) => {
          const [sqlRows, kvRows, projsRes, subExpRes] = await Promise.all([
            optionalSql(
              client,
              'sp_sub_list',
              async () => (
                await client.query(
                  `SELECT s.*, p.name AS project_name
                   FROM subcontracts s JOIN projects p ON p.id = s.project_id
                   WHERE ($1::uuid IS NULL OR s.project_id = $1)
                   ORDER BY s.created_at DESC`,
                  [projectId],
                )
              ).rows,
              [],
            ),
            kvList(client, ctx, 'subcontracts'),
            client.query('SELECT id, name FROM projects'),
            client.query(
              `SELECT project_id, supplier, description, amount
               FROM expenses
               WHERE category = 'sous_traitance'
                 AND ($1::uuid IS NULL OR project_id = $1)`,
              [projectId],
            ),
          ]);

          const names = new Map(projsRes.rows.map((p) => [p.id, p.name]));
          const merged = new Map();
          for (const s of kvRows) {
            if (!projectId || s.project_id === projectId) {
              merged.set(s.id, { ...s, project_name: names.get(s.project_id) || 'Chantier' });
            }
          }
          for (const s of sqlRows) merged.set(s.id, s);
          const list = [...merged.values()].sort(
            (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
          );
          return enrichSubcontracts(list, subExpRes.rows);
        });

        return sendJson(res, 200, { subcontracts });
      }

      if (req.method === 'POST') {
        const data = parseOrThrow(subcontractSchema, await readJsonBody(req));

        const created = await withTenant(ctx, async (client) => {
          const check = (await client.query('SELECT id, name, status FROM projects WHERE id = $1', [data.project_id])).rows[0];
          if (!check) return { err: 'not_found' };
          if (check.status === 'archive') return { err: 'archived' };

          let row = await optionalSql(
            client,
            'sp_sub_insert',
            async () => (
              await client.query(
                `INSERT INTO subcontracts (
                   company_id, project_id, subcontractor_name, trade_lot, phone,
                   agreed_amount, progress, status, notes, created_by
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                  ctx.companyId, data.project_id, data.subcontractor_name, data.trade_lot,
                  data.phone || '', data.agreed_amount, data.progress ?? 0,
                  data.status || 'actif', data.notes || '', ctx.userId,
                ],
              )
            ).rows[0],
            null,
          );

          if (!row) {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            row = {
              id,
              company_id: ctx.companyId,
              project_id: data.project_id,
              subcontractor_name: data.subcontractor_name,
              trade_lot: data.trade_lot,
              phone: data.phone || '',
              agreed_amount: data.agreed_amount,
              progress: data.progress ?? 0,
              status: data.status || 'actif',
              notes: data.notes || '',
              created_by: ctx.userId,
              created_at: now,
              updated_at: now,
            };
            await kvPut(client, ctx, 'subcontracts', id, row);
          }

          await audit(
            client, ctx, 'creation', 'chantier', data.project_id,
            `Contrat sous-traitant « ${data.subcontractor_name} » (${data.trade_lot} — ${data.agreed_amount.toLocaleString('fr-FR')} FCFA)`,
          );
          const subExpenses = (await client.query(
            "SELECT project_id, amount, supplier, description FROM expenses WHERE project_id = $1 AND category = 'sous_traitance'",
            [row.project_id],
          )).rows;
          const [enriched] = enrichSubcontracts([row], subExpenses);
          return { row: enriched };
        });

        if (created.err === 'not_found') return fail(res, 404, 'introuvable', 'Chantier introuvable.');
        if (created.err === 'archived') return fail(res, 409, 'chantier_archive', 'Chantier archivé : rouvrez-le avant d’y ajouter un sous-traitant.');
        return sendJson(res, 201, { subcontract: created.row });
      }

      if (req.method === 'PATCH') {
        const data = parseOrThrow(subcontractUpdateSchema, await readJsonBody(req));
        const file = decodeFileAttachment(data.receipt || null);

        const outcome = await withTenant(ctx, async (client) => {
          const sqlExisting = await optionalSql(
            client,
            'sp_sub_get',
            async () => (await client.query('SELECT * FROM subcontracts WHERE id = $1', [data.id])).rows[0] || null,
            null,
          );
          const kvExisting = !sqlExisting ? await kvGet(client, ctx, 'subcontracts', data.id) : null;
          const existing = sqlExisting || kvExisting;
          if (!existing) return { err: 'not_found' };

          const proj = (await client.query('SELECT status FROM projects WHERE id = $1', [existing.project_id])).rows[0];
          if (!proj || proj.status === 'archive') return { err: 'archived' };

          let row;
          if (sqlExisting) {
            row = (
              await client.query(
                `UPDATE subcontracts SET
                   subcontractor_name = COALESCE($2, subcontractor_name),
                   trade_lot          = COALESCE($3, trade_lot),
                   phone              = COALESCE($4, phone),
                   agreed_amount      = COALESCE($5, agreed_amount),
                   progress           = COALESCE($6, progress),
                   status             = COALESCE($7, status),
                   notes              = COALESCE($8, notes),
                   updated_at         = now()
                 WHERE id = $1
                 RETURNING *`,
                [
                  data.id, data.subcontractor_name ?? null, data.trade_lot ?? null,
                  data.phone ?? null, data.agreed_amount ?? null, data.progress ?? null,
                  data.status ?? null, data.notes ?? null,
                ],
              )
            ).rows[0];
          } else {
            row = {
              ...existing,
              subcontractor_name: data.subcontractor_name ?? existing.subcontractor_name,
              trade_lot: data.trade_lot ?? existing.trade_lot,
              phone: data.phone ?? existing.phone,
              agreed_amount: data.agreed_amount ?? existing.agreed_amount,
              progress: data.progress ?? existing.progress,
              status: data.status ?? existing.status,
              notes: data.notes ?? existing.notes,
              updated_at: new Date().toISOString(),
            };
            await kvPut(client, ctx, 'subcontracts', data.id, row);
          }

          let expenseId = null;
          if (data.pay_amount) {
            const payDate = data.pay_date || new Date().toISOString().slice(0, 10);
            const label = data.pay_description
              ? `${data.pay_description} [ST:${row.id}]`
              : `Acompte lot ${row.trade_lot} [ST:${row.id}]`;
            const expRes = await client.query(
              `INSERT INTO expenses (
                 company_id, project_id, category, amount, expense_date,
                 supplier, description, receipt, receipt_filename, receipt_mime, receipt_size, created_by
               )
               VALUES ($1, $2, 'sous_traitance', $3, $4, $5, $6, $7, $8, $9, $10, $11)
               RETURNING id`,
              [
                ctx.companyId, row.project_id, data.pay_amount, payDate,
                row.subcontractor_name, label,
                file?.buffer || null, file?.filename || null, file?.mime || null, file?.size || null,
                ctx.userId,
              ],
            );
            expenseId = expRes.rows[0].id;
            await audit(
              client, ctx, 'creation', 'depense', expenseId,
              `Acompte sous-traitant ${row.subcontractor_name} (${data.pay_amount.toLocaleString('fr-FR')} FCFA)`,
            );
          } else {
            await audit(
              client, ctx, 'modification', 'chantier', row.project_id,
              `Contrat sous-traitant « ${row.subcontractor_name} » mis à jour (${row.progress} %)`,
            );
          }
          const subExpenses = (await client.query(
            "SELECT project_id, amount, supplier, description FROM expenses WHERE project_id = $1 AND category = 'sous_traitance'",
            [row.project_id],
          )).rows;
          const [enriched] = enrichSubcontracts([row], subExpenses);
          return { row: enriched, expense_id: expenseId };
        });

        if (outcome.err === 'not_found') return fail(res, 404, 'introuvable', 'Contrat sous-traitant introuvable.');
        if (outcome.err === 'archived') return fail(res, 409, 'chantier_archive', 'Chantier archivé : rouvrez-le avant de modifier un sous-traitant.');
        return sendJson(res, 200, { subcontract: outcome.row, expense_id: outcome.expense_id });
      }

      if (req.method === 'DELETE') {
        if (!ensureAdmin(ctx, res)) return;
        const q = parseQuery(req, new URL(req.url, 'http://local'));
        const id = q.id || '';
        if (!UUID_RE.test(id)) return fail(res, 422, 'validation', 'Identifiant invalide.');

        const outcome = await withTenant(ctx, async (client) => {
          const sqlExisting = await optionalSql(
            client,
            'sp_sub_del_get',
            async () => (await client.query('SELECT * FROM subcontracts WHERE id = $1', [id])).rows[0] || null,
            null,
          );
          const kvExisting = await kvGet(client, ctx, 'subcontracts', id);
          const existing = sqlExisting || kvExisting;
          if (!existing) return { status: 404 };
          if (sqlExisting) await client.query('DELETE FROM subcontracts WHERE id = $1', [id]);
          if (kvExisting) await kvDelete(client, ctx, 'subcontracts', id);
          await audit(
            client, ctx, 'suppression', 'chantier', existing.project_id,
            `Contrat sous-traitant « ${existing.subcontractor_name} » supprimé`,
          );
          return { status: 200 };
        });

        if (outcome.status === 404) return fail(res, 404, 'introuvable', 'Contrat sous-traitant introuvable.');
        return sendJson(res, 200, { ok: true });
      }

      return methodNotAllowed(res, 'GET, POST, PATCH, DELETE');
    });
  });
}
