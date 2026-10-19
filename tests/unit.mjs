import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { amountInWordsFcfa } from '../api/_lib/money.js';
import { parsePagination, paginationMeta, isProductionEnv } from '../api/_lib/http.js';
import { ROUTES, resolvePath, dispatch } from '../api/_lib/router.js';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProjectReport } from '../api/_lib/pdf.js';
import { api } from '../src/lib/api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function streams(pdf) {
  const output = [];
  const raw = pdf.toString('binary');
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(re)) {
    try { output.push(inflateSync(Buffer.from(match[1], 'binary')).toString('binary')); } catch { /* non-Flate stream */ }
  }
  return output.join('\n');
}

console.log('══ Tests unitaires — montants, pagination et PDF ══');
await test('FCFA : zéro et singulier', () => {
  assert.equal(amountInWordsFcfa(0), 'zéro franc CFA');
  assert.equal(amountInWordsFcfa(1), 'un franc CFA');
});
await test('FCFA : nombres composés français', () => {
  assert.equal(amountInWordsFcfa(71), 'soixante et onze francs CFA');
  assert.equal(amountInWordsFcfa(80), 'quatre-vingts francs CFA');
  assert.equal(amountInWordsFcfa(81), 'quatre-vingt-un francs CFA');
  assert.equal(amountInWordsFcfa(200), 'deux cents francs CFA');
  assert.equal(amountInWordsFcfa(201), 'deux cent un francs CFA');
  assert.equal(amountInWordsFcfa(80_000), 'quatre-vingt mille francs CFA');
  assert.equal(amountInWordsFcfa(200_000), 'deux cent mille francs CFA');
});
await test('FCFA : milliers, millions, milliards et borne métier', () => {
  assert.equal(amountInWordsFcfa(1000), 'mille francs CFA');
  assert.equal(amountInWordsFcfa(1_000_001), 'un million un francs CFA');
  assert.equal(amountInWordsFcfa(999_999_999_999), 'neuf cent quatre-vingt-dix-neuf milliards neuf cent quatre-vingt-dix-neuf millions neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf francs CFA');
});
await test('FCFA : rejette décimales, négatifs et hors limites', () => {
  assert.equal(amountInWordsFcfa(-1200), 'moins mille deux cents francs CFA');
  for (const amount of [1.5, 1_000_000_000_000, NaN]) {
    assert.throws(() => amountInWordsFcfa(amount), RangeError);
  }
});
await test('Pagination : valeurs par défaut, plafond, offset et entrée invalide bornés', () => {
  assert.deepEqual(parsePagination({}), { limit: 25, offset: 0 });
  assert.deepEqual(parsePagination({ limit: '500', offset: '50' }), { limit: 100, offset: 50 });
  assert.deepEqual(parsePagination({ limit: '-10', offset: '-2' }), { limit: 25, offset: 0 });
  assert.deepEqual(paginationMeta(25, 25, '61'), { limit: 25, offset: 25, total: 61, hasMore: true });
});

await test('401 de session : redirige les données expirées, pas les erreurs de mot de passe', async () => {
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { code: 'non_authentifie', message: 'Session expirée.' } }),
  });
  await assert.rejects(api('/api/projects'), { status: 401 });
  assert.deepEqual(events, ['chantierpilot:unauthorized']);

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { code: 'mot_de_passe_incorrect', message: 'Mot de passe incorrect.' } }),
  });
  await assert.rejects(api('/api/auth/password', { method: 'POST', body: {} }), { status: 401 });
  assert.deepEqual(events, ['chantierpilot:unauthorized']);
});

await test('PDF : intègre le logo vectoriel et les montants financiers en lettres', async () => {
  const pdf = await buildProjectReport({
    company: { name: 'Entreprise test', city: 'Abidjan' },
    project: { name: 'Villa test', client_name: 'Client', status: 'en_cours', budget: 1_000_000, start_date: '2026-01-01' },
    expenses: [], payments: [],
    totals: { budget: 1_000_000, expenses_total: 0, payments_total: 0, reste_a_encaisser: 1_000_000, resultat_provisionnel: 0 },
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const content = streams(pdf);
  assert.ok(content.includes('756e206d696c6c696f6e'), 'Le PDF inclut le montant en lettres (un million).');
  // Le symbole est dessiné comme une forme vectorielle indépendante des polices/images distantes.
  assert.ok(content.includes('52 55 m\n62 47 l\n72 55 l'), 'Le PDF contient le tracé du toit du logo.');
  assert.ok(content.includes('62 50 m\n65 52.5 l\n62 55 l'), 'Le PDF contient la flèche du logo.');
});

await test('Logo : le composant, les favicons et les pages partagent la nouvelle identité', () => {
  const logo = readFileSync(path.join(ROOT, 'src', 'components', 'Logo.jsx'), 'utf8');
  const logoSvg = readFileSync(path.join(ROOT, 'public', 'logo.svg'), 'utf8');
  const favicon = readFileSync(path.join(ROOT, 'public', 'favicon.svg'), 'utf8');
  assert.match(logo, /LogoMark/);
  assert.match(logo, /compact = false/);
  assert.match(logo, /f4a340/);
  assert.match(logo, /ChantierPilot/);
  assert.match(logoSvg, /ChantierPilot/);
  assert.match(favicon, /f4a340/);
  for (const file of ['Layout.jsx', 'LoginPage.jsx', 'RegisterPage.jsx', 'PricingPage.jsx', 'TermsPage.jsx', 'NotFoundPage.jsx']) {
    const source = readFileSync(path.join(ROOT, 'src', file.startsWith('Layout') ? 'components' : 'pages', file), 'utf8');
    assert.match(source, /Logo/ , `${file} doit utiliser le composant partagé`);
  }
});

console.log('══ Tests unitaires — déploiement Vercel et migration ══');

/** Fichiers que Vercel transforme en fonctions : tout .js de api/ hors noms préfixés par « _ ». */
function vercelFunctions(dir = path.join(ROOT, 'api'), rel = 'api') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vercelFunctions(full, `${rel}/${entry.name}`));
    else if (/\.(c|m)?js$|\.ts$/.test(entry.name)) out.push(`${rel}/${entry.name}`);
  }
  return out;
}

await test('Vercel : au plus 12 fonctions serverless (limite du plan Hobby)', () => {
  const fns = vercelFunctions();
  assert.ok(fns.length <= 12, `Trop de fonctions (${fns.length}) : ${fns.join(', ')}`);
  assert.deepEqual(fns, ['api/index.js'], 'Toute l\u2019API passe par api/index.js');
});

await test('Routeur : chaque gestionnaire de api/_routes est enregistré', () => {
  const listed = (dir, rel = '') => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listed(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]);
  const files = listed(path.join(ROOT, 'api', '_routes'));
  const router = readFileSync(path.join(ROOT, 'api', '_lib', 'router.js'), 'utf8');
  for (const f of files) assert.ok(router.includes(`'../_routes/${f}'`), `Route non enregistrée : ${f}`);
  assert.equal(new Set(ROUTES.map((r) => r[2])).size, files.length);
});

await test('Routeur : URL directe et URL réécrite par vercel.json donnent le même chemin', () => {
  const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const apiRewrite = vercel.rewrites.find((r) => r.source.startsWith('/api/'));
  assert.equal(apiRewrite.destination, '/api?__route=:route*');
  assert.equal(vercel.rewrites.indexOf(apiRewrite), 0, 'La réécriture API doit précéder celle de la SPA');
  const direct = resolvePath('/api/projects/abc/report?limit=5');
  const rewritten = resolvePath('/api?__route=projects%2Fabc%2Freport&limit=5');
  assert.equal(direct.pathname, '/api/projects/abc/report');
  assert.equal(rewritten.pathname, '/api/projects/abc/report');
  assert.equal(rewritten.searchParams.get('limit'), '5');
  assert.equal(rewritten.searchParams.has('__route'), false, '__route ne doit pas atteindre les gestionnaires');
});

function fakeRes() {
  const headers = {};
  return {
    statusCode: 200, headers, body: '', headersSent: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(b) { this.body = b || ''; this.headersSent = true; },
  };
}

await test('Routeur : 404 pour une route inconnue, 405 pour une méthode non prévue', async () => {
  const r404 = fakeRes();
  await dispatch({ method: 'GET', url: '/api/inexistant', headers: {} }, r404);
  assert.equal(r404.statusCode, 404);
  assert.equal(JSON.parse(r404.body).error.code, 'introuvable');
  const r405 = fakeRes();
  await dispatch({ method: 'DELETE', url: '/api/health', headers: {} }, r405);
  assert.equal(r405.statusCode, 405);
  assert.equal(r405.headers['x-content-type-options'], 'nosniff');
});

await test('Production : cookies sécurisés aussi sur les déploiements Vercel (prod et préprod)', () => {
  assert.equal(isProductionEnv({ NODE_ENV: 'production' }), true);
  assert.equal(isProductionEnv({ VERCEL_ENV: 'production' }), true);
  assert.equal(isProductionEnv({ VERCEL_ENV: 'preview' }), true);
  assert.equal(isProductionEnv({ NODE_ENV: 'test' }), false);
  assert.equal(isProductionEnv({ VERCEL_ENV: 'development' }), false);
});

await test('Migration : refusée avec le rôle limité chantierpilot_app (avant toute connexion)', () => {
  const r = spawnSync(process.execPath, ['db/migrate.mjs'], {
    cwd: ROOT, encoding: 'utf8',
    env: { PATH: process.env.PATH, DATABASE_URL_ADMIN: 'postgresql://chantierpilot_app:fictif@127.0.0.1:1/neondb' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /PROPRIÉTAIRE/);
  assert.doesNotMatch(r.stdout + r.stderr, /fictif/, 'Aucun mot de passe ne doit être affiché');
});

console.log(`  RÉSULTAT : ${passed} réussis, 0 échoués`);
