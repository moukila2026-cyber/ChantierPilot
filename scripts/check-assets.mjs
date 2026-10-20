import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failed = 0;
function check(ok, label, detail = '') {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  KO  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n── Vérification locale des assets de build (dist/) et de la configuration Vercel ──');

const requiredDist = [
  ['index.html', (b) => b.toString('utf8').includes('<!doctype html>')],
  ['logo.svg', (b) => b.toString('utf8').includes('#f4a340') && b.toString('utf8').includes('<svg')],
  ['favicon.svg', (b) => b.toString('utf8').includes('#f4a340') && b.toString('utf8').includes('<svg')],
  ['favicon-32.png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['apple-touch-icon.png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['icon-192.png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['icon-512.png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['site.webmanifest', (b) => {
    const j = JSON.parse(b.toString('utf8'));
    return j.theme_color === '#141210' && Array.isArray(j.icons) && j.icons.length >= 2;
  }],
  ['sw.js', (b) => {
    const s = b.toString('utf8');
    return s.includes('isValidAssetResponse')
      && s.includes('text/html')
      && !s.includes('deleteDatabase')
      && !s.includes('indexedDB.');
  }],
  ['images/landing/chantier-abidjan.webp', (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'],
  ['images/landing/chantier-abidjan.jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
];

for (const [rel, validate] of requiredDist) {
  const full = join('dist', rel);
  if (!existsSync(full)) {
    check(false, `dist/${rel}`, 'fichier absent (lancez npm run build)');
    continue;
  }
  const size = statSync(full).size;
  const buf = readFileSync(full);
  check(size > 64 && validate(buf), `dist/${rel} présent et valide (${size} octets)`);
}

if (existsSync('dist/index.html')) {
  const html = readFileSync('dist/index.html', 'utf8');
  const assetRefs = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check(assetRefs.some((r) => r.endsWith('.css')), 'index.html lie au moins une feuille CSS compilée');
  check(assetRefs.some((r) => r.endsWith('.js')), 'index.html lie au moins un bundle JS compilé');
  for (const ref of assetRefs) {
    const p = join('dist', ref.slice(1));
    check(existsSync(p) && statSync(p).size > 1024, `bundle référencé ${ref} existe et est non vide`);
  }
  const cssFiles = existsSync('dist/assets')
    ? readdirSync('dist/assets').filter((f) => f.endsWith('.css'))
    : [];
  for (const cssFile of cssFiles) {
    const css = readFileSync(join('dist/assets', cssFile), 'utf8');
    check(css.includes('#141210') && css.includes('#e5a93b'), `CSS compilé (${cssFile}) contient les tokens Noir Charbon & Or`);
  }
}

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const spaRewrite = vercel.rewrites?.find((r) => r.destination === '/index.html');
check(Boolean(spaRewrite), 'vercel.json définit la réécriture SPA vers /index.html');

const regex = new RegExp(`^${spaRewrite.source}$`);
for (const staticPath of [
  '/assets/index-abc123.css',
  '/assets/index-abc123.js',
  '/images/landing/chantier-abidjan.webp',
  '/images/landing/chantier-abidjan.jpg',
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
for (const spaRoute of ['/', '/connexion', '/inscription', '/chantiers', '/chantiers/123', '/documents', '/terrain', '/gestion', '/parametres', '/offres', '/cgu']) {
  check(regex.test(spaRoute), `vercel.json réécrit bien la route applicative ${spaRoute} vers /index.html`);
}

const liveArg = process.argv.find((a) => a.startsWith('--live='));
const liveBase = (liveArg ? liveArg.slice('--live='.length) : process.env.CHECK_URL || '').replace(/\/$/, '');

if (liveBase) {
  console.log(`\n── Vérification HTTP réelle sur ${liveBase} ──`);
  const homeRes = await fetch(`${liveBase}/`, { redirect: 'follow' });
  const homeHtml = await homeRes.text();
  check(homeRes.status === 200 && (homeRes.headers.get('content-type') || '').includes('text/html'), `${liveBase}/ répond 200 text/html`);

  const liveAssets = [...homeHtml.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check(liveAssets.length >= 2, `HTML en ligne référence ${liveAssets.length} bundles /assets/*`);

  for (const ref of liveAssets) {
    const r = await fetch(`${liveBase}${ref}`);
    const ct = r.headers.get('content-type') || '';
    const cc = r.headers.get('cache-control') || '';
    const expectedMime = ref.endsWith('.css') ? 'text/css' : 'javascript';
    check(r.status === 200 && ct.includes(expectedMime) && !ct.includes('text/html'), `${ref} -> ${r.status} ${ct}`);
    check(cc.includes('immutable'), `${ref} Cache-Control immutable (${cc})`);
  }

  for (const [path, mimePart] of [
    ['/images/landing/chantier-abidjan.webp', 'image/webp'],
    ['/images/landing/chantier-abidjan.jpg', 'image/jpeg'],
    ['/logo.svg', 'image/svg+xml'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon-32.png', 'image/png'],
    ['/apple-touch-icon.png', 'image/png'],
    ['/icon-192.png', 'image/png'],
    ['/icon-512.png', 'image/png'],
    ['/site.webmanifest', 'manifest'],
    ['/sw.js', 'javascript'],
  ]) {
    const r = await fetch(`${liveBase}${path}`);
    const ct = r.headers.get('content-type') || '';
    check(r.status === 200 && ct.includes(mimePart) && !ct.includes('text/html'), `${path} -> ${r.status} ${ct}`);
  }

  const missingCss = await fetch(`${liveBase}/assets/inexistant-verification-404.css`);
  const missingCt = missingCss.headers.get('content-type') || '';
  check(
    missingCss.status === 404 || !missingCt.includes('text/html'),
    `/assets/inexistant-verification-404.css ne renvoie JAMAIS index.html en 200 (reçu ${missingCss.status} ${missingCt})`,
  );

  for (const deep of ['/connexion', '/inscription', '/offres', '/cgu', '/chantiers', '/terrain']) {
    const r = await fetch(`${liveBase}${deep}`);
    const ct = r.headers.get('content-type') || '';
    check(r.status === 200 && ct.includes('text/html'), `Route SPA ${deep} répond 200 text/html au rechargement`);
  }

  const healthRes = await fetch(`${liveBase}/api/health`);
  const health = await healthRes.json();
  check(healthRes.status === 200 && health.status === 'ok' && health.database === 'ok', `/api/health -> status=${health.status}, database=${health.database}, schema=${health.schema}`);
  check(health.schema === 'ok', `/api/health confirme les 27 tables actives (schema=${health.schema})`);
}

if (failed > 0) {
  console.error(`\nÉCHEC : ${failed} contrôle(s) en erreur.`);
  process.exit(1);
}
console.log('\nTous les contrôles d’assets et de routage sont conformes.\n');
