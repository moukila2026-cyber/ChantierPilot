// Vérifie le quota partagé sur deux API, avec une base PostgreSQL jetable.
// Aucune donnée de connexion, adresse de test ou fixture n'est affichée.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { startEmbeddedPostgres, forceCleanup } from '../server/embedded-pg.mjs';
import { freePort, isolatedTestEnv } from './helpers/isolation.mjs';
import { registrationClientIp } from '../api/_lib/register-rate-limit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'chantierpilot-register-limit-'));
const dataDir = path.join(dir, 'pg');
let postgres, owner, pool;
const apis = [];
let cleaned = false;

function cleanupSync() {
  if (cleaned) return;
  cleaned = true;
  for (const child of apis) {
    if (child && child.exitCode === null && !child.killed) {
      try { child.kill('SIGKILL'); } catch { /* déjà arrêté */ }
    }
  }
  try { forceCleanup(dataDir); } catch { /* déjà arrêté */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* déjà supprimé */ }
}
process.once('exit', cleanupSync);
process.once('SIGINT', () => { cleanupSync(); process.exit(130); });
process.once('SIGTERM', () => { cleanupSync(); process.exit(143); });

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function waitReady(port, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('API de test arrêtée avant son démarrage.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* attendre l'API de test */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API de test indisponible.');
}

async function waitListening(port, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('API de test arrêtée avant son démarrage.');
    const ready = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API de test indisponible.');
}

function newApi(port, database, preview = false) {
  const child = spawn(process.execPath, ['server/dev.mjs'], {
    cwd: root,
    env: isolatedTestEnv({
      DATABASE_URL: database,
      DB_DRIVER: 'pg',
      API_PORT: String(port),
      ...(preview ? { VERCEL_ENV: 'preview' } : {}),
    }),
    stdio: 'ignore',
  });
  apis.push(child);
  return child;
}

const randomHash = () => randomBytes(32).toString('hex');
const usedIps = new Set();
const testIp = () => {
  let ip;
  do {
    const bytes = randomBytes(2);
    ip = `198.18.${bytes[0]}.${bytes[1]}`;
  } while (usedIps.has(ip));
  usedIps.add(ip);
  return ip;
};
async function register(port, ip, preview = false) {
  return fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(preview ? { 'x-vercel-forwarded-for': ip } : { 'x-forwarded-for': ip }),
    },
    body: '{}',
    signal: AbortSignal.timeout(15_000),
  });
}

try {
  const [pgPort, portA, portB, portPreview, portCold] = await Promise.all([
    freePort(), freePort(), freePort(), freePort(), freePort(),
  ]);
  postgres = await startEmbeddedPostgres({ dataDir, port: pgPort, persist: true });
  const migration = spawnSync(process.execPath, ['db/migrate.mjs'], {
    cwd: root,
    env: isolatedTestEnv({ DB_DRIVER: 'pg', DATABASE_URL_ADMIN: postgres.url, DATABASE_URL: postgres.url }),
    stdio: 'ignore', timeout: 30_000,
  });
  assert.equal(migration.status, 0, 'Migration de la base de test échouée.');

  owner = new pg.Client({ connectionString: postgres.url });
  await owner.connect();
  const limitedUrl = new URL(postgres.url);
  limitedUrl.username = 'chantierpilot_app';
  limitedUrl.password = '';
  pool = new pg.Pool({ connectionString: limitedUrl.toString(), max: 30 });

  // Accès au compteur limité à la fonction : pas de lecture directe par l'API.
  await assert.rejects(pool.query('SELECT * FROM public.rate_limit_counters'), (error) => error.code === '42501');
  const flags = await owner.query(`SELECT relrowsecurity, relforcerowsecurity
    FROM pg_catalog.pg_class WHERE oid = 'public.rate_limit_counters'::regclass`);
  assert.equal(flags.rows[0].relrowsecurity && flags.rows[0].relforcerowsecurity, true);

  // Deux clients ne doivent pas pouvoir falsifier l'adresse en auto-hébergement.
  const forged = testIp();
  const socketIp = testIp();
  const req = { headers: { 'x-forwarded-for': forged }, socket: { remoteAddress: socketIp } };
  assert.equal(registrationClientIp(req, { NODE_ENV: 'production' }) === socketIp, true);
  assert.equal(registrationClientIp(req, { NODE_ENV: 'test' }) === forged, true);
  assert.equal(registrationClientIp({ headers: {}, socket: { remoteAddress: socketIp } }, { VERCEL_ENV: 'preview' }), null);
  assert.equal(registrationClientIp({ headers: {}, socket: { remoteAddress: `::ffff:${socketIp}` } }, { NODE_ENV: 'production' }) === socketIp, true);

  // Appels SQL concurrents : exactement dix succès sur une même empreinte.
  const shared = randomHash();
  const direct = await Promise.all(Array.from({ length: 30 }, () =>
    pool.query('SELECT allowed, retry_after FROM public.api_rate_limit_hit($1)', [shared])));
  assert.equal(direct.filter((r) => r.rows[0].allowed).length, 10);
  assert.equal(direct.filter((r) => !r.rows[0].allowed).length, 20);
  assert.equal(direct.filter((r) => !r.rows[0].allowed).every((r) => r.rows[0].retry_after >= 1 && r.rows[0].retry_after <= 3600), true);
  assert.equal((await pool.query('SELECT allowed FROM public.api_rate_limit_hit($1)', [randomHash()])).rows[0].allowed, true);
  await assert.rejects(pool.query('DELETE FROM public.rate_limit_counters'), (error) => error.code === '42501');

  // Le nettoyage d'une ligne expirée ne doit jamais faire perdre un contrôle
  // de quota pendant que plusieurs processus recréent/utilisent cette ligne.
  const racing = randomHash();
  await owner.query(`INSERT INTO public.rate_limit_counters (scope, subject_hash, hits, expires_at)
    VALUES ('register', $1, ARRAY[now() - interval '61 minutes'], now() - interval '1 minute')`, [racing]);
  const race = await Promise.all(Array.from({ length: 60 }, (_, n) => n % 2
    ? pool.query('SELECT public.api_rate_limit_cleanup()')
    : pool.query('SELECT allowed FROM public.api_rate_limit_hit($1)', [racing])));
  assert.equal(race.filter((result) => result.rows[0]?.allowed === true).length, 10);
  assert.equal(race.filter((result) => result.rows[0]?.allowed === false).length, 20);

  // Réappliquer la migration préserve les compteurs et les privilèges préexistants.
  const migrationSql = readFileSync(path.join(root, 'db', 'migrations', '20261027_register_rate_limit.sql'), 'utf8');
  const before = await owner.query('SELECT cardinality(hits) AS n FROM public.rate_limit_counters WHERE subject_hash = $1', [shared]);
  const createBefore = await owner.query("SELECT has_schema_privilege('chantierpilot_definer', 'public', 'CREATE') AS ok");
  await owner.query(migrationSql);
  const after = await owner.query('SELECT cardinality(hits) AS n FROM public.rate_limit_counters WHERE subject_hash = $1', [shared]);
  const createAfter = await owner.query("SELECT has_schema_privilege('chantierpilot_definer', 'public', 'CREATE') AS ok");
  assert.equal(after.rows[0].n, before.rows[0].n);
  assert.equal(createAfter.rows[0].ok, createBefore.rows[0].ok);
  // Une table portant ce nom mais non identifiée ne doit pas être reprise.
  await owner.query('COMMENT ON TABLE public.rate_limit_counters IS NULL');
  try {
    await assert.rejects(owner.query(migrationSql), (error) => error.code === 'P0001');
  } finally {
    await owner.query('ROLLBACK');
    await owner.query("COMMENT ON TABLE public.rate_limit_counters IS 'chantierpilot:register-rate-limit:v1'");
  }

  // Fenêtre glissante : des entrées encore récentes bloquent, des entrées
  // expirées libèrent le quota ; le nettoyage ne touche qu'aux compteurs.
  await owner.query(`UPDATE public.rate_limit_counters
    SET hits = ARRAY(SELECT now() - interval '59 minutes' FROM generate_series(1, 10)),
        expires_at = now() + interval '1 minute' WHERE subject_hash = $1`, [shared]);
  const stillBlocked = await pool.query('SELECT allowed, retry_after FROM public.api_rate_limit_hit($1)', [shared]);
  assert.equal(stillBlocked.rows[0].allowed, false);
  assert.equal(stillBlocked.rows[0].retry_after >= 1 && stillBlocked.rows[0].retry_after <= 60, true);
  await owner.query(`UPDATE public.rate_limit_counters
    SET hits = ARRAY[now() - interval '61 minutes'], expires_at = now() - interval '1 minute'
    WHERE subject_hash = $1`, [shared]);
  assert.equal((await pool.query('SELECT allowed FROM public.api_rate_limit_hit($1)', [shared])).rows[0].allowed, true);
  const expired = randomHash();
  await owner.query(`INSERT INTO public.rate_limit_counters (scope, subject_hash, hits, expires_at)
    VALUES ('register', $1, ARRAY[now() - interval '61 minutes'], now() - interval '1 minute')`, [expired]);
  assert.equal((await pool.query('SELECT public.api_rate_limit_cleanup() AS n')).rows[0].n >= 1, true);

  const apiA = newApi(portA, limitedUrl.toString());
  const apiB = newApi(portB, limitedUrl.toString());
  await Promise.all([waitReady(portA, apiA), waitReady(portB, apiB)]);
  const ip = testIp();
  for (let n = 0; n < 10; n++) {
    assert.equal((await register(n % 2 ? portA : portB, ip)).status, 422);
  }
  const refused = await register(portA, ip);
  assert.equal(refused.status, 429);
  assert.equal(Number(refused.headers.get('retry-after')) >= 1, true);
  assert.equal((await register(portB, testIp())).status, 422);

  // L'atomicité est aussi vérifiée à travers deux processus HTTP indépendants.
  const concurrentIp = testIp();
  const concurrent = await Promise.all(Array.from({ length: 25 }, (_, n) =>
    register(n % 2 ? portA : portB, concurrentIp)));
  assert.equal(concurrent.filter((response) => response.status === 422).length, 10);
  assert.equal(concurrent.filter((response) => response.status === 429).length, 15);

  // Au premier pic d'une nouvelle instance, un seul pool est initialisé et
  // son plafond de connexions reste respecté même sous accès simultanés.
  const cold = newApi(portCold, limitedUrl.toString());
  await waitListening(portCold, cold); // sans appeler health, qui initialiserait le pool
  const connectionCount = async () => (await owner.query(
    "SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity WHERE usename = 'chantierpilot_app'",
  )).rows[0].n;
  const beforeCold = await connectionCount();
  const coldIp = testIp();
  const coldReplies = await Promise.all(Array.from({ length: 20 }, () => register(portCold, coldIp)));
  assert.equal(coldReplies.filter((response) => response.status === 422).length, 10);
  assert.equal(coldReplies.filter((response) => response.status === 429).length, 10);
  assert.equal((await connectionCount()) - beforeCold <= 5, true, 'Trop de connexions au démarrage concurrent.');

  // Une indisponibilité de la fonction ne doit pas ouvrir l'inscription.
  await owner.query('REVOKE EXECUTE ON FUNCTION public.api_rate_limit_hit(TEXT) FROM chantierpilot_app');
  assert.equal((await register(portA, testIp())).status, 503);
  await owner.query('GRANT EXECUTE ON FUNCTION public.api_rate_limit_hit(TEXT) TO chantierpilot_app');
  await owner.query('DROP FUNCTION public.api_rate_limit_hit(TEXT)'); // uniquement dans cette base jetable
  const preview = newApi(portPreview, limitedUrl.toString(), true);
  await waitReady(portPreview, preview);
  assert.equal((await register(portPreview, testIp(), true)).status, 503);
  console.log('✓ Quota partagé, concurrence, isolation RLS et refus sûr vérifiés sur base fictive.');
} finally {
  for (const child of apis) await stopChild(child);
  await pool?.end();
  await owner?.end();
  await postgres?.stop();
  cleanupSync();
}
