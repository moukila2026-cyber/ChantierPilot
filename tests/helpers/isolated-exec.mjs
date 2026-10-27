// Lance une suite dans un environnement enfant minimal, sans config locale.
// Les variables du shell et les fichiers .env de l'utilisateur restent intacts.
import { spawn } from 'node:child_process';
import { isolatedTestEnv } from './isolation.mjs';

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('Indiquez le script de test à exécuter.');
  process.exit(1);
}

const child = spawn(process.execPath, [script, ...args], {
  cwd: process.cwd(),
  env: isolatedTestEnv(),
  stdio: 'inherit',
});
child.on('error', () => {
  console.error('Impossible de démarrer la suite de test isolée.');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!child.killed) child.kill(signal); });
}
