// Compatibilité ascendante entre le code applicatif courant et une base Neon
// dont les migrations additives (`db/migrate.mjs` via `DATABASE_URL_ADMIN`)
// n'ont pas encore été appliquées (7 tables socle uniquement).
//
// PostgreSQL invalide toute la transaction courante dès qu'une requête échoue
// (`25P02 current transaction is aborted`) SAUF si elle est isolée dans un
// `SAVEPOINT`. `optionalSql` isole les lectures/écritures optionnelles sur les
// tables, colonnes ou fonctions issues des migrations ultérieures, sans jamais
// masquer les erreurs métier ou contraintes d'intégrité réelles.

// 42P01 = undefined_table, 42703 = undefined_column, 42883 = undefined_function
export const MISSING_SCHEMA_CODES = new Set(['42P01', '42703', '42883']);

export const SCHEMA_UPGRADE_REQUIRED_MESSAGE =
  'Ce module étendu nécessite une mise à niveau SQL unique de la base Neon ' +
  '(ajoutez DATABASE_URL_ADMIN avec l’URL propriétaire neondb_owner dans Vercel puis redéployez). ' +
  'Vos chantiers, dépenses, encaissements, rapports PDF et exports fonctionnent déjà normalement.';

export async function optionalSql(client, savepointName, fn, fallback = null) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(savepointName)) {
    throw new Error(`Nom de SAVEPOINT invalide : ${savepointName}`);
  }
  await client.query(`SAVEPOINT ${savepointName}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
    return result;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    if (MISSING_SCHEMA_CODES.has(err?.code)) {
      return typeof fallback === 'function' ? fallback(err) : fallback;
    }
    throw err;
  }
}

export function throwIfMissingSchemaWrite(err) {
  if (MISSING_SCHEMA_CODES.has(err?.code)) {
    throw Object.assign(new Error(SCHEMA_UPGRADE_REQUIRED_MESSAGE), {
      status: 503,
      code: 'migration_requise',
    });
  }
}
