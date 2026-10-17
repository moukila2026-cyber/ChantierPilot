// =====================================================================
// TEST DES POLITIQUES RLS — exigence de sécurité ChantierPilot.
//
// Deux entreprises fictives (A : « BTP Daloa Construction »,
// B : « Ets Kouassi Bâtiment ») sont créées, puis on tente chaque
// accès interdit. Le test tourne avec le rôle applicatif limité
// `chantierpilot_app` (celui que l'API utilise) — et vérifie aussi le
// FORCE ROW LEVEL SECURITY avec un rôle propriétaire non-superuser.
//
//   node db/test-rls.mjs
// Sortie : rapport détaillé, code 0 si TOUS les tests passent.
// =====================================================================

import pg from 'pg';
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres, forceCleanup } from '../server/embedded-pg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 55433;

let passed = 0;
let failed = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function queryAs(url, text, params = []) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  TEST DES POLITIQUES RLS — ChantierPilot');
  console.log('  Deux entreprises fictives, accès croisés interdits.');
  console.log('══════════════════════════════════════════════════════════\n');

  const dataDir = path.join(ROOT, '.pgdata-rlstest');
  forceCleanup(dataDir);
  rmSync(dataDir, { recursive: true, force: true });

  console.log('· Démarrage de PostgreSQL (test isolé)…');
  const pgInst = await startEmbeddedPostgres({ dataDir, port: PORT, persist: true });
  const adminUrl = pgInst.url;
  console.log('  ✓ PostgreSQL prêt\n');

  console.log('· Application du schéma + RLS…');
  const strip = (sql) => sql.replace(/^BEGIN;\s*$/gmi, '').replace(/^COMMIT;\s*$/gmi, '');
  await queryAs(adminUrl, strip(readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8')));
  await queryAs(adminUrl, strip(readFileSync(path.join(ROOT, 'db', 'rls.sql'), 'utf8')));
  console.log('  ✓ Schéma et politiques appliqués\n');

  // Rôles : applicatif limité + propriétaire non-superuser (pour tester FORCE).
  await queryAs(adminUrl, `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_owner_login') THEN
        CREATE ROLE rls_owner_login LOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_app') THEN
        CREATE ROLE rls_app LOGIN;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO rls_owner_login, rls_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_owner_login, rls_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rls_owner_login, rls_app;
    GRANT EXECUTE ON FUNCTION api_lookup_user(TEXT), api_lookup_session(TEXT),
      api_fail_login(TEXT), api_succeed_login(TEXT), api_cleanup_sessions() TO rls_app;
    GRANT EXECUTE ON FUNCTION app_current_company_id(), app_current_user_id(),
      app_current_role(), app_is_definer(), set_updated_at() TO rls_app, rls_owner_login;
    ALTER TABLE companies OWNER TO rls_owner_login;
    ALTER TABLE app_users OWNER TO rls_owner_login;
    ALTER TABLE sessions OWNER TO rls_owner_login;
    ALTER TABLE projects OWNER TO rls_owner_login;
    ALTER TABLE expenses OWNER TO rls_owner_login;
    ALTER TABLE payments OWNER TO rls_owner_login;
    ALTER TABLE audit_log OWNER TO rls_owner_login;
  `);

  const appUrl = adminUrl.replace('postgres@', 'rls_app@').replace('/chantierpilot', '/chantierpilot');
  const ownerUrl = adminUrl.replace('postgres@', 'rls_owner_login@');

  // Connexions persistantes par contexte
  const ctxA = { companyId: null, userId: null };
  const ctxB = { companyId: null, userId: null };

  const withCtx = async (url, ctx, fn) => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.company_id', ctx.companyId || '']);
      await client.query('SELECT set_config($1,$2,true)', ['app.user_id', ctx.userId || '']);
      await client.query('SELECT set_config($1,$2,true)', ['app.role', 'admin']);
      const r = await fn(client);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      await client.end();
    }
  };

  console.log('· Création des deux entreprises fictives (via le rôle applicatif)…');

  // Entreprise A
  ctxA.companyId = '11111111-1111-1111-1111-111111111111';
  ctxA.userId = '11111111-1111-1111-1111-111111111112';
  await withCtx(appUrl, ctxA, async (c) => {
    await c.query(`INSERT INTO companies (id, name, city, phone) VALUES ($1, 'BTP Daloa Construction', 'Daloa', '+225 07 00 00 00 01')`, [ctxA.companyId]);
    await c.query(`INSERT INTO app_users (id, company_id, email, password_hash, full_name, role) VALUES ($1, $2, 'a@btp-daloa.ci', 'scrypt$x', 'Koffi Yao', 'admin')`, [ctxA.userId, ctxA.companyId]);
    await c.query(`INSERT INTO projects (id, company_id, name, client_name, location, budget, start_date, status, created_by)
      VALUES ('21111111-1111-1111-1111-111111111111', $1, 'Villa Cocody', 'M. Traoré', 'Cocody', 15000000, '2026-01-05', 'en_cours', $2)`, [ctxA.companyId, ctxA.userId]);
    await c.query(`INSERT INTO expenses (company_id, project_id, category, amount, expense_date, supplier, created_by)
      VALUES ($1, '21111111-1111-1111-1111-111111111111', 'materiaux', 2500000, '2026-01-10', 'Quincaillerie du Plateau', $2)`, [ctxA.companyId, ctxA.userId]);
    await c.query(`INSERT INTO payments (company_id, project_id, client_name, amount, payment_date, reference, payment_method, created_by)
      VALUES ($1, '21111111-1111-1111-1111-111111111111', 'M. Traoré', 5000000, '2026-01-15', 'REC-2026-001', 'virement_bancaire', $2)`, [ctxA.companyId, ctxA.userId]);
    await c.query(`INSERT INTO audit_log (company_id, user_id, action, entity, summary) VALUES ($1, $2, 'creation', 'chantier', 'Chantier Villa Cocody créé')`, [ctxA.companyId, ctxA.userId]);
  });

  // Entreprise B
  ctxB.companyId = '33333333-3333-3333-3333-333333333333';
  ctxB.userId = '33333333-3333-3333-3333-333333333334';
  await withCtx(appUrl, ctxB, async (c) => {
    await c.query(`INSERT INTO companies (id, name, city, phone) VALUES ($1, 'Ets Kouassi Bâtiment', 'Daloa', '+225 07 00 00 00 02')`, [ctxB.companyId]);
    await c.query(`INSERT INTO app_users (id, company_id, email, password_hash, full_name, role) VALUES ($1, $2, 'b@ets-kouassi.ci', 'scrypt$x', 'Kouassi Bamba', 'admin')`, [ctxB.userId, ctxB.companyId]);
    await c.query(`INSERT INTO projects (id, company_id, name, client_name, location, budget, start_date, status, created_by)
      VALUES ('43333333-3333-3333-3333-333333333333', $1, 'Magasin Daloa Centre', 'Ets Kouassi', 'Daloa Centre', 8000000, '2026-02-01', 'en_cours', $2)`, [ctxB.companyId, ctxB.userId]);
    await c.query(`INSERT INTO expenses (company_id, project_id, category, amount, expense_date, supplier, created_by)
      VALUES ($1, '43333333-3333-3333-3333-333333333333', 'main_oeuvre', 1200000, '2026-02-05', 'Équipe Diabaté', $2)`, [ctxB.companyId, ctxB.userId]);
    await c.query(`INSERT INTO payments (company_id, project_id, client_name, amount, payment_date, reference, payment_method, created_by)
      VALUES ($1, '43333333-3333-3333-3333-333333333333', 'Ets Kouassi', 3000000, '2026-02-10', 'REC-2026-101', 'mobile_money', $2)`, [ctxB.companyId, ctxB.userId]);
  });
  console.log('  ✓ Entreprises A et B créées (données de test distinctes)\n');

  console.log('══ Tests d\'isolation ══\n');

  // 1. Chaque entreprise ne voit que SES chantiers
  const aSeesProjects = await withCtx(appUrl, ctxA, (c) => c.query('SELECT name FROM projects'));
  check('A ne voit que ses chantiers (1 sur 2)',
    aSeesProjects.rows.length === 1 && aSeesProjects.rows[0].name === 'Villa Cocody',
    `vu : ${JSON.stringify(aSeesProjects.rows.map((r) => r.name))}`);

  const bSeesProjects = await withCtx(appUrl, ctxB, (c) => c.query('SELECT name FROM projects'));
  check('B ne voit que ses chantiers (1 sur 2)',
    bSeesProjects.rows.length === 1 && bSeesProjects.rows[0].name === 'Magasin Daloa Centre',
    `vu : ${JSON.stringify(bSeesProjects.rows.map((r) => r.name))}`);

  // 2. Dépenses / encaissements cloisonnés
  const aExp = await withCtx(appUrl, ctxA, (c) => c.query('SELECT amount FROM expenses'));
  check('A ne voit que ses dépenses (2 500 000 FCFA)',
    aExp.rows.length === 1 && Number(aExp.rows[0].amount) === 2500000,
    `vu : ${JSON.stringify(aExp.rows)}`);

  const bPay = await withCtx(appUrl, ctxB, (c) => c.query('SELECT amount FROM payments'));
  check('B ne voit que ses encaissements (3 000 000 FCFA)',
    bPay.rows.length === 1 && Number(bPay.rows[0].amount) === 3000000,
    `vu : ${JSON.stringify(bPay.rows)}`);

  // 3. A tente de modifier le chantier de B → 0 ligne
  const aUpdatesB = await withCtx(appUrl, ctxA, (c) => c.query(
    "UPDATE projects SET budget = 1 WHERE id = '43333333-3333-3333-3333-333333333333' RETURNING id"));
  check('A ne peut PAS modifier le chantier de B (0 ligne touchée)', aUpdatesB.rowCount === 0);

  // 4. A tente de supprimer la dépense de B → 0 ligne
  const aDeletesB = await withCtx(appUrl, ctxA, (c) => c.query(
    "DELETE FROM expenses WHERE project_id = '43333333-3333-3333-3333-333333333333'"));
  check('A ne peut PAS supprimer la dépense de B (0 ligne)', aDeletesB.rowCount === 0);

  // 5. A tente d'insérer une dépense dans le chantier de B → échec (RLS/FK)
  let insertBlocked = false;
  try {
    await withCtx(appUrl, ctxA, (c) => c.query(
      `INSERT INTO expenses (company_id, project_id, category, amount, expense_date)
       VALUES ($1, '43333333-3333-3333-3333-333333333333', 'autre', 1000, '2026-03-01')`, [ctxA.companyId]));
  } catch (e) {
    insertBlocked = true;
  }
  check('A ne peut PAS insérer de dépense dans le chantier de B', insertBlocked);

  // 6. A tente de s'attribuer la société de B (company_id de B) → échec RLS
  let crossInsertBlocked = false;
  try {
    await withCtx(appUrl, ctxA, (c) => c.query(
      `INSERT INTO projects (company_id, name, client_name, budget, start_date)
       VALUES ('33333333-3333-3333-3333-333333333333', 'Usurpation', 'X', 1, '2026-03-01')`));
  } catch (e) {
    crossInsertBlocked = true;
  }
  check('A ne peut PAS créer de chantier au nom de l\'entreprise B', crossInsertBlocked);

  // 7. Sans contexte → rien n'est visible (déni par défaut)
  const noCtx = await queryAs(appUrl, 'SELECT * FROM projects');
  check('Sans contexte : aucune ligne visible (déni par défaut)', noCtx.rows.length === 0);

  const noCtxUsers = await queryAs(appUrl, 'SELECT * FROM app_users');
  check('Sans contexte : comptes utilisateurs invisibles', noCtxUsers.rows.length === 0);

  // 8. Entreprises cloisonnées
  const aCompany = await withCtx(appUrl, ctxA, (c) => c.query('SELECT name FROM companies'));
  check('A ne voit que le profil de son entreprise',
    aCompany.rows.length === 1 && aCompany.rows[0].name === 'BTP Daloa Construction');

  // 9. audit_log : pas de modification ni suppression possibles
  let auditImmutable = false;
  try {
    await withCtx(appUrl, ctxA, (c) => c.query("UPDATE audit_log SET summary = 'piraté'"));
  } catch (e) {
    auditImmutable = true;
  }
  const auditRowsAfter = await withCtx(appUrl, ctxA, (c) => c.query('SELECT summary FROM audit_log'));
  auditImmutable = auditImmutable || auditRowsAfter.rows.every((r) => r.summary !== 'piraté');
  check('Le journal d\'audit ne peut pas être modifié', auditImmutable);

  let auditDeleteBlocked = false;
  try {
    await withCtx(appUrl, ctxA, (c) => c.query('DELETE FROM audit_log'));
  } catch (e) {
    auditDeleteBlocked = true;
  }
  const auditCount = await withCtx(appUrl, ctxA, (c) => c.query('SELECT COUNT(*)::int AS n FROM audit_log'));
  auditDeleteBlocked = auditDeleteBlocked || auditCount.rows[0].n > 0;
  check('Le journal d\'audit ne peut pas être supprimé', auditDeleteBlocked);

  // 10. Contraintes de montants (vérifiées en base)
  let amountBlocked = false;
  try {
    await withCtx(appUrl, ctxA, (c) => c.query(
      `INSERT INTO expenses (company_id, project_id, category, amount, expense_date)
       VALUES ($1, '21111111-1111-1111-1111-111111111111', 'autre', -500, '2026-03-01')`, [ctxA.companyId]));
  } catch (e) {
    amountBlocked = true;
  }
  check('Montant négatif rejeté par la base (CHECK constraint)', amountBlocked);

  let hugeBlocked = false;
  try {
    await withCtx(appUrl, ctxA, (c) => c.query(
      `INSERT INTO expenses (company_id, project_id, category, amount, expense_date)
       VALUES ($1, '21111111-1111-1111-1111-111111111111', 'autre', 999999999999999, '2026-03-01')`, [ctxA.companyId]));
  } catch (e) {
    hugeBlocked = true;
  }
  check('Montant hors bornes rejeté par la base', hugeBlocked);

  // 11. Fonctions d'auth : lookup_session ne révèle rien sans jeton valide
  const badSession2 = await queryAs(appUrl, 'SELECT api_lookup_session($1) AS c', ['f'.repeat(64)]);
  check('api_lookup_session renvoie NULL pour un jeton inconnu',
    badSession2.rows[0].c === null);

  const lookupA = await queryAs(appUrl, 'SELECT api_lookup_user($1) AS u', ['a@btp-daloa.ci']);
  check('api_lookup_user retrouve le compte A (et son entreprise)',
    lookupA.rows[0].u?.company_id === ctxA.companyId && lookupA.rows[0].u?.user_id === ctxA.userId);

  const lookupInconnu = await queryAs(appUrl, 'SELECT api_lookup_user($1) AS u', ['personne@inconnu.ci']);
  check('api_lookup_user renvoie NULL pour un e-mail inconnu', lookupInconnu.rows[0].u === null);

  // 12. FORCE RLS : même le PROPRIÉTAIRE des tables (non-superuser) est bloqué
  const ownerNoCtx = await queryAs(ownerUrl, 'SELECT * FROM projects');
  check('FORCE RLS : le propriétaire des tables ne voit rien sans contexte', ownerNoCtx.rows.length === 0);

  const ownerWithACtx = await withCtx(ownerUrl, ctxB, (c) => c.query('SELECT name FROM projects'));
  check('FORCE RLS : le propriétaire avec contexte B ne voit que B',
    ownerWithACtx.rows.length === 1 && ownerWithACtx.rows[0].name === 'Magasin Daloa Centre',
    `vu : ${JSON.stringify(ownerWithACtx.rows.map((r) => r.name))}`);

  // 13. Le rôle applicatif ne peut pas contourner le RLS (pas de BYPASSRLS)
  const bypass = await queryAs(appUrl, `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
  check('Le rôle applicatif n\'est ni superuser ni BYPASSRLS',
    bypass.rows[0].rolsuper === false && bypass.rows[0].rolbypassrls === false);

  // 14. Tentative de changement de rôle depuis le rôle applicatif
  let setRoleBlocked = false;
  try {
    await queryAs(appUrl, 'SET ROLE chantierpilot_definer');
  } catch (e) {
    setRoleBlocked = true;
  }
  check('Le rôle applicatif ne peut pas devenir chantierpilot_definer', setRoleBlocked);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RÉSULTAT : ${passed} réussis, ${failed} échoués`);
  console.log('══════════════════════════════════════════════════════════');

  await pgInst.stop();
  if (failed > 0) {
    console.error('✗ Des tests RLS ont échoué — NE PAS DÉPLOYER.');
    process.exit(1);
  }
  console.log('✓ Toutes les politiques RLS se comportent comme attendu.');
}

main().catch((e) => {
  console.error('✗ Erreur pendant les tests RLS :', e);
  process.exit(1);
});
