// Couche d'accès aux données : deux pilotes, une seule interface.
//   * 'neon' : @neondatabase/serverless (WebSocket, recommandé par Neon)
//   * 'pg'   : node-postgres classique (dev local / tests / TCP direct)
// Toutes les requêtes métier passent par withTenant() qui pose le contexte
// d'entreprise dans la transaction — les politiques RLS font le reste.

import pg from 'pg';

const pools = new Map();

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.status = 503;
  }
}

/**
 * Garde de sécurité : le rôle de connexion de l'API ne doit JAMAIS pouvoir
 * contourner le RLS. Un superuser ou un rôle BYPASSRLS verrait toutes les
 * entreprises — on refuse donc catégoriquement de servir des requêtes avec
 * un tel rôle (voir docs/SECURITE.md).
 */
export async function assertSafeDatabaseRole(client) {
  const { rows } = await client.query(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  const role = rows[0];
  if (!role) return;
  if (role.rolsuper || role.rolbypassrls) {
    throw new ConfigError(
      `SÉCURITÉ — connexion refusée : la base est jointe avec le rôle « ${role.rolname} » ` +
      '(superuser ou BYPASSRLS), qui peut contourner le cloisonnement des entreprises. ' +
      'DATABASE_URL doit utiliser le rôle limité « chantierpilot_app » (voir docs/SECURITE.md et docs/INSTALLATION.md).');
  }
}

export function driverName() {
  const url = process.env.DATABASE_URL || '';
  if (process.env.DB_DRIVER) return process.env.DB_DRIVER;
  return url.includes('neon.tech') ? 'neon' : 'pg';
}

async function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new ConfigError('DATABASE_URL est absente : la base Neon n\'est pas configurée (voir docs/INSTALLATION.md).');
  const driver = driverName();

  if (driver === 'neon') {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    if (!neonConfig.webSocketConstructor && globalThis.WebSocket) {
      neonConfig.webSocketConstructor = globalThis.WebSocket;
    }
    return watchIdleErrors(new Pool({ connectionString: url, max: 5 }));
  }

  const ssl = /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true };
  return watchIdleErrors(new pg.Pool({ connectionString: url, max: 5, ssl }));
}

/**
 * Neon met la base en veille après quelques minutes d'inactivité et coupe
 * alors les connexions inactives. Sans écouteur, l'événement « error » du
 * pool ferait planter l'instance serverless : on le journalise, le pool
 * ouvrira une nouvelle connexion à la prochaine requête.
 */
function watchIdleErrors(pool) {
  pool.on('error', (err) => {
    console.warn('[db] connexion inactive fermée par le serveur :', err.message);
  });
  return pool;
}

export async function getPool() {
  const key = process.env.DATABASE_URL || 'unset';
  if (!pools.has(key)) {
    // Partager l'initialisation entre requêtes concurrentes d'une même instance.
    const initializing = (async () => {
      const pool = await createPool();
      try {
        const client = await pool.connect();
        try { await assertSafeDatabaseRole(client); } finally { client.release(); }
        return pool;
      } catch (err) {
        await pool.end().catch(() => {});
        throw err;
      }
    })();
    pools.set(key, initializing);
    initializing.catch(() => { if (pools.get(key) === initializing) pools.delete(key); });
  }
  return pools.get(key);
}

/** Requête hors contexte métier (fonctions SECURITY DEFINER, santé). */
export async function bootQuery(text, params = []) {
  const pool = await getPool();
  return pool.query(text, params);
}

/** Ferme proprement tous les pools ouverts (arrêt propre / tests de migration). */
export async function closePools() {
  for (const initializing of pools.values()) {
    const pool = await initializing.catch(() => null);
    if (pool) await pool.end().catch(() => {});
  }
  pools.clear();
}

/**
 * Exécute `fn(client)` dans une transaction portant le contexte de
 * l'entreprise et de l'utilisateur. Toute requête métier DOIT passer ici :
 * sans contexte, les politiques RLS refusent tout (déni par défaut).
 */
export async function withTenant(ctx, fn) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.company_id', ctx.companyId]);
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId || '']);
    await client.query('SELECT set_config($1, $2, true)', ['app.role', ctx.role || '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Erreurs PostgreSQL traduites en messages français actionnables. */
export function translatePgError(err) {
  const code = err?.code;
  if (code === '23514') {
    const constraint = err.constraint || '';
    if (constraint.includes('amount') || constraint.includes('budget')) {
      return { status: 422, code: 'montant_invalide', message: 'Le montant doit être un entier positif en FCFA (maximum 999 999 999 999 FCFA).' };
    }
    if (constraint.includes('dates_coherent')) {
      return { status: 422, code: 'dates_incoherentes', message: 'La date de fin doit être postérieure à la date de début.' };
    }
    if (constraint.includes('status_valid') || constraint.includes('category_valid') || constraint.includes('method_valid')) {
      return { status: 422, code: 'valeur_invalide', message: 'Une des valeurs saisies n\'est pas autorisée.' };
    }
    return { status: 422, code: 'contrainte', message: 'Les données envoyées ne respectent pas les règles de validation.' };
  }
  if (code === '23505') {
    return { status: 409, code: 'doublon', message: 'Cet enregistrement existe déjà.' };
  }
  if (code === '23503') {
    return { status: 422, code: 'reference_invalide', message: 'Référence introuvable (chantier ou compte inexistant).' };
  }
  if (code === '42501') {
    return { status: 403, code: 'interdit', message: 'Votre compte n\'a pas les droits nécessaires pour cette action.' };
  }
  return null;
}
