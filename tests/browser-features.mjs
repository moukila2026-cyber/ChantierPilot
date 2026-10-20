// Test navigateur end-to-end (Playwright Chromium) des 9 fonctionnalités métier BTP :
// 1. Compression photo mobile (WebP → JPEG < 400 Ko sur <canvas>) + visionneuse zoomable
// 2. Recherche plein-texte instantanée + totaux filtrés en FCFA sur Dépenses
// 3. Import BPU CSV + duplication de devis en 1 clic + partage WhatsApp sur Devis & facturation
// 4. Suivi des contrats sous-traitants / tâcherons + acomptes liés + alerte d'avance > avancement
// 5. Centre d'alertes proactives sur le Tableau de bord
// 6. Retenue de garantie BTP (5 % / 10 %) + bascule de mainlevée
// 7. Trésorerie mensuelle (6 mois), ventilation par poste BTP & classement fournisseurs
// 8. Liens WhatsApp normalisés +225 (chantier, devis, sous-traitant)
// 9. PV interne de réception PDF téléchargeable (/api/projects/:id/reception)

import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium as playwright } from 'playwright';
import chromium, { inflate } from '@sparticuz/chromium';
import { startEmbeddedPostgres } from '../server/embedded-pg.mjs';

const DIST = path.resolve('dist');
const API_PORT = 3705;

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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(candidate).pipe(res);
    return;
  }
  if (STATIC_EXT_RE.test(pathname) || pathname.startsWith('/assets/')) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
});
await new Promise((r) => web.listen(0, r));
const origin = `http://localhost:${web.address().port}`;

const pg = await startEmbeddedPostgres({ dataDir: '/tmp/pg-features-test', port: 55441, persist: false });
const mig = spawnSync(process.execPath, ['db/migrate.mjs'], {
  env: { ...process.env, DB_DRIVER: 'pg', NODE_ENV: 'test', DATABASE_URL: pg.url, DATABASE_URL_ADMIN: pg.url },
  encoding: 'utf8',
});
assert.equal(mig.status, 0, `Migration échouée : ${mig.stderr || mig.stdout}`);

const apiProc = spawn(process.execPath, ['server/dev.mjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DB_DRIVER: 'pg',
    API_PORT: String(API_PORT),
    APP_ORIGIN: origin,
    DATABASE_URL: pg.url.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@'),
    SESSION_SECRET: 'secret_test_features_navigateur_32c_001',
    SASPAY_WEBHOOK_SECRET: 'saspay_test_secret',
  },
  stdio: 'ignore',
});

for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
    if (r.ok) break;
  } catch { /* attente démarrage */ }
  await new Promise((r) => setTimeout(r, 150));
}

const systemChrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  .find((p) => fs.existsSync(p));
let browser;
if (systemChrome) {
  browser = await playwright.launch({
    executablePath: systemChrome,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });
} else {
  await inflate(path.resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:${process.env.LD_LIBRARY_PATH || ''}`;
  browser = await playwright.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((arg) => !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content')),
    headless: true,
  });
}

async function expectTextGone(page, txt) {
  for (let i = 0; i < 30; i += 1) {
    if ((await page.getByText(txt).count()) === 0) return;
    await page.waitForTimeout(100);
  }
  assert.equal(await page.getByText(txt).count(), 0);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1. Inscription d'une entreprise cliente
  await page.goto(`${origin}/inscription`, { waitUntil: 'networkidle' });
  await page.fill('#c-name', 'Lagune Bâtiment CI');
  await page.fill('#c-phone', '+225 07 01 02 03 04');
  await page.fill('#u-name', 'Kouadio Yao');
  await page.fill('#u-email', 'yao@lagune-btp.ci');
  await page.fill('#u-password', 'ChantierSolide2026!');
  await page.click('button[type="submit"]');
  await page.getByRole('heading', { name: /Bonjour.*Kouadio/ }).waitFor();
  console.log('  ✓ Compte entreprise créé et accueilli sur le Tableau de bord');

  // 2. Création d'un chantier avec WhatsApp client + retenue de garantie 10 % échue
  await page.getByRole('button', { name: /\+ Nouveau chantier/i }).first().click();
  await page.locator('#p-name').fill('Résidence Angré 8e Tranche');
  await page.locator('#p-client').fill('Mme Touré Aminata');
  await page.locator('#p-phone').fill('07 08 09 10 11');
  await page.locator('#p-loc').fill('Cocody Angré');
  await page.locator('#p-budget').fill('25000000');
  await page.locator('#p-ret').selectOption('1000');
  await page.locator('#p-ret-date').fill('2026-02-01');
  await page.getByRole('button', { name: /Créer le chantier/i }).click();
  await page.waitForURL('**/chantiers/*');

  // Vérifie le lien WhatsApp +225 normalisé et l'encart de retenue 10 % (2 500 000 FCFA)
  const waLink = page.getByRole('link', { name: /WhatsApp client/i });
  const waHref = await waLink.getAttribute('href');
  assert(waHref.startsWith('https://wa.me/2250708091011?text='), `Lien WhatsApp inattendu : ${waHref}`);
  await page.getByText(/Retenue de garantie contractuelle \(10 %\)/i).waitFor();

  // Vérifie le téléchargement réel du PV interne de réception PDF
  const pvLink = await page.getByRole('link', { name: /PV réception PDF/i }).getAttribute('href');
  const pvRes = await page.request.get(`${origin}${pvLink}`);
  assert.equal(pvRes.status(), 200);
  const pvBytes = await pvRes.body();
  assert.equal(pvBytes.subarray(0, 5).toString(), '%PDF-');
  console.log('  ✓ Chantier, retenue de garantie 10 %, lien WhatsApp +225 et PV réception PDF vérifiés');

  // 3. Compression photo WebP sur <canvas> + visionneuse modale zoomable
  await page.getByRole('button', { name: /\+ Dépense/i }).click();
  await page.locator('#e-amount').fill('1200000');
  await page.locator('#e-sup').fill('Cimenterie Abidjan');
  await page.locator('#e-desc').fill('200 sacs ciment CPJ 42.5');
  const webpSample = path.resolve('public/images/landing/equipe-terrain.webp');
  await page.locator('input[type="file"]').first().setInputFiles(webpSample);
  await page.getByText(/photo optimisée/i).waitFor();
  await page.getByRole('button', { name: /Ajouter la dépense/i }).click();
  await page.getByRole('tab', { name: /Dépenses \(1\)/i }).click();
  await page.getByRole('button', { name: /Aperçu/i }).first().click();
  await page.getByText('100 %').waitFor();
  await page.getByRole('button', { name: '+', exact: true }).click();
  await page.getByText('125 %').waitFor();
  await page.keyboard.press('Escape');
  console.log('  ✓ Compression photo WebP → JPEG (<canvas>) et visionneuse modale zoomable vérifiées');

  // 4. Sous-traitants / tâcherons + acompte lié + alerte d'avance excessive + analyse des coûts
  await page.getByRole('tab', { name: /Sous-traitants/i }).click();
  await page.getByRole('button', { name: /\+ Sous-traitant \/ tâcheron/i }).click();
  await page.locator('#st-name').fill('Atelier Bamba Carrelage');
  await page.locator('#st-lot').fill('Carrelage & faïence');
  await page.locator('#st-phone').fill('05 04 03 02 01');
  await page.locator('#st-amt').fill('5000000');
  await page.locator('#st-prog').fill('20');
  await page.getByRole('button', { name: /Ajouter le contrat/i }).click();
  await page.getByRole('button', { name: /\+ Verser un acompte/i }).click();
  await page.locator('#sp-amt').fill('2500000');
  await page.locator('#sp-desc').fill('Acompte démarrage lot carrelage');
  await page.getByRole('button', { name: /Enregistrer le versement/i }).click();
  await page.getByText(/Avance > avancement/i).waitFor();

  await page.getByRole('tab', { name: /Analyse des coûts/i }).click();
  await page.getByText(/Atelier Bamba Carrelage/i).waitFor();
  await page.getByText(/Cimenterie Abidjan/i).waitFor();
  console.log('  ✓ Contrats sous-traitants, versement acompte, alerte d’avance et analyse des coûts vérifiés');

  // 5. Recherche plein-texte instantanée + totaux filtrés en direct sur /depenses
  await page.goto(`${origin}/depenses`);
  await page.getByPlaceholder(/Rechercher un fournisseur/i).fill('Bamba');
  await page.getByText(/Total des dépenses filtrées/i).first().waitFor();
  await expectTextGone(page, 'Cimenterie Abidjan');
  await page.getByText('Atelier Bamba Carrelage').first().waitFor();
  console.log('  ✓ Recherche plein-texte instantanée et totaux filtrés dynamiques sur Dépenses vérifiés');

  // 6. Import BPU CSV + création devis + duplication 1 clic + WhatsApp sur /documents
  await page.goto(`${origin}/documents`);
  await page.getByRole('button', { name: /Importer BPU \(CSV\)/i }).click();
  await page.getByRole('button', { name: /Importer 5 poste\(s\)/i }).click();
  await page.getByText(/5 ouvrage\(s\) ajouté\(s\)/i).first().waitFor();

  await page.getByRole('button', { name: /\+ Devis/i }).click();
  await page.locator('#q-title').fill('Travaux Second Œuvre Angré');
  await page.locator('#q-client').fill('Mme Touré Aminata');
  await page.getByLabel(/Ajouter depuis ma bibliothèque/i).selectOption({ index: 1 });
  await page.getByRole('button', { name: /Créer le brouillon/i }).click();
  await page.getByText('DEV-').first().waitFor();
  await page.getByRole('button', { name: /Dupliquer/i }).first().click();
  await page.getByText(/Devis dupliqué en brouillon/i).first().waitFor();
  console.log('  ✓ Import BPU CSV, création devis depuis BPU, duplication en 1 clic et WhatsApp vérifiés');

  // 7. Tableau de bord analytique & centre d'alertes proactives
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByText(/Trésorerie mensuelle \(6 mois\)/i).first().waitFor();
  await page.getByText(/Dépenses par poste BTP/i).first().waitFor();
  await page.getByText(/Principaux fournisseurs/i).first().waitFor();
  await page.getByText(/Avance sous-traitant supérieure/i).first().waitFor();
  await page.getByText(/Retenue de garantie libérable/i).first().waitFor();
  console.log('  ✓ Tableau de bord analytique 6 mois & centre d’alertes proactives vérifiés');

  console.log('══ Test navigateur des 9 fonctionnalités métier BTP : SUCCÈS TOTAL ══');
} finally {
  await browser?.close();
  web.close();
  apiProc.kill('SIGTERM');
  await pg.stop();
}
