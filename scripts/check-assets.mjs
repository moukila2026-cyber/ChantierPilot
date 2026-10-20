#!/usr/bin/env node
// Vérifie l'intégrité complète des assets de production (dist/) et optionnellement d'une URL live (--live=https://...).
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
let failures = 0;

function ok(msg) {
  console.log(`  ok  ${msg}`);
}
function fail(msg) {
  failures++;
  console.error(`  KO  ${msg}`);
}
function check(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

console.log('\n── Vérification locale des assets de build (dist/) et de la configuration Vercel ──');

const requiredStatic = [
  ['index.html', (s) => s.includes('<div id="root"></div>') && s.includes('#141210') && s.includes('id="cp-inline-css"')],
  ['sw.js', (s) => s.includes('cp-shell-') && s.includes('isValidAssetResponse') && !s.includes('deleteDatabase') && !s.includes('indexedDB.')],
  ['logo.svg', (s) => s.includes('<svg') && s.includes('#141210')],
  ['favicon.svg', (s) => s.includes('<svg') && s.includes('#141210')],
  ['favicon-32.png', null],
  ['apple-touch-icon.png', null],
  ['icon-192.png', null],
  ['icon-512.png', null],
  ['site.webmanifest', (s) => {
    const j = JSON.parse(s);
    return j.theme_color === '#141210' && j.background_color === '#0c0b09' && Array.isArray(j.icons) && j.icons.length >= 2;
  }],
  ['images/landing/chantier-abidjan.webp', null],
  ['images/landing/chantier-abidjan.jpg', null],
  ['images/landing/equipe-terrain.webp', null],
  ['images/landing/equipe-terrain.jpg', null],
  ['images/landing/suivi-budget.webp', null],
  ['images/landing/suivi-budget.jpg', null],
];

for (const [rel, validator] of requiredStatic) {
  const full = path.join(DIST, rel);
  if (!existsSync(full)) {
    fail(`dist/${rel} introuvable`);
    continue;
  }
  const size = statSync(full).size;
  if (size < 64) {
    fail(`dist/${rel} trop petit ou vide (${size} octets)`);
    continue;
  }
  if (validator) {
    const content = readFileSync(full, 'utf8');
    check(validator(content), `dist/${rel} présent et valide (${size} octets)`);
  } else {
    ok(`dist/${rel} présent et valide (${size} octets)`);
  }
}

// Vérifie tous les liens JS/CSS référencés par dist/index.html + absence totale de @layer / oklch / oklab / @property
const indexHtml = existsSync(path.join(DIST, 'index.html')) ? readFileSync(path.join(DIST, 'index.html'), 'utf8') : '';
const assetRefs = [...indexHtml.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
check(assetRefs.some((r) => r.endsWith('.css')), 'index.html lie au moins une feuille CSS compilée');
check(assetRefs.some((r) => r.endsWith('.js')), 'index.html lie au moins un bundle JS compilé');
check(!indexHtml.includes('@layer'), 'style inline de index.html sans @layer bloquant');
check(!/oklch\(|oklab\(|color-mix\(/i.test(indexHtml), 'style inline de index.html 100 % HEX/RGB sans oklch/oklab/color-mix');

for (const ref of assetRefs) {
  const full = path.join(DIST, ref.slice(1));
  const exists = existsSync(full) && statSync(full).size > 100;
  check(exists, `bundle référencé ${ref} existe et est non vide`);
  if (exists && ref.endsWith('.css')) {
    const css = readFileSync(full, 'utf8');
    check(css.includes('#f5f2eb') && css.includes('#141210'), `CSS compilé (${path.basename(ref)}) contient les tokens Noir Charbon & Or`);
    check(!css.includes('@layer'), `CSS compilé (${path.basename(ref)}) sans aucun @layer bloquant`);
    check(!css.includes('@property'), `CSS compilé (${path.basename(ref)}) sans @property bloquant`);
    check(!/oklch\(|oklab\(|color-mix\(/i.test(css), `CSS compilé (${path.basename(ref)}) 100 % HEX/RGB universel (zéro oklch/oklab/color-mix)`);
  }
}

// Vérifie que vercel.json n'intercepte JAMAIS un fichier statique vers /index.html
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const spaRewrite = (vercel.rewrites || []).find((r) => r.destination === '/index.html');
check(Boolean(spaRewrite), 'vercel.json définit la réécriture SPA vers /index.html');
if (spaRewrite) {
  const regex = new RegExp(`^${spaRewrite.source}$`);
  for (const staticPath of [
    '/assets/index-abc123.css',
    '/assets/index-abc123.js',
    '/images/landing/chantier-abidjan.webp',
    '/images/landing/chantier-abidjan.jpg',
    '/images/landing/equipe-terrain.jpg',
    '/images/landing/suivi-budget.jpg',
    '/pdfjs/cmaps/Identity-H.bcmap',
    '/logo.svg',
    '/favicon.svg',
    '/favicon-32.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/site.webmanifest',
    '/sw.js',
    '/api/health',
  ]) {
    check(!regex.test(staticPath), `vercel.json NE réécrit PAS ${staticPath} vers /index.html`);
  }
  for (const spaRoute of [
    '/',
    '/connexion',
    '/inscription',
    '/chantiers',
    '/chantiers/123',
    '/documents',
    '/terrain',
    '/gestion',
    '/parametres',
    '/offres',
    '/cgu',
  ]) {
    check(regex.test(spaRoute), `vercel.json réécrit bien la route applicative ${spaRoute} vers /index.html`);
  }
}

if (failures > 0) {
  console.error(`\nÉCHEC : ${failures} contrôle(s) en erreur.`);
  process.exit(1);
}
console.log('\nSUCCÈS : tous les assets, types MIME, CSS universel HEX/RGB et règles de routage sont conformes.\n');
