#!/usr/bin/env node
// Applique le schéma SQL et les politiques RLS.
//
// Cible : DATABASE_URL_ADMIN (URL du PROPRIÉTAIRE de la base, réservée aux
// migrations). À défaut, DATABASE_URL (compatibilité : base locale).
//
//   node db/migrate.mjs  (configurer la cible par un canal privé au préalable)
//
// Ce script réapplique schéma et politiques, mais n'est pas purement additif :
// le schéma modifie notamment d'anciens essais et recrée des déclencheurs ;
// les politiques RLS sont également recréées. Sauvegarder et tester d'abord.
// Il n'affiche pas de mot de passe ni de chaîne de connexion.

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
  const url = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ DATABASE_URL_ADMIN est absente (URL du propriétaire de la base, pour la migration).');
    console.error('  Voir docs/VERCEL_PAS_A_PAS.md, étape 3.');
    process.exit(1);
  }
  let target;
  try {
    target = new URL(url);
  } catch {
    console.error('✗ URL de base de données illisible. Vérifiez qu\'elle commence par postgresql:// et que');
    console.error('  les caractères spéciaux du mot de passe sont encodés (@ → %40, # → %23).');
    process.exit(1);
  }
  if (decodeURIComponent(target.username) === 'chantierpilot_app') {
    console.error('✗ La migration doit utiliser l\'URL du PROPRIÉTAIRE (DATABASE_URL_ADMIN),');
    console.error('  pas celle du rôle limité chantierpilot_app.');
    process.exit(1);
  }
  // Affiché sans identifiants : permet de vérifier qu'on migre la bonne base.
  console.log('· Cible : base de migration configurée.');

  const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') || url.includes('127.0.0.1') ? undefined : { rejectUnauthorized: true } });
  await client.connect();

  const schema = stripTransactionMarkers(readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));
  const rls = stripTransactionMarkers(readFileSync(path.join(ROOT, 'db', 'rls.sql'), 'utf8'));
  const registerLimit = readFileSync(path.join(ROOT, 'db', 'migrations', '20261027_register_rate_limit.sql'), 'utf8');

  try {
    console.log('· Application du schéma (db/schema.sql)…');
    await client.query(schema);
    console.log('  ✓ schéma appliqué');
    console.log('· Application des politiques RLS (db/rls.sql)…');
    await client.query(rls);
    console.log('  ✓ RLS activé et forcé sur toutes les tables');
    console.log('· Application de la migration additive du quota d’inscription…');
    await client.query(registerLimit);
    console.log('  ✓ quota d’inscription préparé');

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

  console.log('✓ Migration terminée.');
  console.log('');
  console.log('IMPORTANT — sécurité :');
  console.log('  • Configurez DATABASE_URL avec le rôle limité chantierpilot_app.');
  console.log('    Ne transmettez jamais ses identifiants dans les journaux.');
  console.log('  • La clé d\'administration (propriétaire) sert uniquement aux migrations.');
  console.log('  • Un rôle superuser/BYPASSRLS est REFUSÉ par l\'API (garde de sécurité active).');
}

main().catch((e) => {
  // Les messages de pilotes peuvent contenir des informations de connexion.
  // Ne conserver qu'un éventuel code technique court, jamais les valeurs.
  const code = typeof e.code === 'string' && /^[A-Z0-9_]{1,20}$/i.test(e.code) ? ` (code ${e.code})` : '';
  console.error(`✗ Migration échouée${code}. Vérifiez la connexion, les droits et l’état du schéma.`);
  process.exit(1);
});
