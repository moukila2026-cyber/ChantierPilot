#!/usr/bin/env node
// Migration « comme sur Neon » : le propriétaire de la base N'EST PAS
// superuser (neondb_owner : CREATEROLE, sans SUPERUSER ni BYPASSRLS).
// Vérifie également qu'une base Neon restée sur le schéma initial à 7 tables
// (`schema: "migration_requise"`) ne renvoie JAMAIS d'erreur 500 sur aucune
// route API (ouverture/modification de chantier, rapport PDF, dépenses,
// encaissements, paramètres entreprise, équipe, exports CSV/JSON, modules
// étendus), puis que la migration préserve intégralement les chantiers créés.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

console.log('══ Migration & compatibilité Neon (propriétaire non-superuser + base 7 tables) ══');
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

let apiServer = null;
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
      const companies = await app.query('SELECT count(*)::int AS n FROM companies');
      assert.equal(companies.rows[0].n, 0);
      await app.query("SELECT api_lookup_user('inconnu@exemple.ci')");
    } finally {
      await app.end();
    }
  });

  // Information (non bloquante) pour la stratégie de sauvegarde : pg_dump
  try {
    await owner.query('SET row_security = off');
    await owner.query('SELECT 1 FROM companies LIMIT 1');
    console.log('  ℹ pg_dump avec ce propriétaire : lecture autorisée');
  } catch (e) {
    console.log(`  ℹ pg_dump avec un propriétaire sans BYPASSRLS serait refusé (« ${e.message} »).`);
  }
  await owner.end();

  // Reproduction exacte de l'état Neon de production avant DATABASE_URL_ADMIN :
  // uniquement les 7 tables V1 (companies, app_users, sessions, projects, expenses, payments, audit_log),
  // sans colonnes/fonctions/tables V2.
  const suClean = new pg.Client({ connectionString: urlFor('postgres', base.password, 'neondb') });
  await suClean.connect();
  await suClean.query(`
    DROP FUNCTION IF EXISTS
      api_admin_revoke_sessions(UUID),
      api_is_operator(),
      api_operator_list(),
      api_operator_suspend(UUID, BOOLEAN, TEXT),
      api_billing_company(UUID) CASCADE;
    DROP TABLE IF EXISTS
      payroll_slips, payroll_profiles,
      warehouse_movements, warehouses, schedule_tasks, plan_annotations, plan_versions,
      stock_movements, purchase_orders, inventory_items, site_journal, site_tasks,
      attendance, workers, advance_entries, cash_advances, price_items,
      commercial_documents, operation_requests,
      platform_actions, platform_operators, billing_orders CASCADE;
    ALTER TABLE payments DROP COLUMN IF EXISTS invoice_id CASCADE;
    ALTER TABLE companies
      DROP COLUMN IF EXISTS tax_number CASCADE,
      DROP COLUMN IF EXISTS tax_regime CASCADE,
      DROP COLUMN IF EXISTS billing_plan CASCADE,
      DROP COLUMN IF EXISTS trial_until CASCADE,
      DROP COLUMN IF EXISTS paid_until CASCADE,
      DROP COLUMN IF EXISTS billing_suspended CASCADE;
  `);
  const v1Tables = (await suClean.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1",
  )).rows.map((r) => r.table_name);
  await suClean.end();
  assert.deepEqual(v1Tables, [
    'app_users', 'audit_log', 'companies', 'expenses', 'payments', 'projects', 'sessions',
  ]);

  process.env.DATABASE_URL = urlFor('chantierpilot_app', APP_PASSWORD);
  process.env.SESSION_SECRET = 'secret-test-compatibilite-neon-7-tables-2026-abcdef';
  process.env.APP_URL = 'http://127.0.0.1:0';
  const { createApiServer } = await import('../server/dev.mjs');
  apiServer = createApiServer();
  await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  let cookie = '';

  async function req(method, route, body) {
    const headers = { Origin: apiBase };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${apiBase}${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, ct };
  }

  let preMigrationProjectId = '';

  await test('Base 7 tables (migration_requise) : santé, inscription, essai 14j et fiche chantier sans aucun 500', async () => {
    const health = await req('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.schema, 'migration_requise');

    const reg = await req('POST', '/api/auth/register', {
      company: { name: 'IVOIRE BTP COMPAT', phone: '+225 07 00 11 22 33', city: 'Abidjan' },
      user: { full_name: 'Kouassi Yao', email: 'compat-v1@ivoirebtp.ci', password: 'MotDePasseSolide!2026' },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));

    const billing = await req('GET', '/api/billing');
    assert.equal(billing.status, 200);
    assert.equal(billing.data.trial_days_remaining, 14, `Essai 14j attendu, reçu ${JSON.stringify(billing.data)}`);

    const dash = await req('GET', '/api/dashboard');
    assert.equal(dash.status, 200);

    const created = await req('POST', '/api/projects', {
      name: 'Villa Duplex Riviera 4',
      client_name: 'M. Konan',
      location: 'Cocody Riviera 4',
      budget: 85000000,
      start_date: '2026-10-20',
      status: 'en_cours',
      notes: 'Chantier créé avant migration SQL Neon',
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    preMigrationProjectId = created.data.project.id;

    // Cas exact signalé en production : ouverture immédiate de /api/projects/:id !
    const detail = await req('GET', `/api/projects/${preMigrationProjectId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.data));
    assert.equal(detail.data.project.name, 'Villa Duplex Riviera 4');
    assert.equal(detail.data.totals.budget, 85000000);
    assert.equal(detail.data.commercial, null);

    const patched = await req('PATCH', `/api/projects/${preMigrationProjectId}`, {
      notes: 'Gros œuvre démarré sans erreur 500',
    });
    assert.equal(patched.status, 200);

    const pdf = await req('GET', `/api/projects/${preMigrationProjectId}/report`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
  });

  await test('Base 7 tables : CRUD complet dépenses, encaissements, entreprise, équipe, audit & exports CSV/JSON', async () => {
    const exp = await req('POST', '/api/expenses', {
      project_id: preMigrationProjectId,
      category: 'materiaux',
      amount: 1250000,
      expense_date: '2026-10-20',
      supplier: ' Bernabé CI ',
      description: 'Ciment CPJ 42.5 (10 tonnes)',
    });
    assert.equal(exp.status, 201);
    const expPatch = await req('PATCH', `/api/expenses/${exp.data.expense.id}`, { amount: 1300000 });
    assert.equal(expPatch.status, 200, JSON.stringify(expPatch.data));
    const expDel = await req('DELETE', `/api/expenses/${exp.data.expense.id}`);
    assert.equal(expDel.status, 200, JSON.stringify(expDel.data));

    const pay = await req('POST', '/api/payments', {
      project_id: preMigrationProjectId,
      client_name: 'M. Konan',
      amount: 15000000,
      payment_date: '2026-10-20',
      reference: 'VIR-SGBCI-001',
      payment_method: 'virement_bancaire',
      memo: 'Acompte démarrage',
    });
    assert.equal(pay.status, 201);
    const payPatch = await req('PATCH', `/api/payments/${pay.data.payment.id}`, { amount: 16000000 });
    assert.equal(payPatch.status, 200, JSON.stringify(payPatch.data));

    const comp = await req('PATCH', '/api/company', {
      name: 'IVOIRE BTP COMPAT SARL',
      rccm: 'CI-ABJ-2026-B-99999',
      tax_number: '2600999A',
      tax_regime: 'Réel normal d’imposition (RNI)',
    });
    assert.equal(comp.status, 200, JSON.stringify(comp.data));

    const member = await req('POST', '/api/team', {
      full_name: 'Agent Terrain Test',
      email: 'agent-v1@ivoirebtp.ci',
      password: 'MotDePasseAgent!2026',
    });
    assert.equal(member.status, 201);
    const memberDeact = await req('PATCH', `/api/team/${member.data.user.id}`, { is_active: false });
    assert.equal(memberDeact.status, 200, JSON.stringify(memberDeact.data));

    const exportJson = await req('GET', '/api/export?scope=all&format=json');
    assert.equal(exportJson.status, 200);
    assert.equal(exportJson.data.projects.length, 1);
    assert.equal(exportJson.data.payments.length, 1);

    const exportCsv = await req('GET', '/api/export?scope=payments&format=csv');
    assert.equal(exportCsv.status, 200);

    const payDel = await req('DELETE', `/api/payments/${pay.data.payment.id}`);
    assert.equal(payDel.status, 200, JSON.stringify(payDel.data));

    const auditRes = await req('GET', '/api/audit');
    assert.equal(auditRes.status, 200);
  });

  await test('Base 7 tables : modules étendus renvoient 200 en lecture et 503 explicite en écriture (jamais 500)', async () => {
    const docs = await req('GET', '/api/documents');
    assert.equal(docs.status, 200);
    assert.equal(docs.data.schema_migration_required, true);

    const docsWrite = await req('POST', '/api/documents', {
      action: 'price',
      request_id: crypto.randomUUID(),
      label: 'Béton dosé à 350 kg/m3',
      unit: 'm3',
      unit_price: 85000,
      unit_cost: 62000,
    });
    assert.equal(docsWrite.status, 503);
    assert.equal(docsWrite.data.error.code, 'migration_requise');

    const ops = await req('GET', '/api/operations');
    assert.equal(ops.status, 200);
    assert.equal(ops.data.schema_migration_required, true);

    const opsPdf = await req('GET', `/api/operations?report_project=${preMigrationProjectId}`);
    assert.equal(opsPdf.status, 200);
    assert.equal(opsPdf.data.subarray(0, 5).toString(), '%PDF-');

    const adv = await req('GET', '/api/advanced');
    assert.equal(adv.status, 200);
    assert.equal(adv.data.schema_migration_required, true);

    const op = await req('GET', '/api/operator');
    assert.equal(op.status, 403);
  });

  await test('Mise à niveau SQL ultérieure : préservation à 100 % du chantier existant et activation complète', async () => {
    const { closePools } = await import('../api/_lib/db.js');
    await closePools();
    const r = migrate();
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const health = await req('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.schema, 'ok');

    const detail = await req('GET', `/api/projects/${preMigrationProjectId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.project.name, 'Villa Duplex Riviera 4');
    assert.ok(detail.data.commercial !== null);

    const docsWrite = await req('POST', '/api/documents', {
      action: 'price',
      request_id: crypto.randomUUID(),
      label: 'Béton dosé à 350 kg/m3',
      unit: 'm3',
      unit_price: 85000,
      unit_cost: 62000,
    });
    assert.equal(docsWrite.status, 201);
  });

  apiServer.closeAllConnections?.();
  console.log(`  RÉSULTAT : ${passed} réussis, 0 échoués`);
} finally {
  if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
  const { closePools } = await import('../api/_lib/db.js').catch(() => ({ closePools: null }));
  if (closePools) await closePools().catch(() => {});
  await inst.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
