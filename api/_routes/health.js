// GET /api/health — état du service (aucune donnée sensible).
// Permet de savoir si la base est configurée, si les 27 tables actives existent et quel pilote est actif.

import { bootQuery, driverName } from '../_lib/db.js';
import { sendJson, methodNotAllowed, handle } from '../_lib/http.js';

const EXPECTED_TABLES = [
  'companies', 'app_users', 'sessions', 'projects', 'expenses', 'payments', 'audit_log',
  'billing_orders', 'platform_operators', 'platform_actions',
  'operation_requests', 'commercial_documents', 'price_items', 'cash_advances', 'advance_entries',
  'workers', 'attendance', 'site_tasks', 'site_journal', 'inventory_items', 'purchase_orders',
  'stock_movements', 'plan_versions', 'plan_annotations', 'schedule_tasks',
  'warehouses', 'warehouse_movements',
];

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    let db = 'inconnu';
    let schema = 'inconnu';
    try {
      await bootQuery('SELECT 1');
      db = 'ok';
      const { rows } = await bootQuery(
        `SELECT COUNT(*)::int AS n
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
        [EXPECTED_TABLES],
      );
      schema = rows[0]?.n === EXPECTED_TABLES.length ? 'ok' : 'migration_requise';
    } catch {
      db = 'indisponible';
    }
    sendJson(res, 200, {
      status: db === 'ok' ? 'ok' : 'degrade',
      time: new Date().toISOString(),
      database: db,
      schema,
      driver: driverName(),
      currency: 'XOF (FCFA)',
    });
  });
}
