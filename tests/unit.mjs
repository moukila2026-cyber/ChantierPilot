import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { amountInWordsFcfa } from '../api/_lib/money.js';
import { parsePagination, paginationMeta } from '../api/_lib/http.js';
import { buildProjectReport } from '../api/_lib/pdf.js';
import { api } from '../src/lib/api.js';

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
  assert.ok(content.includes('54 63 m\n62 48 l\n70 63 l'), 'Le PDF contient le tracé vectoriel du logo.');
});

console.log(`  RÉSULTAT : ${passed} réussis, 0 échoués`);
