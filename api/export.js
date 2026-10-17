// GET /api/export?scope=projects|expenses|payments|all&format=csv|json
// Export des données de L'ENTREPRISE CONNECTÉE uniquement (RLS).
// scope=all&format=json produit une sauvegarde structurée complète
// (hors binaires de justificatifs — voir docs/SAUVEGARDES.md).

import { withTenant } from './_lib/db.js';
import { toCsv, sendCsv } from './_lib/csv.js';
import { securityHeaders, fail, methodNotAllowed, handle } from './_lib/http.js';
import { requireAuth, run } from './_lib/pipeline.js';
import { CATEGORY_LABELS, STATUS_LABELS, PAYMENT_METHOD_LABELS } from './_lib/validate.js';

function fmtDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    await run(res, async () => {
      const ctx = await requireAuth(req, res);
      if (!ctx) return;

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
          `SELECT pm.id, pm.project_id, p.name AS project_name, pm.client_name, pm.amount, pm.payment_date,
                  pm.reference, pm.payment_method, pm.memo, (pm.proof IS NOT NULL) AS has_proof,
                  pm.created_at, pm.updated_at
           FROM payments pm JOIN projects p ON p.id = pm.project_id
           ORDER BY pm.payment_date DESC`,
        )).rows;
        return { company, projects, expenses, payments };
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
