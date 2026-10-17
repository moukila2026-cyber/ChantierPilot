// PostgreSQL embarqué (développement / tests locaux).
// Utilise les binaires officiels PostgreSQL fournis par le paquet npm
// @embedded-postgres, sans dépendance à un serveur système.
// En production, on utilise Neon (DATABASE_URL) — ce module n'est alors pas lancé.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORM_PKG = {
  'linux-x64': '@embedded-postgres/linux-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
}[`${process.platform}-${process.arch}`];

function binDir() {
  if (!PLATFORM_PKG) {
    throw new Error(`Plateforme non supportée pour PostgreSQL embarqué : ${process.platform}-${process.arch}`);
  }
  return path.join(ROOT, 'node_modules', PLATFORM_PKG, 'native', 'bin');
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', env: process.env, ...opts });
  return res;
}

export function embeddedConfig({ dataDir, port }) {
  return {
    binDir: binDir(),
    dataDir,
    port,
    user: 'postgres',
    database: 'chantierpilot',
  };
}

/** Arrêt de force d'un serveur orphelin lié à ce dataDir (nettoyage de test). */
export function forceCleanup(dataDir) {
  const pgCtl = path.join(binDir(), 'pg_ctl');
  if (existsSync(dataDir)) {
    run(pgCtl, ['-D', dataDir, '-m', 'immediate', 'stop']);
  }
  // Tue un éventuel postmaster orphelin dont la ligne de commande porte ce
  // dataDir — en excluant notre propre processus et ses parents directs.
  const script = `for pid in $(pgrep -f -- "${dataDir}" 2>/dev/null); do
    [ "$pid" != "$$" ] && [ "$pid" != "${process.pid}" ] && [ "$pid" != "$PPID" ] && kill -9 "$pid" 2>/dev/null
  done; true`;
  run('bash', ['-lc', script]);
}

/** Initialise (si besoin) et démarre PostgreSQL. Renvoie l'URL de connexion. */
export async function startEmbeddedPostgres({
  dataDir = path.join(ROOT, '.pgdata'),
  port = 55432,
  persist = true,
} = {}) {
  const bin = binDir();
  const initdb = path.join(bin, 'initdb');
  const pgCtl = path.join(bin, 'pg_ctl');
  const stamp = path.join(dataDir, '.chantierpilot-ok');

  if (!persist && existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }

  if (!existsSync(stamp)) {
    mkdirSync(dataDir, { recursive: true });
    // Locale C.UTF8 : disponible partout (contrairement à en_US.UTF-8).
    const r = run(initdb, [
      '-D', dataDir,
      '-U', 'postgres',
      '--auth=trust',
      '--encoding=UTF8',
      '--locale=C.UTF8',
    ]);
    if (r.status !== 0) {
      throw new Error(`initdb a échoué : ${r.stderr || r.stdout}`);
    }
    writeFileSync(stamp, new Date().toISOString());
  }

  // Démarrage (idempotent : pg_ctl renvoie 0 si déjà lancé avec -w).
  const start = run(pgCtl, ['-D', dataDir, '-l', path.join(dataDir, 'server.log'), '-w', '-t', '30',
    '-o', `-p ${port} -c listen_addresses=127.0.0.1 -k ${dataDir}`, 'start']);
  if (start.status !== 0 && !/already running/i.test(start.stdout + start.stderr)) {
    throw new Error(`pg_ctl start a échoué : ${start.stderr || start.stdout}`);
  }

  // Création de la base applicative si absente (via le protocole PostgreSQL).
  const pg = (await import('pg')).default;
  const admin = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'chantierpilot'");
    if (rows.length === 0) {
      await admin.query('CREATE DATABASE chantierpilot');
    }
  } finally {
    await admin.end();
  }

  return {
    url: `postgresql://postgres@127.0.0.1:${port}/chantierpilot`,
    adminUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    dataDir,
    port,
    stop: async () => {
      run(pgCtl, ['-D', dataDir, '-m', 'fast', 'stop']);
    },
  };
}
