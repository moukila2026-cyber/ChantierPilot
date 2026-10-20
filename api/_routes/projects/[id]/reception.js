// GET /api/projects/:id/reception — PV contradictoire de réception des travaux & levée de réserves (PDF).

import { withTenant } from '../../../_lib/db.js';
import { securityHeaders, methodNotAllowed, handle, fail } from '../../../_lib/http.js';
import { requireAuth, ensureAdmin, run, audit } from '../../../_lib/pipeline.js';
import { optionalSql } from '../../../_lib/compat.js';
import { kvGet, kvList } from '../../../_lib/kv.js';
import { buildReceptionPdf } from '../../../_lib/reception-pdf.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');

    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      if (!ensureAdmin(ctx, res)) return;

      const id = req.query?.id || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return fail(res, 404, 'introuvable', 'Chantier introuvable.');
      }

      const bundle = await withTenant(ctx, async (client) => {
        const { rows: projRows } = await client.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (!projRows.length) return null;

        const rawProject = projRows[0];
        const compRes = await client.query('SELECT * FROM companies WHERE id = $1', [ctx.companyId]);
        const paySumRes = await client.query('SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM payments WHERE project_id = $1', [id]);
        const projMeta = await kvGet(client, ctx, 'project_meta', id);
        const compMeta = await kvGet(client, ctx, 'company_meta', ctx.companyId);

        const sqlQuote = await optionalSql(
          client,
          'sp_rec_quote',
          async () => (
            await client.query(
              "SELECT total FROM commercial_documents WHERE project_id = $1 AND kind = 'quote' AND status = 'accepted' LIMIT 1",
              [id],
            )
          ).rows[0] || null,
          null,
        );
        const kvQuote = !sqlQuote
          ? (await kvList(client, ctx, 'docs')).find((d) => d.project_id === id && d.kind === 'quote' && d.status === 'accepted') || null
          : null;

        const sqlSnags = await optionalSql(
          client,
          'sp_rec_snags',
          async () => (
            await client.query(
              "SELECT title, status, due_date FROM site_tasks WHERE project_id = $1 AND kind = 'reserve' ORDER BY due_date ASC",
              [id],
            )
          ).rows,
          [],
        );
        const kvSnags = (await kvList(client, ctx, 'tasks')).filter((t) => t.project_id === id && t.kind === 'reserve');
        const snagMap = new Map([...kvSnags, ...sqlSnags].map((s) => [s.id || s.title, s]));

        const sqlSubs = await optionalSql(
          client,
          'sp_rec_subs',
          async () => (
            await client.query(
              'SELECT id, subcontractor_name, trade_lot, progress FROM subcontracts WHERE project_id = $1 ORDER BY created_at ASC',
              [id],
            )
          ).rows,
          [],
        );
        const kvSubs = (await kvList(client, ctx, 'subcontracts')).filter((s) => s.project_id === id);
        const subMap = new Map([...kvSubs, ...sqlSubs].map((s) => [s.id, s]));

        const rawCompany = compRes.rows[0];
        const company = {
          ...rawCompany,
          tax_number: rawCompany.tax_number || compMeta?.tax_number || '',
          tax_regime: rawCompany.tax_regime || compMeta?.tax_regime || '',
        };
        const project = {
          ...rawProject,
          client_phone: rawProject.client_phone || projMeta?.client_phone || '',
          retention_bps: Number(rawProject.retention_bps ?? projMeta?.retention_bps ?? 0),
          retention_release_date: rawProject.retention_release_date ?? projMeta?.retention_release_date ?? null,
          retention_released: Boolean(rawProject.retention_released ?? projMeta?.retention_released ?? false),
          contract_total: (sqlQuote || kvQuote)?.total ?? null,
          payments_total: Number(paySumRes.rows[0].total || 0),
        };

        await audit(client, ctx, 'export', 'chantier', id, `PV de réception PDF exporté (« ${project.name} »)`);
        return { company, project, snags: [...snagMap.values()], subcontracts: [...subMap.values()] };
      });

      if (!bundle) return fail(res, 404, 'introuvable', 'Chantier introuvable.');
      const pdf = await buildReceptionPdf(bundle);
      const slug = bundle.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chantier';
      securityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pv-reception-${slug}.pdf"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdf);
    });
  });
}
