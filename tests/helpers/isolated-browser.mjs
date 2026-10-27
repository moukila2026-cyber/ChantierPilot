// Environnement navigateur éphémère : jamais la base ni les services du .env local.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { startEmbeddedPostgres, forceCleanup } from '../../server/embedded-pg.mjs';
import { freePort, isolatedTestEnv } from './isolation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function waitUntilReady(url, child, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.spawnError) {
      throw new Error(`${name} s’est arrêté avant son démarrage.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* attendre le démarrage */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${name} n’a pas démarré dans le délai prévu.`);
}

function startChild(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.on('error', (error) => { child.spawnError = error; });
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.spawnError) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

export async function startIsolatedBrowserApp() {
  if (!existsSync(path.join(root, 'dist/index.html'))) {
    throw new Error('Exécutez npm run build avant le test navigateur.');
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'chantierpilot-browser-'));
  const dataDir = path.join(dir, 'pg');
  let postgres, api, web, stopped = false;

  // Secours synchrone pour une exception fatale ou une interruption. Il ne
  // touche qu'aux processus et au répertoire créés par cette exécution.
  const cleanupSync = () => {
    for (const child of [web, api]) {
      if (child && child.exitCode === null && !child.killed) {
        try { child.kill('SIGKILL'); } catch { /* déjà arrêté */ }
      }
    }
    try { if (existsSync(dataDir)) forceCleanup(dataDir); } catch { /* déjà arrêté */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* déjà supprimé */ }
  };
  const onExit = () => cleanupSync();
  const onInterrupt = () => { stop().finally(() => process.exit(130)); };
  const onTerminate = () => { stop().finally(() => process.exit(143)); };
  process.once('exit', onExit);
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await stopChild(web);
      await stopChild(api);
      if (postgres) await postgres.stop();
    } finally {
      cleanupSync();
      process.off('exit', onExit);
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
    }
  };

  try {
    const [pgPort, apiPort, webPort] = await Promise.all([freePort(), freePort(), freePort()]);
    const origin = `http://127.0.0.1:${webPort}`;
    postgres = await startEmbeddedPostgres({ dataDir, port: pgPort, persist: true });

    // Ne transmettre que le strict nécessaire aux processus enfants ; leurs
    // variables synthétiques ne modifient ni le shell ni le fichier .env.
    const env = isolatedTestEnv();
    Object.assign(env, {
      NODE_ENV: 'test',
      DB_DRIVER: 'pg',
      DATABASE_URL_ADMIN: postgres.url,
      DATABASE_URL: postgres.url,
      API_PORT: String(apiPort),
      APP_ORIGIN: origin,
      SESSION_SECRET: randomBytes(32).toString('hex'),
    });

    const migration = spawnSync(process.execPath, ['db/migrate.mjs'], {
      cwd: root, env, stdio: 'ignore', timeout: 30_000,
    });
    if (migration.status !== 0) throw new Error('Migration de la base de test isolée échouée.');
    const limitedUrl = new URL(postgres.url);
    limitedUrl.username = 'chantierpilot_app';
    limitedUrl.password = '';
    env.DATABASE_URL = limitedUrl.toString();
    delete env.DATABASE_URL_ADMIN;

    api = startChild(['server/dev.mjs'], env);
    await waitUntilReady(`http://127.0.0.1:${apiPort}/api/health`, api, 'API de test');
    web = startChild(['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], env);
    await waitUntilReady(origin, web, 'Interface de test');
    return { origin, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
