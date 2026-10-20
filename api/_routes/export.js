// GET /api/export?scope=projects|expenses|payments|all&format=csv|json
// Export des données de L'ENTREPRISE CONNECTÉE uniquement (RLS).
// scope=all&format=json produit une sauvegarde structurée complète
// (hors binaires de justificatifs — voir docs/SAUVEGARDES.md).

import { withTenant } from '../_lib/db.js';
import { toCsv, sendCsv } from '../_lib/csv.js';
import { securityHeaders, fail, methodNotAllowed, handle } from '../_lib/http.js';
import { requireAuth, ensureAdmin, run } from '../_lib/pipeline.js';
import { optionalSql } from '../_lib/compat.js';
import { CATEGORY_LABELS, STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../_lib/validate.js';

function fmtDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;
      if (!ensureAdmin(ctx, res)) return;

      const url = new URL(req.url, 'http://local');
      const scope = url.searchParams.get('scope') || 'all';
      const format = url.searchParams.get('format') || 'csv';
      const stamp = new Date().toISOString().slice(0, 10);

      const data = await withTenant(ctx, async (client) => {
        const company = (await client.query('SELECT * FROM companies WHERE id = $1', [ctx.companyId])).rows[0];
        const projects = (await client.query('SELECT * FROM projects ORDER BY created_at DESC')).rows;
        const expenses = (await client.query(
          `SELECT e.id, e.project_id, p.name AS project_name, e.category, e.amount, e.expense_date,
                  e.supplier, e.description, (e.receipt IS NOT NULL) AS has_receipt,
                  e.created_at, e.updated_at
           FROM expenses e JOIN projects p ON p.id = e.project_id
           ORDER BY e.expense_date DESC`,
        )).rows;
        const payments = (await client.query(
          `SELECT pm.*, p.name AS project_name
           FROM payments pm JOIN projects p ON p.id = pm.project_id
           ORDER BY pm.payment_date DESC`,
        )).rows.map(({ proof, ...pm }) => ({
          ...pm,
          invoice_id: pm.invoice_id ?? null,
          has_proof: Boolean(proof),
        }));
        const operations = {};
        // Liste fermée : aucune interpolation d'entrée utilisateur.
        // Les anciennes tables payroll_* sont conservées UNIQUEMENT comme archives
        // dans la sauvegarde administrateur, sans lecture/écriture métier active.
        for (const table of ['commercial_documents','price_items','cash_advances','advance_entries','workers','attendance','site_tasks','inventory_items','purchase_orders','stock_movements','plan_annotations','schedule_tasks','warehouses','warehouse_movements','payroll_profiles','payroll_slips']) {
          operations[table] = await optionalSql(client, `sp_exp_${table}`, async () => (await client.query(`SELECT * FROM ${table}`)).rows, []);
        }
        operations.plan_versions = await optionalSql(
          client,
          'sp_exp_plan_versions',
          async () => (await client.query('SELECT id,company_id,project_id,title,revision,mime,filename,sha256,created_by,created_at FROM plan_versions')).rows,
          [],
        );
        operations.site_journal = await optionalSql(
          client,
          'sp_exp_site_journal',
          async () => (await client.query('SELECT id,company_id,project_id,entry_date,title,notes,progress,photo_mime,photo_filename,(photo IS NOT NULL) AS has_photo,created_by,created_at FROM site_journal')).rows,
          [],
        );
        return { company, projects, expenses, payments, operations };
      });

      if (format === 'json') {
        const payload = {
          exported_at: new Date().toISOString(),
          application: 'ChantierPilot',
          currency: 'XOF (FCFA)',
          company: data.company,
          projects: data.projects,
          expenses: data.expenses,
          payments: data.payments,
          operations: data.operations,
          mention: 'Encaissements déclarés par l\'entreprise ; preuve = justificatif joint ou référence documentaire.',
        };
        securityHeaders(res);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="chantierpilot-export-${stamp}.json"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.end(JSON.stringify(payload, null, 2));
      }

      if (format !== 'csv') {
        return fail(res, 422, 'format_invalide', 'Format inconnu : utilisez csv ou json.');
      }

      if (scope === 'projects') {
        return sendCsv(res, `chantierpilot-chantiers-${stamp}.csv`, toCsv(
          ['Nom', 'Client', 'Localisation', 'Budget (FCFA)', 'Début', 'Fin', 'Statut', 'Notes'],
          data.projects.map((p) => [p.name, p.client_name, p.location, p.budget,
            fmtDate(p.start_date), fmtDate(p.end_date), STATUS_LABELS[p.status] || p.status, p.notes]),
        ));
      }

      if (scope === 'expenses') {
        return sendCsv(res, `chantierpilot-depenses-${stamp}.csv`, toCsv(
          ['Chantier', 'Catégorie', 'Montant (FCFA)', 'Date', 'Fournisseur', 'Description', 'Justificatif joint'],
          data.expenses.map((e) => [e.project_name, CATEGORY_LABELS[e.category] || e.category, e.amount,
            fmtDate(e.expense_date), e.supplier, e.description, e.has_receipt ? 'oui' : 'non']),
        ));
      }

      if (scope === 'payments') {
        return sendCsv(res, `chantierpilot-encaissements-${stamp}.csv`, toCsv(
          ['Chantier', 'Client', 'Montant (FCFA)', 'Date', 'Référence', 'Mode de paiement', 'Mémo', 'Justificatif joint'],
          data.payments.map((p) => [p.project_name, p.client_name, p.amount, fmtDate(p.payment_date),
            p.reference, PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method, p.memo, p.has_proof ? 'oui' : 'non']),
        ));
      }

      if (scope === 'all') {
        // CSV synthétique multi-sections : pratique pour un tableur.
        const csv = [
          toCsv(['Chantier', 'Client', 'Localisation', 'Budget (FCFA)', 'Début', 'Fin', 'Statut'],
            data.projects.map((p) => [p.name, p.client_name, p.location, p.budget,
              fmtDate(p.start_date), fmtDate(p.end_date), STATUS_LABELS[p.status] || p.status])),
          toCsv(['Chantier', 'Catégorie', 'Montant (FCFA)', 'Date', 'Fournisseur', 'Description', 'Justificatif'],
            data.expenses.map((e) => [e.project_name, CATEGORY_LABELS[e.category] || e.category, e.amount,
              fmtDate(e.expense_date), e.supplier, e.description, e.has_receipt ? 'oui' : 'non'])),
          toCsv(['Chantier', 'Client', 'Montant (FCFA)', 'Date', 'Référence', 'Mode', 'Justificatif'],
            data.payments.map((p) => [p.project_name, p.client_name, p.amount, fmtDate(p.payment_date),
              p.reference, PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method, p.has_proof ? 'oui' : 'non'])),
        ].join('\r\n');
        return sendCsv(res, `chantierpilot-export-complet-${stamp}.csv`, csv);
      }

      return fail(res, 422, 'scope_invalide', 'Portée inconnue : utilisez projects, expenses, payments ou all.');
    });
  });
}
