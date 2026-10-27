// Vérification navigateur réelle du thème Noir Charbon & Or (desktop & mobile),
// des contrastes WCAG, du chargement CSS/JS/images, des deep links, du service worker
// et de la préservation d’IndexedDB (chantierpilot-terrain-v1).
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { chromium as playwright } from 'playwright';
import chromium, { inflate } from '@sparticuz/chromium';
import { startEmbeddedPostgres, forceCleanup } from '../server/embedded-pg.mjs';
import { freePort, isolatedTestEnv } from './helpers/isolation.mjs';

const DIST = path.resolve('dist');
const [API_PORT, PG_PORT] = await Promise.all([freePort(), freePort()]);
const SCREENSHOTS_DIR = '/tmp/cp-screenshots';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const STATIC_EXT_RE = /\.(css|js|mjs|map|json|webmanifest|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|wasm|bcmap|pfb)$/i;

// Serveur fidèle aux règles de vercel.json (jamais index.html sur une extension d'asset)
const web = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.url.startsWith('/api')) {
    const proxy = http.request(
      { host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: req.headers },
      (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); },
    );
    req.pipe(proxy);
    return;
  }

  const candidate = path.resolve(DIST, `.${pathname}`);
  if (candidate.startsWith(DIST) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    const ext = path.extname(candidate).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(candidate).pipe(res);
    return;
  }

  // Reproduit l’exclusion des extensions d’assets dans vercel.json : un asset manquant -> 404 réel
  if (STATIC_EXT_RE.test(pathname) || pathname.startsWith('/assets/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end('Not found');
    return;
  }

  // Deep link SPA -> index.html
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
});
await new Promise((r) => web.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${web.address().port}`;

// Base et répertoire temporaires créés exclusivement pour cette exécution.
const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'chantierpilot-theme-'));
let apiProc;
const cleanup = () => {
  try { apiProc?.kill('SIGKILL'); } catch { /* déjà arrêté */ }
  try { forceCleanup(dataDir); } catch { /* déjà arrêté */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* déjà supprimé */ }
};
process.once('exit', cleanup);
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });
const pg = await startEmbeddedPostgres({ dataDir, port: PG_PORT, persist: true });
const mig = spawnSync(process.execPath, ['db/migrate.mjs'], {
  env: isolatedTestEnv({ DB_DRIVER: 'pg', NODE_ENV: 'test', DATABASE_URL: pg.url, DATABASE_URL_ADMIN: pg.url }),
  encoding: 'utf8',
});
assert.equal(mig.status, 0, `Migration échouée : ${mig.stderr || mig.stdout}`);

apiProc = spawn(process.execPath, ['server/dev.mjs'], {
  env: isolatedTestEnv({
    NODE_ENV: 'test',
    DB_DRIVER: 'pg',
    API_PORT: String(API_PORT),
    APP_ORIGIN: origin,
    DATABASE_URL: pg.url.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@'),
    SESSION_SECRET: 'secret_test_theme_navigateur_32c_000001',
    SASPAY_WEBHOOK_SECRET: 'saspay_test_secret',
  }),
  stdio: 'ignore',
});

for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
    if (r.ok) break;
  } catch { /* démarrage */ }
  await new Promise((r) => setTimeout(r, 150));
}

const systemChrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  .find((p) => fs.existsSync(p));
let browser;
if (systemChrome) {
  browser = await playwright.launch({
    executablePath: systemChrome,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    env: isolatedTestEnv({ LD_LIBRARY_PATH: '/tmp/al2023/lib' }),
    headless: true,
  });
} else {
  await inflate(path.resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  browser = await playwright.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((arg) => !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content')),
    env: isolatedTestEnv({ LD_LIBRARY_PATH: '/tmp/al2023/lib' }),
    headless: true,
  });
}

const sharedCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await sharedCtx.newPage();

function parseRgb(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(rgb1, rgb2) {
  const l1 = luminance(rgb1);
  const l2 = luminance(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

try {
  // 1. Asset manquant -> vrai 404 (jamais 200 text/html)
  const missingCss = await fetch(`${origin}/assets/inexistant.css`);
  assert.equal(missingCss.status, 404, 'Un .css manquant ne doit jamais servir index.html en 200');
  const missingPng = await fetch(`${origin}/images/landing/inexistant.png`);
  assert.equal(missingPng.status, 404, 'Une image manquante ne doit jamais servir index.html en 200');
  console.log('  ✓ Assets inexistants : 404 franc (jamais index.html)');

  // 2. Accueil public Desktop (1440×900) & Mobile (390×844)
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    const assetFailures = [];
    const errors = [];
    const onPageError = (e) => errors.push(e.message);
    const onConsole = (m) => {
      if (m.type() === 'error' && !m.text().includes('status of 401')) errors.push(m.text());
    };
    const onResponse = (res) => {
      const u = res.url();
      if (u.includes('/api/auth/session') && res.status() === 401) return;
      if (u.startsWith(origin) && res.status() >= 400) assetFailures.push(`${res.status()} ${u}`);
      if (u.endsWith('.css') && !(res.headers()['content-type'] || '').includes('text/css')) {
        assetFailures.push(`MIME invalide CSS : ${res.headers()['content-type']}`);
      }
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    page.on('response', onResponse);

    await page.goto(origin, { waitUntil: 'networkidle' });

    const domCheck = await page.evaluate(() => {
      const sheets = document.styleSheets.length;
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const hero = document.querySelector('main section');
      const heroBg = hero ? getComputedStyle(hero).backgroundColor : '';
      const h1 = document.querySelector('h1');
      const h1Color = h1 ? getComputedStyle(h1).color : '';
      const h1Rect = h1 ? h1.getBoundingClientRect() : null;
      const cta = [...document.querySelectorAll('a')].find((a) => a.textContent.includes('Créer mon espace entreprise') && a.offsetParent !== null);
      const ctaBg = cta ? getComputedStyle(cta).backgroundColor : '';
      const ctaColor = cta ? getComputedStyle(cta).color : '';
      const inlineCss = document.getElementById('cp-inline-css');
      const allImgs = [...document.querySelectorAll('picture img')];
      const img = document.querySelector('main picture img');
      const rect = img ? img.getBoundingClientRect() : null;
      const text = document.body.innerText;
      return {
        sheets,
        hasInlineCss: Boolean(inlineCss && inlineCss.textContent.length > 5000),
        bodyBg,
        heroBg,
        h1Color,
        h1Right: h1Rect ? Math.round(h1Rect.right) : 0,
        ctaBg,
        ctaColor,
        imgCount: allImgs.length,
        imgLoaded: Boolean(img && img.complete && img.naturalWidth >= 800),
        imgRect: rect ? { top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), height: Math.round(rect.height) } : null,
        hasFictiveBadge: text.includes('Données fictives'),
        hasSasPay: text.includes('SasPay'),
        hasOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    assert.equal(errors.length, 0, `Erreurs console/JS (${label}) : ${errors.join(' | ')}`);
    assert.equal(assetFailures.length, 0, `Assets en échec (${label}) : ${assetFailures.join(' | ')}`);
    assert.ok(domCheck.sheets >= 1, `Feuille CSS chargée (${label})`);
    assert.ok(domCheck.hasInlineCss, `CSS universel inline embarqué dans index.html (${label})`);
    assert.equal(domCheck.imgCount, 3, `3 illustrations BTP présentes sur l’accueil (${label})`);
    assert.ok(domCheck.imgLoaded, `Illustration BTP chargée (${label})`);
    assert.ok(domCheck.h1Right <= viewport.width, `H1 contenu dans l’écran (${label}) : right=${domCheck.h1Right} <= ${viewport.width}`);
    assert.ok(domCheck.imgRect && domCheck.imgRect.right <= viewport.width && domCheck.imgRect.top < viewport.height && domCheck.imgRect.height >= 150,
      `Illustration BTP visible et cadrée dès le premier écran (${label}) : ${JSON.stringify(domCheck.imgRect)}`);
    assert.ok(domCheck.hasFictiveBadge, `Mention Données fictives visible (${label})`);
    assert.ok(domCheck.hasSasPay, `Mention SasPay visible (${label})`);
    assert.equal(domCheck.hasOverflowX, false, `Pas de débordement horizontal (${label})`);

    const heroContrast = contrastRatio(parseRgb(domCheck.heroBg), parseRgb(domCheck.h1Color));
    const ctaContrast = contrastRatio(parseRgb(domCheck.ctaBg), parseRgb(domCheck.ctaColor));
    assert.ok(heroContrast >= 14, `Contraste Hero Noir Charbon / Ivoire >= 14:1 (${heroContrast.toFixed(2)})`);
    assert.ok(ctaContrast >= 7, `Contraste bouton Or / Noir Charbon >= 7:1 AAA (${ctaContrast.toFixed(2)})`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `landing-${label}.png`), fullPage: false });
    console.log(`  ✓ Accueil ${label} (${viewport.width}×${viewport.height}) : CSS OK, image visible haut de page (y=${domCheck.imgRect.top}px), contrastes AAA (${heroContrast.toFixed(1)}:1 / ${ctaContrast.toFixed(1)}:1)`);
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('response', onResponse);
  }

  // 3. Vérification visuelle & images BTP sur /connexion, /offres et /inscription
  await page.setViewportSize({ width: 1440, height: 900 });
  const appPage = page;

  for (const [routePath, expectedText] of [
    ['/connexion', 'Connexion'],
    ['/offres', 'SasPay'],
    ['/inscription', 'Créer votre entreprise sur ChantierPilot'],
  ]) {
    await appPage.goto(`${origin}${routePath}`, { waitUntil: 'networkidle' });
    const check = await appPage.evaluate(() => {
      const pic = document.querySelector('picture img');
      return {
        text: document.body.innerText,
        imgOk: Boolean(pic && pic.complete && pic.naturalWidth >= 800),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    assert.ok(check.text.includes(expectedText), `Texte attendu sur ${routePath}`);
    assert.ok(check.imgOk, `Illustration BTP bien chargée sur ${routePath}`);
    assert.equal(check.overflowX, false, `Aucun débordement horizontal sur ${routePath}`);
  }
  console.log('  ✓ /connexion, /offres et /inscription : illustrations BTP & CSS universel vérifiés');

  // Deep link /inscription + rechargement
  await appPage.reload({ waitUntil: 'networkidle' });
  await appPage.fill('#c-name', 'Ivoire Structure BTP SARL');
  await appPage.fill('#c-phone', '+225 07 08 09 10 11');
  await appPage.fill('#u-name', 'Awa Kouamé');
  await appPage.fill('#u-email', 'awa@ivoire-structure.ci');
  await appPage.fill('#u-password', ' Chantier2026! '.trim());
  await appPage.click('button[type="submit"]');

  // Tableau de bord neuf : accueil personnalisé + illustration BTP + 0 FCFA partout
  await appPage.getByRole('heading', { name: /Bonjour.*Awa/ }).waitFor();
  const dashCheck = await appPage.evaluate(() => {
    const pic = document.querySelector('picture img');
    return {
      text: document.body.innerText,
      imgOk: Boolean(pic && pic.complete && pic.naturalWidth >= 800),
    };
  });
  assert.ok(dashCheck.imgOk, 'Illustration BTP bien affichée sur le tableau de bord connecté');
  assert.ok(!dashCheck.text.includes('12 000 000'), 'Aucun chiffre fictif dans un compte client réel');
  assert.ok(dashCheck.text.includes('0 FCFA'), 'Un compte neuf affiche 0 FCFA');
  assert.ok(dashCheck.text.includes('Essai gratuit de 2 semaines (14 jours) · 14 jours restants'), 'Le bandeau affiche explicitement les 2 semaines (14 jours restants) d’essai');

  await appPage.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dashboard-empty-desktop.png') });

  // Le bouton « + Nouveau chantier » ouvre directement le formulaire de création
  await appPage.getByRole('button', { name: '+ Nouveau chantier' }).first().click();
  await appPage.getByRole('dialog', { name: 'Nouveau chantier' }).waitFor();
  await appPage.fill('#p-name', 'Résidence Les Orchidées — Cocody Angré');
  await appPage.fill('#p-client', 'SCI Lagune Ivoire');
  await appPage.fill('#p-loc', 'Abidjan — Cocody Angré 8e tranche');
  await appPage.fill('#p-budget', '48000000');
  await appPage.getByRole('button', { name: 'Créer le chantier' }).click();

  await appPage.getByRole('heading', { name: 'Résidence Les Orchidées — Cocody Angré' }).waitFor();
  // Rechargement profond sur la fiche chantier
  await appPage.reload({ waitUntil: 'networkidle' });
  await appPage.getByRole('heading', { name: 'Résidence Les Orchidées — Cocody Angré' }).waitFor();

  // Retour tableau de bord peuplé + capture desktop & mobile
  await appPage.goto(origin, { waitUntil: 'networkidle' });
  await appPage.getByText('48 000 000 FCFA').first().waitFor();
  await appPage.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dashboard-populated-desktop.png') });

  await appPage.setViewportSize({ width: 390, height: 844 });
  await appPage.waitForTimeout(150);
  await appPage.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dashboard-populated-mobile.png') });

  // Vérification complète du CSS & rendu sans débordement sur TOUTES les pages applicatives + nouvel onglet /photos
  await appPage.setViewportSize({ width: 1440, height: 900 });
  for (const [internalRoute, headingText] of [
    ['/chantiers', 'Chantiers'],
    ['/documents', 'Devis & facturation'],
    ['/depenses', 'Dépenses'],
    ['/encaissements', 'Encaissements'],
    ['/photos', 'Photos & reçus'],
    ['/terrain', 'Carnet de chantier'],
    ['/gestion', 'Gestion avancée'],
    ['/parametres', 'Paramètres'],
  ]) {
    await appPage.goto(`${origin}${internalRoute}`, { waitUntil: 'networkidle' });
    await appPage.getByRole('heading', { name: headingText }).first().waitFor();
    const internalStyle = await appPage.evaluate(() => {
      const header = document.querySelector('main section.cp-charcoal-panel');
      const headerBg = header ? getComputedStyle(header).backgroundColor : '';
      return {
        hasCharcoalHeader: Boolean(header),
        headerBg,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    assert.ok(internalStyle.hasCharcoalHeader, `En-tête Noir Charbon & Or présent sur ${internalRoute}`);
    assert.equal(internalStyle.overflowX, false, `Aucun débordement horizontal sur ${internalRoute}`);
  }
  console.log('  ✓ 8/8 pages internes (dont /photos) : en-tête Noir Charbon & Or, CSS complet et zéro débordement vérifiés');

  // 4. Vérification Service Worker + préservation IndexedDB (chantierpilot-terrain-v1)
  await appPage.evaluate(async () => {
    // Crée un ancien cache obsolète (y compris préfixe historique hors cp-shell-) ET une saisie hors-ligne dans IndexedDB
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    await caches.open('cp-shell-legacy-old').then((c) => c.put('/old', new Response('old')));
    await caches.open('chantierpilot-legacy-v0').then((c) => c.put('/ancient', new Response('ancient')));
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('chantierpilot-terrain-v1', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('entries', 'readwrite');
        tx.objectStore('entries').put({
          key: 'outbox:preserve-test:1',
          owner: 'preserve-test',
          body: { action: 'journal', title: 'Saisie terrain hors ligne précieuse' },
          at: Date.now(),
          error: null,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  await appPage.goto('about:blank');
  await appPage.goto(origin, { waitUntil: 'networkidle' });

  const swCheck = await appPage.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active && reg.active.state !== 'activated') {
      await new Promise((resolve) => {
        reg.active.addEventListener('statechange', () => {
          if (reg.active?.state === 'activated') resolve();
        });
        setTimeout(resolve, 2000);
      });
    }
    await new Promise((r) => setTimeout(r, 300));

    const cacheKeys = await caches.keys();
    const idbPreserved = await new Promise((resolve, reject) => {
      const req = indexedDB.open('chantierpilot-terrain-v1', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('entries', 'readonly');
        const all = tx.objectStore('entries').getAll();
        all.onsuccess = () => { db.close(); resolve(all.result); };
        tx.onerror = () => reject(all.error);
      };
      req.onerror = () => reject(req.error);
    });

    return {
      activeState: reg.active?.state,
      cacheKeys,
      idbCount: idbPreserved.filter((e) => e.key === 'outbox:preserve-test:1').length,
      preservedTitle: idbPreserved.find((e) => e.key === 'outbox:preserve-test:1')?.body?.title,
    };
  });

  assert.equal(swCheck.activeState, 'activated', 'Service worker actif');
  assert.ok(!swCheck.cacheKeys.includes('cp-shell-legacy-old'), 'L’ancien cache HTTP obsolète a été nettoyé');
  assert.ok(!swCheck.cacheKeys.includes('chantierpilot-legacy-v0'), 'Les très anciens caches pré-rollout ont été nettoyés aussi');
  assert.ok(swCheck.cacheKeys.some((k) => k.startsWith('cp-shell-')), 'Le cache shell courant est actif');
  assert.equal(swCheck.idbCount, 1, 'IndexedDB chantierpilot-terrain-v1 n’est JAMAIS effacée lors de la mise à jour du SW');
  assert.equal(swCheck.preservedTitle, 'Saisie terrain hors ligne précieuse');
  console.log('  ✓ Tableau de bord, deep links, bouton Nouveau chantier, Service Worker & IndexedDB préservée');

  console.log('══ Test navigateur Thème Noir Charbon & Or : SUCCÈS ══');
} finally {
  await sharedCtx.close();
  await browser.close();
  web.closeAllConnections?.();
  web.close();
  apiProc.kill();
  await pg.stop();
}
process.exit(0);
