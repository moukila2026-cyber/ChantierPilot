#!/usr/bin/env node
// Pré-étape de build Vercel : vérifie l'état du schéma PostgreSQL cible et,
// si une migration additive est nécessaire et autorisée par le rôle courant,
// effectue d'abord une sauvegarde intégrale dans le schéma privé
// `_backup_pre_migration` (aucune suppression, aucun secret journalisé),
// applique `db/migrate.mjs`, puis contrôle la conservation exacte des lignes.

import pg from 'pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_TABLES = [
  'companies', 'app_users', 'sessions', 'projects', 'expenses', 'payments', 'audit_log',
  'billing_orders', 'platform_operators', 'platform_actions',
  'operation_requests', 'commercial_documents', 'price_items', 'cash_advances', 'advance_entries',
  'workers', 'attendance', 'site_tasks', 'site_journal', 'inventory_items', 'purchase_orders',
  'stock_movements', 'plan_versions', 'plan_annotations', 'schedule_tasks',
  'warehouses', 'warehouse_movements',
];

function quoteIdent(ident) {
  if (!/^[a-zA-Z0-9_]+$/.test(ident)) throw new Error(`Identifiant SQL refusé : ${ident}`);
  return `"${ident}"`;
}

async function run() {
  if (process.env.VERCEL !== '1' && process.env.FORCE_SAFE_MIGRATE !== '1') {
    return;
  }

  const url = process.env.DATABASE_URL_ADMIN
    || process.env.DATABASE_URL_UNPOOLED
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.POSTGRES_URL
    || process.env.DATABASE_URL;
  if (!url) {
    console.log('· [db-check] Aucune DATABASE_URL définie pendant le build — étape ignorée.');
    return;
  }

  const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true };
  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();

  try {
    const { rows: roleRows } = await client.query(
      `SELECT current_user AS role,
              has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`,
    );
    const { role, can_create: canCreate } = roleRows[0];

    const { rows: tableRows } = await client.query(
      `SELECT c.relname AS table_name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY c.relname`,
    );
    const existing = new Set(tableRows.map((r) => r.table_name));
    const missing = EXPECTED_TABLES.filter((t) => !existing.has(t));

    if (missing.length === 0) {
      console.log(`✓ [db-check] Schéma complet (${EXPECTED_TABLES.length}/${EXPECTED_TABLES.length} tables présentes, rôle « ${role} »).`);
      return;
    }

    console.log(`· [db-check] ${existing.size} table(s) présente(s), ${missing.length} table(s) manquante(s) : ${missing.join(', ')}`);

    if (!canCreate || role === 'chantierpilot_app') {
      console.warn(
        `! [db-check] Le rôle configuré (« ${role} ») est un rôle applicatif sans privilège DDL sur public. ` +
        'Ajoutez DATABASE_URL_ADMIN (rôle propriétaire Neon) dans Vercel pour exécuter la sauvegarde + migration automatique, ' +
        'ou lancez : DATABASE_URL_ADMIN="postgresql://..." npm run migrate',
      );
      return;
    }

    // 1. Sauvegarde intégrale non destructive de toutes les tables existantes avant migration
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    await client.query('CREATE SCHEMA IF NOT EXISTS _backup_pre_migration');
    await client.query('REVOKE ALL ON SCHEMA _backup_pre_migration FROM PUBLIC');

    const beforeCounts = new Map();
    for (const table of existing) {
      const qTable = quoteIdent(table);
      const snapName = quoteIdent(`${table}_snap_${stamp}`);
      const { rows: cRows } = await client.query(`SELECT COUNT(*)::int AS n FROM public.${qTable}`);
      beforeCounts.set(table, cRows[0].n);
      await client.query(`CREATE TABLE IF NOT EXISTS _backup_pre_migration.${snapName} AS TABLE public.${qTable}`);
    }
    console.log(
      `✓ [db-backup] Sauvegarde préalable créée dans _backup_pre_migration (${beforeCounts.size} table(s), ` +
      `${[...beforeCounts.values()].reduce((a, b) => a + b, 0)} ligne(s) protégée(s)).`,
    );

    // 2. Exécution de la migration idempotente officielle (db/migrate.mjs)
    const res = spawnSync(process.execPath, [path.join(ROOT, 'db', 'migrate.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL_ADMIN: url },
    });
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    if (res.status !== 0) {
      throw new Error(`db/migrate.mjs s'est terminé avec le code ${res.status}`);
    }

    // Reprotège le schéma de sauvegarde vis-à-vis du rôle applicatif créé/mis à jour par rls.sql
    await client.query('REVOKE ALL ON SCHEMA _backup_pre_migration FROM chantierpilot_app');

    // 3. Vérification stricte de conservation des données existantes et présence des 27 tables
    for (const [table, expectedCount] of beforeCounts.entries()) {
      const { rows: afterRows } = await client.query(`SELECT COUNT(*)::int AS n FROM public.${quoteIdent(table)}`);
      if (afterRows[0].n < expectedCount) {
        throw new Error(`Alerte intégrité sur ${table} : ${afterRows[0].n} < ${expectedCount}`);
      }
    }
    const { rows: finalTables } = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES],
    );
    console.log(`✓ [db-check] Migration vérifiée sans perte : ${finalTables[0].n}/${EXPECTED_TABLES.length} tables actives.`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('✗ [db-check] Échec lors de la vérification/migration de base :', err.message);
  process.exit(1);
});
