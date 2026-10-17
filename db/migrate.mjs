#!/usr/bin/env node
// Applique le schéma SQL et les politiques RLS sur la base ciblée par
// DATABASE_URL (Neon en production, PostgreSQL embarqué en local).
//
//   DATABASE_URL=postgresql://... node db/migrate.mjs
//
// Le script est idempotent : il peut être relancé sans risque.

import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv();

function stripTransactionMarkers(sql) {
  return sql
    .replace(/^BEGIN;\s*$/gmi, '')
    .replace(/^COMMIT;\s*$/gmi, '');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ DATABASE_URL est absente. Voir .env.example et docs/INSTALLATION.md');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') || url.includes('127.0.0.1') ? undefined : { rejectUnauthorized: true } });
  await client.connect();

  const schema = stripTransactionMarkers(readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));
  const rls = stripTransactionMarkers(readFileSync(path.join(ROOT, 'db', 'rls.sql'), 'utf8'));

  try {
    console.log('· Application du schéma (db/schema.sql)…');
    await client.query(schema);
    console.log('  ✓ schéma appliqué');
    console.log('· Application des politiques RLS (db/rls.sql)…');
    await client.query(rls);
    console.log('  ✓ RLS activé et forcé sur toutes les tables');

    // Rôle applicatif : connexion LIMITÉE (jamais superuser — le RLS s'applique).
    const appPassword = process.env.APP_DB_PASSWORD || null;
    await client.query('ALTER ROLE chantierpilot_app WITH LOGIN');
    if (appPassword) {
      if (!/^[A-Za-z0-9_.\-!@#]{8,128}$/.test(appPassword)) {
        throw new Error('APP_DB_PASSWORD doit faire 8 à 128 caractères (lettres, chiffres, - _ . ! @ #).');
      }
      await client.query(`ALTER ROLE chantierpilot_app WITH PASSWORD '${appPassword.replace(/'/g, "''")}'`);
    }
    console.log('  ✓ rôle applicatif chantierpilot_app prêt');

    // Vérification finale : RLS forcé partout.
    const { rows: rlsRows } = await client.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`);
    if (rlsRows.length > 0) {
      throw new Error(`RLS non forcé sur : ${rlsRows.map((r) => r.relname).join(', ')}`);
    }
    console.log('  ✓ vérification : RLS activé + forcé sur TOUTES les tables');
  } finally {
    await client.end();
  }

  const appUrl = url.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@');
  console.log('✓ Migration terminée.');
  console.log('');
  console.log('IMPORTANT — sécurité :');
  console.log('  • L\'API doit se connecter avec le RÔLE LIMITÉ chantierpilot_app :');
  console.log(`      DATABASE_URL=${appUrl}`);
  console.log('  • La clé d\'administration (propriétaire) sert uniquement aux migrations.');
  console.log('  • Un rôle superuser/BYPASSRLS est REFUSÉ par l\'API (garde de sécurité active).');
}

main().catch((e) => {
  console.error('✗ Migration échouée :', e.message);
  process.exit(1);
});
