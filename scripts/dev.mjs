// npm run dev — démarre l'environnement complet :
//   1. PostgreSQL embarqué si DATABASE_URL est absente (démo/développement)
//   2. Migration du schéma + RLS
//   3. Serveur API local (mêmes handlers que Vercel)
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
  if (!process.env.DATABASE_URL) {
    console.log('· Aucune DATABASE_URL : démarrage de PostgreSQL embarqué (local)…');
    const pg = await startEmbeddedPostgres({ dataDir: path.join(ROOT, '.pgdata'), port: Number(process.env.PG_PORT || 55432) });
    process.env.DATABASE_URL = pg.url;
    stopPg = pg.stop;
    console.log(`  ✓ PostgreSQL local prêt (${pg.url})`);
    console.log('  → En production, renseignez DATABASE_URL avec votre projet Neon (docs/INSTALLATION.md).');
  }

  console.log('· Migration du schéma et des politiques RLS…');
  await new Promise((resolve, reject) => {
    const m = spawn(process.execPath, ['db/migrate.mjs'], {
      cwd: ROOT, stdio: 'inherit', env: process.env,
    });
    m.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('migration échouée'))));
  });

  // L'API tourne TOUJOURS avec le rôle limité (RLS effectif).
  const adminUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = adminUrl.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@');
  console.log(`· API connectée avec le rôle limité chantierpilot_app.`);

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
