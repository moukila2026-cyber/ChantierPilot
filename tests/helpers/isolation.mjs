import net from 'node:net';
import { userInfo } from 'node:os';

// Ne transmettre aux processus de test aucune configuration applicative exportée
// par le shell ou chargée depuis un fichier local. Les données additionnelles
// doivent provenir exclusivement des fixtures de la suite concernée.
export function isolatedTestEnv(extra = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  // Le PostgreSQL éphémère crée son rôle initial à partir de l'identité
  // système. `pg` utilise USER quand une URL de test ne précise pas de rôle.
  try {
    env.USER = userInfo().username;
    env.LOGNAME = env.USER;
  } catch { /* les suites concernées signaleront une identité système absente */ }
  return { ...env, NODE_ENV: 'test', ...extra };
}

// Un port attribué par le système est libre au moment de la vérification ;
// un autre processus peut néanmoins le prendre avant l'ouverture du serveur.
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
