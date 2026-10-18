// npm run dev — démarre l'environnement complet :
//   1. PostgreSQL embarqué si aucune base n'est configurée (démo/développement)
//   2. Migration du schéma + RLS (avec DATABASE_URL_ADMIN si fournie)
//   3. Serveur API local (même routeur que Vercel)
//   4. Vite (interface React) avec proxy /api

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/env.mjs';
import { startEmbeddedPostgres } from '../server/embedded-pg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv();

const children = [];
function run(name, cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`✗ ${name} s'est arrêté (code ${code})`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch { /* ignore */ }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  let stopPg = null;
  const migrate = (adminUrl) => new Promise((resolve, reject) => {
    console.log('· Migration du schéma et des politiques RLS…');
    const m = spawn(process.execPath, ['db/migrate.mjs'], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL_ADMIN: adminUrl },
    });
    m.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('migration échouée'))));
  });
  const withAppRole = (url, password) => {
    const u = new URL(url);
    u.username = 'chantierpilot_app';
    u.password = password ? encodeURIComponent(password) : '';
    return u.toString();
  };
  const isAppRole = (url) => decodeURIComponent(new URL(url).username) === 'chantierpilot_app';

  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_ADMIN) {
    // Mode A — PostgreSQL embarqué (aucune base externe configurée).
    console.log('· Aucune base configurée : démarrage de PostgreSQL embarqué (local)…');
    const pg = await startEmbeddedPostgres({ dataDir: path.join(ROOT, '.pgdata'), port: Number(process.env.PG_PORT || 55432) });
    stopPg = pg.stop;
    console.log('  ✓ PostgreSQL local prêt');
    await migrate(pg.url);
    process.env.DATABASE_URL = withAppRole(pg.url, '');
  } else if (process.env.DATABASE_URL_ADMIN) {
    // Mode B — base externe (Neon) : migration avec le propriétaire, API avec le rôle limité.
    await migrate(process.env.DATABASE_URL_ADMIN);
    if (!process.env.DATABASE_URL || !isAppRole(process.env.DATABASE_URL)) {
      if (!process.env.APP_DB_PASSWORD) {
        throw new Error('APP_DB_PASSWORD est requis pour connecter l\'API avec le rôle chantierpilot_app (voir .env.example).');
      }
      process.env.DATABASE_URL = withAppRole(process.env.DATABASE_URL_ADMIN, process.env.APP_DB_PASSWORD);
    }
  } else if (isAppRole(process.env.DATABASE_URL)) {
    // Base externe déjà migrée, URL applicative fournie : pas de migration possible avec ce rôle.
    console.log('· DATABASE_URL utilise déjà le rôle limité : migration ignorée (ajoutez DATABASE_URL_ADMIN pour migrer).');
  } else {
    // Compatibilité : DATABASE_URL seule = propriétaire d'une base locale.
    await migrate(process.env.DATABASE_URL);
    process.env.DATABASE_URL = withAppRole(process.env.DATABASE_URL, process.env.APP_DB_PASSWORD || '');
  }

  // L'API tourne TOUJOURS avec le rôle limité (RLS effectif ; un superuser est refusé).
  console.log('· API connectée avec le rôle limité chantierpilot_app.');

  run('API', process.execPath, ['server/dev.mjs']);
  run('Web (Vite)', process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')]);

  const stop = async () => {
    shutdown(0);
    if (stopPg) await stopPg();
  };
  process.on('exit', () => { if (stopPg) stopPg(); });
  void stop;
}

main().catch((e) => {
  console.error('✗', e.message);
  shutdown(1);
});
