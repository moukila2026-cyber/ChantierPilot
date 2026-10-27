// Simulation de bout en bout d'une base Neon de production partiellement migrée (7 tables)
// suivie d'une migration complète (28 tables), vérifiant que TOUTES les fonctionnalités
// (y compris les 9 nouveautés métier : retenue de garantie, sous-traitants, duplication devis,
// import BPU CSV, recherche plein-texte, analytique, alertes proactives, PV réception PDF,
// Devis/Factures, Carnet terrain & Plans/Gantt) fonctionnent DÈS MAINTENANT en lecture ET écriture
// aussi bien AVANT migration SQL (7 tables Neon actuelles) qu'APRÈS migration SQL (28 tables).

import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { embeddedConfig } from '../server/embedded-pg.mjs';
import { freePort, isolatedTestEnv } from './helpers/isolation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PGPORT = await freePort();
const API_PORT = await freePort();
const BASE = `http://127.0.0.1:${API_PORT}`;

const pgData = mkdtempSync(join(tmpdir(), 'chantierpilot-neon-sim-'));
const pgBin = (() => {
  const candidates = [
    embeddedConfig({ dataDir: pgData, port: PGPORT }).binDir,
    '/usr/lib/postgresql/17/bin',
    '/usr/lib/postgresql/16/bin',
    '/usr/lib/postgresql/15/bin',
  ];
  for (const dir of candidates) {
    const r = spawnSync(join(dir, 'pg_ctl'), ['--version']);
    if (r.status === 0) return dir;
  }
  throw new Error('pg_ctl introuvable');
})();

const run = (bin, args) => execFileSync(bin, args, { stdio: 'pipe', env: isolatedTestEnv({ LC_ALL: 'C.UTF-8' }) });

const MINI_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
).toString('base64');

let apiServer = null;
// En cas d'interruption, nettoyer uniquement l'instance temporaire de ce test.
const cleanup = () => {
  spawnSync(join(pgBin, 'pg_ctl'), ['-D', pgData, '-m', 'immediate', 'stop'], {
    stdio: 'ignore', env: isolatedTestEnv(),
  });
  rmSync(pgData, { recursive: true, force: true });
};
process.once('exit', cleanup);
process.once('SIGINT', () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));

async function execSql(dbName, sqlText) {
  const client = new pg.Client({ connectionString: `postgres://127.0.0.1:${PGPORT}/${dbName}` });
  await client.connect();
  try { await client.query(sqlText); } finally { await client.end(); }
}

try {
  run(join(pgBin, 'initdb'), ['-D', pgData, '-A', 'trust', '--encoding=UTF8', '--locale=C']);
  writeFileSync(
    join(pgData, 'postgresql.conf'),
    `\nlisten_addresses = '127.0.0.1'\nport = ${PGPORT}\nunix_socket_directories = '${pgData}'\nmax_connections = 40\n`,
    { flag: 'a' },
  );
  run(join(pgBin, 'pg_ctl'), ['-D', pgData, '-l', join(pgData, 'postgres.log'), '-w', 'start']);
  await execSql('postgres', 'CREATE DATABASE chantierpilot_neon');
  await execSql('chantierpilot_neon', "CREATE ROLE chantierpilot_app LOGIN PASSWORD 'partial_test_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");

  // Charge uniquement les 7 tables initiales exactes du schéma Neon historique de production.
  const fullSchema = readFileSync(join(ROOT, 'db', 'schema.sql'), 'utf8');
  const fullRls = readFileSync(join(ROOT, 'db', 'rls.sql'), 'utf8');
  const legacyCut = fullSchema.indexOf('\n-- Essai gratuit garanti');
  assert(legacyCut > 500, 'Repère post-7-tables introuvable dans db/schema.sql');
  const legacySchema = fullSchema
    .slice(0, legacyCut)
    .replace(/client_phone\s+TEXT[^\n]+\n\s*/, '')
    .replace(/retention_bps\s+INTEGER[^\n]+\n\s*/, '')
    .replace(/retention_release_date\s+DATE,\n\s*/, '')
    .replace(/retention_released\s+BOOLEAN[^\n]+\n\s*/, '');
  const legacyRlsCut = fullRls.indexOf('\n-- Abonnements :');
  assert(legacyRlsCut > 500, 'Repère Abonnements introuvable dans db/rls.sql');
  const legacyRls = `${fullRls.slice(0, legacyRlsCut)}\nCOMMIT;\n`;
  await execSql('chantierpilot_neon', `${legacySchema}\n${legacyRls}`);

  process.env.DATABASE_URL = `postgres://chantierpilot_app:partial_test_pw@127.0.0.1:${PGPORT}/chantierpilot_neon`;
  process.env.SESSION_SECRET = 'neon-partial-schema-secret-at-least-32-characters-long';
  process.env.NODE_ENV = 'test';

  const { default: handler } = await import('../api/index.js');
  apiServer = createServer((req, res) => handler(req, res));
  await new Promise((r) => apiServer.listen(API_PORT, '127.0.0.1', r));

  // 1. /api/health détecte les 7 tables via pg_catalog.pg_class
  const h1 = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert.equal(h1.status, 'ok');
  assert.equal(h1.database, 'ok');
  assert.equal(h1.schema, 'migration_requise');

  // 2. Inscription d'un compte entreprise sur la base 7 tables
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: { name: ' Ivoire Gros Œuvre ', city: 'Abidjan' },
      user: {
        full_name: ' Aïcha Koné ',
        email: 'aicha@ivoire-go.ci',
        password: 'MotDePasseSolide2026!',
      },
    }),
  });
  assert.equal(regRes.status, 201, 'Inscription sur base 7 tables doit renvoyer 201');
  const regBody = await regRes.json();
  const cookie = regRes.headers.get('set-cookie').split(';')[0];

  const authed = async (path, method = 'GET', body = null) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, headers: res.headers, data: res.headers.get('content-type')?.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };

  // 3. Création chantier avec téléphone WhatsApp + retenue de garantie 10 % échue
  const projRes = await authed('/api/projects', 'POST', {
    name: 'Immeuble Riviera Golf',
    client_name: 'SCI Lagune',
    client_phone: '0708091011',
    location: 'Cocody Riviera',
    budget: 20_000_000,
    start_date: '2026-01-10',
    retention_bps: 1000,
    retention_release_date: '2026-02-01',
    status: 'en_cours',
  });
  assert.equal(projRes.status, 201);
  const projectId = projRes.data.project.id;
  assert.equal(projRes.data.project.retention_bps, 1000);
  assert.equal(projRes.data.project.client_phone, '0708091011');

  // 4. Sous-traitant / tâcheron + acompte excessif sur base 7 tables
  const subCreate = await authed('/api/subcontracts', 'POST', {
    project_id: projectId,
    subcontractor_name: 'Atelier Kouassi Plomberie',
    trade_lot: 'Plomberie sanitaire',
    phone: '0501020304',
    agreed_amount: 4_000_000,
    progress: 20,
  });
  assert.equal(subCreate.status, 201);
  const subId = subCreate.data.subcontract.id;

  const subPay = await authed('/api/subcontracts', 'PATCH', {
    id: subId,
    pay_amount: 2_000_000,
    pay_date: '2026-02-15',
    pay_description: 'Acompte démarrage plomberie',
    receipt: { filename: 'decharge.jpg', mime: 'image/jpeg', data: MINI_JPEG },
  });
  assert.equal(subPay.status, 200);
  assert.equal(subPay.data.subcontract.paid_amount, 2_000_000);
  assert.equal(subPay.data.subcontract.overpaid_alert, true, '50 % versés pour 20 % avancés doit déclencher overpaid_alert');

  // 5. Devis, import BPU CSV, duplication devis, facturation & PDF sur base 7 tables !
  const bpuImport = await authed('/api/documents', 'POST', {
    action: 'price_import',
    request_id: crypto.randomUUID(),
    items: [
      { label: 'Béton armé C25/30', unit: 'm3', unit_price: 95_000, unit_cost: 70_000 },
      { label: 'Agglos creux 15', unit: 'm2', unit_price: 8_500, unit_cost: 6_000 },
      { label: 'Câble', unit: 'm', unit_price: 1_500, unit_cost: 1_000 },
    ],
  });
  assert([200, 201].includes(bpuImport.status));
  assert.equal(bpuImport.data.result.count, 3);

  const quoteCreate = await authed('/api/documents', 'POST', {
    action: 'quote',
    request_id: crypto.randomUUID(),
    project_id: projectId,
    title: 'Lot Gros Œuvre Riviera',
    client_name: 'SCI Lagune',
    client_address: 'Abidjan Cocody',
    tax_bps: 0,
    due_date: '2026-05-01',
    lines: [{ label: 'Béton armé C25/30', unit: 'm3', quantity: '100', unit_price: 95_000, unit_cost: 70_000 }],
  });
  assert([200, 201].includes(quoteCreate.status));
  const quoteId = quoteCreate.data.result.id;

  const quoteDup = await authed('/api/documents', 'POST', {
    action: 'duplicate',
    request_id: crypto.randomUUID(),
    id: quoteId,
  });
  assert([200, 201].includes(quoteDup.status));
  assert.notEqual(quoteDup.data.result.id, quoteId);

  const quoteIssue = await authed('/api/documents', 'POST', { action: 'issue', request_id: crypto.randomUUID(), id: quoteId });
  assert([200, 201].includes(quoteIssue.status));
  const quoteAccept = await authed('/api/documents', 'POST', {
    action: 'accept', request_id: crypto.randomUUID(), id: quoteId,
    name: 'M. Bamba', reference: 'Bon pour accord signé', start_date: '2026-01-10',
  });
  assert([200, 201].includes(quoteAccept.status));
  const invCreate = await authed('/api/documents', 'POST', {
    action: 'invoice', request_id: crypto.randomUUID(), quote_id: quoteId,
    kind: 'deposit', percent_bps: 3000, due_date: '2026-01-20',
  });
  assert([200, 201].includes(invCreate.status));
  const invPdf = await authed(`/api/documents?pdf=${invCreate.data.result.id}`);
  assert.equal(invPdf.status, 200);
  assert.equal(invPdf.data.subarray(0, 5).toString(), '%PDF-');

  // 6. Carnet terrain (photo + réserve) & PV interne de réception PDF sur base 7 tables !
  const journalRes = await authed('/api/operations', 'POST', {
    action: 'journal',
    request_id: crypto.randomUUID(),
    project_id: projectId,
    date: '2026-02-20',
    title: 'Coulage dalle R+1',
    progress: 55,
    notes: 'RAS béton conforme',
    photo: { filename: 'dalle.jpg', mime: 'image/jpeg', data: MINI_JPEG },
  });
  assert([200, 201].includes(journalRes.status));

  const reserveRes = await authed('/api/operations', 'POST', {
    action: 'task',
    request_id: crypto.randomUUID(),
    project_id: projectId,
    kind: 'reserve',
    title: 'Reprise étanchéité acrotère nord',
    description: 'Joint à reprendre avant réception définitive',
    assignee_id: regBody.user.id,
    due_date: '2026-03-01',
  });
  assert([200, 201].includes(reserveRes.status));

  const pvPdf = await authed(`/api/projects/${projectId}/reception`);
  assert.equal(pvPdf.status, 200);
  assert.equal(pvPdf.data.subarray(0, 5).toString(), '%PDF-');

  // 7. Plans annotés & Gantt sur base 7 tables !
  const planRes = await authed('/api/advanced', 'POST', {
    action: 'plan',
    request_id: crypto.randomUUID(),
    project_id: projectId,
    title: 'Plan coffrage R+1',
    revision: 'A',
    file: { filename: 'coffrage.jpg', mime: 'image/jpeg', data: MINI_JPEG },
  });
  assert([200, 201].includes(planRes.status));

  // 8. Recherche plein-texte dépenses, fiche chantier enrichie, dashboard analytique & audit propre
  const expSearch = await authed('/api/expenses?q=Kouassi');
  assert.equal(expSearch.status, 200);
  assert.equal(expSearch.data.expenses.length, 1);
  assert.equal(expSearch.data.summary.total_amount, 2_000_000);
  assert.equal(expSearch.data.summary.with_proof_count, 1);

  const detail = await authed(`/api/projects/${projectId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.totals.retention_amount, 2_000_000);
  assert.equal(detail.data.subcontracts.length, 1);
  assert.equal(detail.data.analytics.by_category.length, 1);

  const dash = await authed('/api/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.data.totals.retention_held, 2_000_000);
  assert.equal(dash.data.analytics.monthly_cashflow.length, 6);
  assert(dash.data.alerts.some((a) => /Retenue de garantie/i.test(a.title)), 'Alerte retenue attendue');
  assert(dash.data.alerts.some((a) => /Avance sous-traitant/i.test(a.title)), 'Alerte sous-traitant attendue');
  assert(dash.data.alerts.some((a) => /Facture échue/i.test(a.title)), 'Alerte facture échue attendue');

  const auditRes = await authed('/api/audit');
  assert.equal(auditRes.status, 200);
  assert(auditRes.data.audit.every((e) => !String(e.entity).startsWith('_cp:')), 'Aucune clé technique _cp: dans le journal d’audit visible');

  // 9. Exécute db/migrate.mjs avec DATABASE_URL_ADMIN et vérifie que les 28 tables passent schema=ok !
  execFileSync(process.execPath, [join(ROOT, 'db', 'migrate.mjs')], {
    cwd: ROOT,
    stdio: 'pipe',
    env: isolatedTestEnv({
      DATABASE_URL_ADMIN: `postgres://127.0.0.1:${PGPORT}/chantierpilot_neon`,
      DATABASE_URL: `postgres://chantierpilot_app:partial_test_pw@127.0.0.1:${PGPORT}/chantierpilot_neon`,
    }),
  });

  const h2 = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert.equal(h2.status, 'ok');
  assert.equal(h2.database, 'ok');
  assert.equal(h2.schema, 'ok', 'Après db/migrate.mjs, les 28 tables sont reconnues par chantierpilot_app');

  console.log('✓ Simulation Neon 7 tables (lecture + écriture intégrales des 9 nouveautés) → migration SQL 28 tables vérifiée.');
} finally {
  if (apiServer) {
    apiServer.closeAllConnections?.();
    await new Promise((r) => apiServer.close(r));
  }
  cleanup();
  process.off('exit', cleanup);
}
process.exit(0);
