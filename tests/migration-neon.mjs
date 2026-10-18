#!/usr/bin/env node
// Migration « comme sur Neon » : le propriétaire de la base N'EST PAS
// superuser (neondb_owner : CREATEROLE, sans SUPERUSER ni BYPASSRLS).
// Les autres suites migrent avec le superuser local, qui contourne certains
// contrôles de PostgreSQL ; celle-ci vérifie que la migration de production
// passe réellement, deux fois de suite (idempotence), et que le résultat est sûr.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { startEmbeddedPostgres } from '../server/embedded-pg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PG_PORT_MIGRATION || 55436);
const dataDir = path.join(ROOT, '.pgdata-migrationtest');
const OWNER_PASSWORD = 'Proprietaire-Fictif-2026';
const APP_PASSWORD = 'AppFictif-2026-xyz';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('══ Migration avec un propriétaire non-superuser (comme Neon) ══');
rmSync(dataDir, { recursive: true, force: true });
const inst = await startEmbeddedPostgres({ dataDir, port: PORT });
const base = new URL(inst.url);

function urlFor(user, password, database = 'neondb') {
  const u = new URL(base);
  u.username = user;
  u.password = password;
  u.pathname = `/${database}`;
  return u.toString();
}

function migrate() {
  return spawnSync(process.execPath, ['db/migrate.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      DATABASE_URL_ADMIN: urlFor('neondb_owner', OWNER_PASSWORD),
      APP_DB_PASSWORD: APP_PASSWORD,
    },
  });
}

try {
  const su = new pg.Client({ connectionString: inst.url });
  await su.connect();
  await su.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${OWNER_PASSWORD}' CREATEDB CREATEROLE NOSUPERUSER NOBYPASSRLS`);
  await su.query('CREATE DATABASE neondb OWNER neondb_owner');
  await su.end();

  await test('Première migration réussie sans superuser', () => {
    const r = migrate();
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(`${OWNER_PASSWORD}|${APP_PASSWORD}`), 'aucun mot de passe affiché');
  });

  await test('Deuxième migration réussie (idempotente)', () => {
    const r = migrate();
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });

  const owner = new pg.Client({ connectionString: urlFor('neondb_owner', OWNER_PASSWORD) });
  await owner.connect();

  await test('Le rôle défineur ne garde pas le droit CREATE sur le schéma public', async () => {
    const { rows } = await owner.query(
      "SELECT has_schema_privilege('chantierpilot_definer', 'public', 'CREATE') AS can_create");
    assert.equal(rows[0].can_create, false);
  });

  await test('Les fonctions d’authentification appartiennent au rôle défineur', async () => {
    const { rows } = await owner.query(`
      SELECT p.proname, r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.proname LIKE 'api\\_%' ORDER BY 1`);
    assert.ok(rows.length >= 5);
    for (const row of rows) assert.equal(row.rolname, 'chantierpilot_definer', row.proname);
  });

  await test('Le rôle applicatif se connecte, sans superuser ni BYPASSRLS', async () => {
    const app = new pg.Client({ connectionString: urlFor('chantierpilot_app', APP_PASSWORD) });
    await app.connect();
    try {
      const { rows } = await app.query(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      assert.deepEqual(rows[0], { rolsuper: false, rolbypassrls: false });
      // Sans contexte d'entreprise, le RLS ne laisse rien voir.
      const companies = await app.query('SELECT count(*)::int AS n FROM companies');
      assert.equal(companies.rows[0].n, 0);
      // Les fonctions d'authentification (SECURITY DEFINER) restent appelables.
      await app.query("SELECT api_lookup_user('inconnu@exemple.ci')");
    } finally {
      await app.end();
    }
  });

  // Information (non bloquante) pour la stratégie de sauvegarde : pg_dump
  // désactive row_security ; un rôle soumis au RLS forcé est alors refusé.
  try {
    await owner.query('SET row_security = off');
    await owner.query('SELECT 1 FROM companies LIMIT 1');
    console.log('  ℹ pg_dump avec ce propriétaire : lecture autorisée');
  } catch (e) {
    console.log(`  ℹ pg_dump avec un propriétaire sans BYPASSRLS serait refusé (« ${e.message} »).`);
    console.log('    → voir docs/SAUVEGARDES.md : vérifier rolbypassrls du propriétaire Neon.');
  }
  await owner.end();

  console.log(`  RÉSULTAT : ${passed} réussis, 0 échoués`);
} finally {
  await inst.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
