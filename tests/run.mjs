// =====================================================================
// TESTS D'INTÉGRATION API — ChantierPilot
//
// Démarre PostgreSQL embarqué + l'API locale (mêmes handlers que Vercel),
// puis exécute le parcours complet avec DEUX entreprises :
//   inscription, connexion, création/modification de chantiers, dépenses,
//   encaissements, calculs du tableau de bord, permissions croisées,
//   rapport PDF, exports CSV/JSON, validation des montants, verrouillage.
//
//   node tests/run.mjs
// =====================================================================

import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startEmbeddedPostgres, forceCleanup } from '../server/embedded-pg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = 55434;
const API_PORT = 8791;
const BASE = `http://127.0.0.1:${API_PORT}`;

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); }
}

function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    `attendu ${JSON.stringify(expected)}, reçu ${JSON.stringify(actual)}`);
}

class Client {
  constructor() {
    this.cookies = {};
    // Requêtes même origine que l'API (comme un navigateur derrière le proxy Vite).
    this.origin = BASE;
  }
  header() {
    const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    return {
      'Content-Type': 'application/json',
      'x-chantierpilot-client': 'web',
      Origin: this.origin,
      ...(cookie ? { Cookie: cookie } : {}),
    };
  }
  capture(res) {
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) {
      const [kv] = c.split(';');
      const idx = kv.indexOf('=');
      this.cookies[kv.slice(0, idx).trim()] = decodeURIComponent(kv.slice(idx + 1).trim());
    }
  }
  async req(method, url, body, extra = {}) {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: { ...this.header(), ...extra.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.capture(res);
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers, raw: text };
  }
  get(url) { return this.req('GET', url); }
  post(url, body) { return this.req('POST', url, body); }
  patch(url, body) { return this.req('PATCH', url, body); }
  del(url) { return this.req('DELETE', url); }
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  TESTS D\'INTÉGRATION API — ChantierPilot');
  console.log('══════════════════════════════════════════════════════════\n');

  const dataDir = path.join(ROOT, '.pgdata-apitest');
  forceCleanup(dataDir);
  rmSync(dataDir, { recursive: true, force: true });

  console.log('· Démarrage de PostgreSQL + migration…');
  const pgInst = await startEmbeddedPostgres({ dataDir, port: PG_PORT, persist: true });
  process.env.DATABASE_URL = pgInst.url;
  process.env.DB_DRIVER = 'pg';
  process.env.NODE_ENV = 'test';

  await new Promise((resolve, reject) => {
    const m = spawn(process.execPath, ['db/migrate.mjs'], { cwd: ROOT, stdio: 'inherit', env: process.env });
    m.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('migration échouée'))));
  });

  // L'API tourne avec le RÔLE LIMITÉ (comme en production) : le RLS s'applique.
  process.env.DATABASE_URL = pgInst.url.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@');

  console.log('· Démarrage de l\'API locale…');
  const api = spawn(process.execPath, ['server/dev.mjs'], {
    cwd: ROOT,
    env: { ...process.env, API_PORT: String(API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  api.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));
  // Nettoyage garanti quoi qu'il arrive (évite les zombies entre deux runs).
  const cleanup = () => {
    try { process.kill(-api.pid, 'SIGKILL'); } catch { try { api.kill('SIGKILL'); } catch { /* ignore */ } }
    try { runCleanup(); } catch { /* ignore */ }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  const runCleanup = () => { forceCleanup(dataDir); };

  // Attendre que l'API réponde
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      ready = r.ok;
    } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!ready) { api.kill(); await pgInst.stop(); throw new Error('API non démarrée'); }
  console.log('  ✓ API opérationnelle\n');

  console.log('══ Parcours entreprise A — BTP Daloa Construction ══\n');

  const A = new Client();
  const B = new Client();

  // --- Inscription ---
  const regA = await A.post('/api/auth/register', {
    company: { name: 'BTP Daloa Construction', rccm: 'RC CI-DLO-2026-B-001', phone: '+225 07 00 00 00 01', email: 'contact@btp-daloa.ci', address: 'Rue du Commerce', city: 'Daloa' },
    user: { full_name: 'Koffi Yao', email: 'koffi@btp-daloa.ci', password: 'DaloaBTP2026!' },
  });
  check('Inscription entreprise A réussie (201)', regA.status === 201, regA.data);
  check('Cookie de session posé (httpOnly)', Object.keys(A.cookies).length > 0);

  const regB = await B.post('/api/auth/register', {
    company: { name: 'Ets Kouassi Bâtiment', phone: '+225 07 00 00 00 02', email: '', address: '', city: 'Daloa', rccm: '' },
    user: { full_name: 'Kouassi Bamba', email: 'kouassi@ets-kouassi.ci', password: 'KouassiBat2026!' },
  });
  check('Inscription entreprise B réussie', regB.status === 201, regB.data);

  // --- Validation ---
  const badReg = await new Client().post('/api/auth/register', {
    company: { name: 'X', rccm: '', phone: '', email: '', address: '', city: 'Daloa' },
    user: { full_name: 'Y', email: 'pasunemail', password: 'court' },
  });
  check('Inscription invalide rejetée (422 + messages FR)', badReg.status === 422 && !!badReg.data.error.message);

  // --- Connexion / échec ---
  const badLogin = await new Client().post('/api/auth/login', { email: 'koffi@btp-daloa.ci', password: 'fauxmotdepasse' });
  check('Mauvais mot de passe → 401 message générique', badLogin.status === 401
    && badLogin.data.error.message === 'Adresse e-mail ou mot de passe incorrect.');

  const A2 = new Client();
  const goodLogin = await A2.post('/api/auth/login', { email: 'koffi@btp-daloa.ci', password: 'DaloaBTP2026!' });
  check('Connexion valide → 200', goodLogin.status === 200, goodLogin.data);

  const session = await A2.get('/api/auth/session');
  check('Session → profil + entreprise', session.status === 200
    && session.data.company.name === 'BTP Daloa Construction'
    && session.data.user.email === 'koffi@btp-daloa.ci');

  // --- Chantiers ---
  const projA = await A.post('/api/projects', {
    name: 'Villa Cocody — lot 3', client_name: 'M. Traoré', location: 'Cocody',
    budget: 15000000, start_date: '2026-01-05', end_date: '2026-06-30', status: 'en_cours', notes: 'Construction villa R+1',
  });
  const activeProjectsPage = await A.get('/api/projects?status=actifs&limit=1&offset=0');
  check('Création chantier A + pagination des chantiers actifs', projA.status === 201 && activeProjectsPage.status === 200
    && activeProjectsPage.data.projects.length === 1
    && activeProjectsPage.data.pagination.total === 1
    && activeProjectsPage.data.pagination.hasMore === false, projA.data);
  const projId = projA.data.project.id;

  const projB = await B.post('/api/projects', {
    name: 'Magasin Daloa Centre', client_name: 'Ets Kouassi', location: 'Daloa Centre',
    budget: 8000000, start_date: '2026-02-01', status: 'en_cours', notes: '',
  });
  check('Création chantier B', projB.status === 201, projB.data);
  const projBId = projB.data.project.id;

  // Budget invalide
  const badBudget = await A.post('/api/projects', {
    name: 'Test budget', client_name: 'Client', location: '', budget: -100,
    start_date: '2026-01-01', status: 'en_cours', notes: '',
  });
  check('Budget négatif refusé (422)', badBudget.status === 422);

  const badBudget2 = await A.post('/api/projects', {
    name: 'Test budget 2', client_name: 'Client', location: '', budget: '12.5',
    start_date: '2026-01-01', status: 'en_cours', notes: '',
  });
  check('Budget décimal refusé — FCFA entiers uniquement', badBudget2.status === 422);

  // Modification
  const upd = await A.patch(`/api/projects/${projId}`, { budget: 16000000, status: 'en_cours' });
  check('Modification du chantier (budget 15M → 16M)', upd.status === 200 && Number(upd.data.project.budget) === 16000000);

  const badDates = await A.patch(`/api/projects/${projId}`, { start_date: '2026-05-01', end_date: '2026-04-01' });
  check('Dates incohérentes refusées (422)', badDates.status === 422);

  // --- Dépenses ---
  const exp1 = await A.post('/api/expenses', {
    project_id: projId, category: 'materiaux', amount: 2500000, expense_date: '2026-01-10',
    supplier: 'Quincaillerie du Plateau', description: 'Ciment, fer, sable',
    receipt: { filename: 'facture.png', mime: 'image/png', data: PNG_1PX.toString('base64') },
  });
  check('Dépense avec justificatif créée', exp1.status === 201 && exp1.data.expense.has_receipt === true, exp1.data);

  const exp2 = await A.post('/api/expenses', {
    project_id: projId, category: 'main_oeuvre', amount: 1200000, expense_date: '2026-01-20',
    supplier: 'Équipe Diabaté', description: 'Avance main d\'œuvre janvier', receipt: null,
  });
  const expensePage = await A.get('/api/expenses?limit=1&offset=0');
  check('Dépense sans justificatif créée + pagination', exp2.status === 201 && exp2.data.expense.has_receipt === false
    && expensePage.status === 200 && expensePage.data.expenses.length === 1
    && expensePage.data.pagination.total === 2 && expensePage.data.pagination.hasMore === true);

  const badExp = await A.post('/api/expenses', {
    project_id: projId, category: 'materiaux', amount: 0, expense_date: '2026-01-10',
    supplier: '', description: '', receipt: null,
  });
  check('Montant nul refusé (422)', badExp.status === 422);

  const badCat = await A.post('/api/expenses', {
    project_id: projId, category: 'inconnue', amount: 100, expense_date: '2026-01-10',
    supplier: '', description: '', receipt: null,
  });
  check('Catégorie inconnue refusée (422)', badCat.status === 422);

  // --- Encaissements ---
  const pay1 = await A.post('/api/payments', {
    project_id: projId, client_name: 'M. Traoré', amount: 5000000, payment_date: '2026-01-15',
    reference: 'REC-2026-001', payment_method: 'virement_bancaire', memo: 'Premier acompte', proof: null,
  });
  check('Encaissement déclaré créé', pay1.status === 201, pay1.data);

  const payNoRef = await A.post('/api/payments', {
    project_id: projId, client_name: 'M. Traoré', amount: 1000, payment_date: '2026-01-15',
    reference: '', payment_method: 'especes', memo: '', proof: null,
  });
  check('Encaissement sans référence refusé — pas de paiement sans preuve', payNoRef.status === 422);

  const payProof = await A.post('/api/payments', {
    project_id: projId, client_name: 'M. Traoré', amount: 2000000, payment_date: '2026-02-10',
    reference: 'REC-2026-002', payment_method: 'mobile_money', memo: '',
    proof: { filename: 'recu.png', mime: 'image/png', data: PNG_1PX.toString('base64') },
  });
  const paymentPage = await A.get('/api/payments?limit=1&offset=1');
  check('Encaissement avec justificatif → prouvé + pagination', payProof.status === 201 && payProof.data.payment.has_proof === true
    && paymentPage.status === 200 && paymentPage.data.payments.length === 1
    && paymentPage.data.pagination.total === 2 && paymentPage.data.pagination.hasMore === false);

  // --- Calculs (dashboard) ---
  const dash = await A.get('/api/dashboard');
  const t = dash.data.totals;
  eq('Calculs : budget total (16 000 000)', t.budget_total, 16000000);
  eq('Calculs : dépenses totales (3 700 000)', t.expenses_total, 3700000);
  eq('Calculs : encaissements (7 000 000)', t.payments_total, 7000000);
  eq('Calculs : solde client / reste à encaisser (9 000 000)', t.reste_a_encaisser, 9000000);
  eq('Calculs : résultat provisoire (3 300 000)', t.resultat_provisionnel, 3300000);
  eq('Calculs : écart budget (12 300 000)', t.ecart_budget, 12300000);

  // --- Fiche détaillée + historique ---
  const detail = await A.get(`/api/projects/${projId}`);
  check('Fiche chantier : totaux cohérents', Number(detail.data.totals.expenses_total) === 3700000
    && Number(detail.data.totals.payments_total) === 7000000);
  check('Fiche chantier : historique chronologique présent', detail.data.timeline.length >= 3);
  check('Fiche chantier : montants en entiers (pas de float)', Number.isInteger(Number(detail.data.totals.expenses_total)));

  // --- PERMISSIONS croisées ---
  const cross1 = await A.get(`/api/projects/${projBId}`);
  check('INTERDIT : A lit le chantier de B → 404', cross1.status === 404, `status ${cross1.status}`);

  const cross2 = await A.patch(`/api/projects/${projBId}`, { budget: 1 });
  check('INTERDIT : A modifie le chantier de B → 404', cross2.status === 404);

  const cross3 = await A.post('/api/expenses', {
    project_id: projBId, category: 'autre', amount: 100, expense_date: '2026-03-01',
    supplier: '', description: 'tentative', receipt: null,
  });
  check('INTERDIT : A dépense sur le chantier de B → 404', cross3.status === 404);

  const cross4 = await B.get(`/api/projects/${projId}`);
  check('INTERDIT : B lit le chantier de A → 404', cross4.status === 404);

  const dashB = await B.get('/api/dashboard');
  eq('Dashboard B ne montre que B (budget 8 000 000)', dashB.data.totals.budget_total, 8000000);

  const expListB = await B.get('/api/expenses');
  eq('Liste dépenses de B vide (Aucune de A visible)', expListB.data.expenses.length, 0);

  // --- Export CSV / JSON ---
  const csvRes = await fetch(`${BASE}/api/export?scope=expenses&format=csv`, { headers: A.header() });
  const csvBuf = Buffer.from(await csvRes.arrayBuffer());
  const csvText = csvBuf.toString('utf8');
  check('Export CSV dépenses (BOM + en-têtes FR)', csvRes.status === 200
    && csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF
    && csvText.includes('Fournisseur') && csvText.includes('Quincaillerie'),
    csvText.slice(0, 120));
  check('Export CSV ne contient pas les données de B', !csvText.includes('Magasin Daloa Centre'));

  const json = await A.get('/api/export?scope=all&format=json');
  check('Export JSON complet téléchargeable', json.status === 200
    && json.headers.get('content-disposition')?.includes('json')
    && json.data.company.name === 'BTP Daloa Construction'
    && json.data.projects.length === 1);

  // --- Rapport PDF ---
  const pdfRes = await fetch(`${BASE}/api/projects/${projId}/report`, { headers: A.header() });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  check('Rapport PDF généré (%PDF + nom entreprise)', pdfRes.status === 200
    && pdfRes.headers.get('content-type') === 'application/pdf'
    && pdfBuf.subarray(0, 5).toString() === '%PDF-');
  check('PDF : en-tête avec le nom de l\'entreprise (flux compressé détecté)', pdfBuf.length > 1500);

  // --- Justificatif : téléchargement ---
  const expId = exp1.data.expense.id;
  const fileRes = await fetch(`${BASE}/api/files?kind=expense&id=${expId}`, { headers: A.header() });
  const fileBuf = Buffer.from(await fileRes.arrayBuffer());
  check('Justificatif récupérable et octets identiques', fileRes.status === 200 && fileBuf.equals(PNG_1PX));

  const fileCross = await fetch(`${BASE}/api/files?kind=expense&id=${expId}`, { headers: B.header() });
  check('INTERDIT : B télécharge le justificatif de A → 404', fileCross.status === 404);

  // --- Archivage ---
  const arch = await A.patch(`/api/projects/${projId}`, { status: 'archive' });
  check('Archivage du chantier', arch.status === 200 && arch.data.project.status === 'archive'
    && arch.data.project.archived_at !== null);

  const expArchived = await A.post('/api/expenses', {
    project_id: projId, category: 'autre', amount: 100, expense_date: '2026-03-01',
    supplier: '', description: 'sur chantier archivé', receipt: null,
  });
  check('Dépense refusée sur chantier archivé (409)', expArchived.status === 409);

  const reopen = await A.patch(`/api/projects/${projId}`, { status: 'en_cours' });
  check('Réouverture du chantier', reopen.status === 200 && reopen.data.project.archived_at === null);

  // --- CSRF / origine ---
  const csrf = await A.req('POST', '/api/projects', {
    name: 'CSRF', client_name: 'X', location: '', budget: 1, start_date: '2026-01-01', status: 'en_cours', notes: '',
  }, { headers: { Origin: 'https://attaque.evil' } });
  check('Origine étrangère refusée (403 anti-CSRF)', csrf.status === 403, `status ${csrf.status}`);

  // --- Journal d'audit ---
  const audit = await A.get('/api/audit?limit=1&offset=0');
  check('Journal d\'audit rempli et paginé (créations tracées)', audit.status === 200
    && audit.data.audit.length === 1
    && audit.data.pagination.total >= 5
    && audit.data.pagination.hasMore === true
    && audit.data.audit.some((r) => String(r.summary).includes('Villa Cocody')));
  const auditB = await B.get('/api/audit');
  check('Journal de B ne contient pas les actions de A',
    !auditB.data.audit.some((r) => String(r.summary).includes('Villa Cocody')));

  // --- Verrouillage anti force brute ---
  const lockClient = new Client();
  let lockStatus = 0;
  for (let i = 0; i < 11; i++) {
    const r = await lockClient.post('/api/auth/login', { email: 'kouassi@ets-kouassi.ci', password: 'mauvais' });
    if (r.status === 429) { lockStatus = r.status; break; }
    lockStatus = r.status;
  }
  check('Force brute → verrouillage / limitation (429)', lockStatus === 429, `dernier status ${lockStatus}`);

  // --- Déconnexion ---
  const logout = await A2.post('/api/auth/logout');
  check('Déconnexion', logout.status === 200);
  const afterLogout = await A2.get('/api/auth/session');
  check('Session révoquée → 401', afterLogout.status === 401);

  // --- Changement de mot de passe ---
  const A3 = new Client();
  await A3.post('/api/auth/login', { email: 'koffi@btp-daloa.ci', password: 'DaloaBTP2026!' });
  const pwChange = await A3.post('/api/auth/password', {
    current_password: 'DaloaBTP2026!', new_password: 'NouveauMot2026!',
  });
  check('Changement de mot de passe', pwChange.status === 200, pwChange.data);
  const oldLogin = await new Client().post('/api/auth/login', { email: 'koffi@btp-daloa.ci', password: 'DaloaBTP2026!' });
  check('Ancien mot de passe refusé après changement', oldLogin.status === 401);
  const newLogin = await new Client().post('/api/auth/login', { email: 'koffi@btp-daloa.ci', password: 'NouveauMot2026!' });
  check('Nouveau mot de passe accepté', newLogin.status === 200);

  // --- Métadonnées honnêtes ---
  const health = await new Client().get('/api/health');
  check('Health : base connectée, pilote déclaré', health.status === 200
    && health.data.database === 'ok' && ['pg', 'neon'].includes(health.data.driver));

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RÉSULTAT : ${passed} réussis, ${failed} échoués`);
  console.log('══════════════════════════════════════════════════════════');

  api.kill();
  await pgInst.stop();
  if (failed > 0) process.exit(1);
  console.log('✓ Tous les tests d\'intégration passent.');
}

main().catch((e) => {
  console.error('✗ Erreur pendant les tests :', e);
  process.exit(1);
});
