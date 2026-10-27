#!/usr/bin/env node
// Aucun build Vercel ne doit modifier ni interroger une base automatiquement.
// Le diagnostic historique ci-dessous n'est accessible qu'avec une confirmation
// explicite et en mode test local. Sa copie de tables n'est PAS une sauvegarde
// complète ni une restauration vérifiée ; ne pas l'utiliser sur une base réelle.

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
  'warehouses', 'warehouse_movements', 'subcontracts',
];

function quoteIdent(ident) {
  if (!/^[a-zA-Z0-9_]+$/.test(ident)) throw new Error(`Identifiant SQL refusé : ${ident}`);
  return `"${ident}"`;
}

async function run() {
  // Un push peut lancer un build Preview alors que la séparation des bases n'a
  // pas été vérifiée. N'effectuer AUCUN accès DB pendant un build ordinaire,
  // même si d'anciennes variables de migration sont encore configurées.
  if (!process.argv.includes('--cible-isolee-confirmee')) {
    console.log('· [db-check] Aucun accès ou migration de base automatique pendant le build.');
    return;
  }
  if (process.env.VERCEL || process.env.NODE_ENV !== 'test') {
    throw new Error('Diagnostic réservé à une base de test locale isolée.');
  }

  const url = process.env.DATABASE_URL_ADMIN
    || process.env.DATABASE_URL_UNPOOLED
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.POSTGRES_URL
    || process.env.DATABASE_URL;
  if (!url) {
    console.log('· [db-check] Base de test non configurée — étape ignorée.');
    return;
  }
  let target;
  try { target = new URL(url); } catch { throw new Error('Cible de test invalide.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('Diagnostic réservé à une base de test locale isolée.');
  }

  const ssl = undefined;
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
      console.log('✓ [db-check] Schéma de test vérifié.');
      return;
    }

    console.log('· [db-check] Le schéma de test doit être complété.');

    if (!canCreate || role === 'chantierpilot_app') {
      console.warn('! [db-check] Le rôle de test ne permet pas la migration.');
      return;
    }

    // 1. Copie de tables de test seulement, insuffisante comme sauvegarde
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
    console.log('✓ [db-check] Copie locale de test créée ; elle ne remplace pas une sauvegarde vérifiée.');

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
        throw new Error('Contrôle de conservation des lignes de test en échec.');
      }
    }
    const { rows: finalTables } = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [EXPECTED_TABLES],
    );
    if (finalTables[0].n !== EXPECTED_TABLES.length) throw new Error('Schéma de test incomplet.');
    console.log('✓ [db-check] Contrôles de tables et de nombre de lignes de test terminés.');
  } finally {
    await client.end();
  }
}

run().catch(() => {
  console.error('✗ [db-check] Diagnostic refusé ou en échec ; aucun détail de connexion n’est affiché.');
  process.exit(1);
});
