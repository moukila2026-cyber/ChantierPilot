// Parcours produit isolés : navigation, formulaires, rôles et cloisonnement.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium as playwright } from 'playwright';
import chromium, { inflate } from '@sparticuz/chromium';
import { startIsolatedBrowserApp } from './helpers/isolated-browser.mjs';
import { isolatedTestEnv } from './helpers/isolation.mjs';

const app = await startIsolatedBrowserApp();
let browser;
const failures = [];
const fakePassword = () => `A1${randomBytes(20).toString('hex')}`;
const fakeEmail = (prefix) => `${prefix}-${randomBytes(8).toString('hex')}@example.invalid`;
const fakeIp = () => {
  const bytes = randomBytes(2);
  return `198.19.${bytes[0]}.${bytes[1]}`;
};

function watchPage(page) {
  const expectedStatuses = new Set([401, 422]);
  page.on('pageerror', (error) => failures.push(`Erreur JavaScript : ${error.message}`));
  page.on('console', (message) => {
    // Les réponses d'authentification et de validation sont provoquées par le test.
    const status = message.text().match(/Failed to load resource: the server responded with a status of (\d+)\b/);
    if (message.type() === 'error' && !(status && expectedStatuses.has(Number(status[1])))) {
      failures.push(`Console : ${message.text()}`);
    }
  });
  return expectedStatuses;
}

async function makeContext(viewport) {
  return browser.newContext({
    baseURL: app.origin,
    viewport,
    extraHTTPHeaders: { 'x-forwarded-for': fakeIp() },
  });
}

async function register(page, company, email, password) {
  await page.goto('/inscription');
  await page.locator('#c-name').fill(company);
  await page.locator('#u-name').fill('Responsable fictif');
  await page.locator('#u-email').fill(email);
  await page.locator('#u-password').fill(password);
  await page.getByRole('button', { name: 'Créer mon entreprise', exact: true }).click();
  await page.waitForURL(`${app.origin}/`);
  await page.getByRole('heading', { name: /Bonjour/ }).waitFor();
}

try {
  await inflate(new URL('../node_modules/@sparticuz/chromium/bin/al2023.tar.br', import.meta.url).pathname);
  browser = await playwright.launch({
    executablePath: await chromium.executablePath(),
    // Le mode mono-processus de Lambda peut faire planter Chromium lors de la
    // création simultanée de plusieurs contextes indépendants.
    args: chromium.args.filter((arg) => arg !== '--single-process' && !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content')),
    env: isolatedTestEnv({ LD_LIBRARY_PATH: '/tmp/al2023/lib' }),
    headless: true,
  });

  const admin = await makeContext({ width: 390, height: 844 });
  const page = await admin.newPage();
  const expectedAdminStatuses = watchPage(page);
  await page.goto('/inscription');
  const visibilityToggle = page.getByRole('button', { name: 'Afficher le mot de passe' });
  await visibilityToggle.click();
  assert.equal(await page.locator('#u-password').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Masquer le mot de passe' }).click();
  assert.equal(await page.locator('#u-password').getAttribute('type'), 'password');
  await page.getByRole('button', { name: 'Créer mon entreprise', exact: true }).click();
  await page.getByRole('alert').first().waitFor();
  assert.match(await page.getByRole('alert').first().innerText(), /entreprise|nom|caractères/i);

  const adminEmail = fakeEmail('admin-a');
  const adminPassword = fakePassword();
  await register(page, 'Entreprise Alpha fictive', adminEmail, adminPassword);
  console.log('  ✓ Inscription mobile, validation française et affichage/masquage du mot de passe');

  // Les deux liens de l'état vide doivent ouvrir le bon formulaire, puis Escape le ferme.
  await page.goto('/photos');
  for (const name of ['+ Créer d’abord un chantier', '+ Nouveau chantier']) {
    await page.getByRole('link', { name, exact: true }).click();
    await page.getByRole('dialog', { name: 'Nouveau chantier' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.goto('/photos');
  }
  await page.getByRole('link', { name: '+ Nouveau chantier', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau chantier' });
  await dialog.getByLabel('Nom du chantier').fill('Chantier Alpha fictif');
  await dialog.locator('#p-client').fill('Client fictif');
  await dialog.getByLabel('Budget prévisionnel (FCFA)').fill('2500000');
  await dialog.getByRole('button', { name: 'Créer le chantier' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('link', { name: 'Chantier Alpha fictif', exact: true }).waitFor();
  const projects = await (await admin.request.get('/api/projects')).json();
  const projectId = projects.projects.find((p) => p.name === 'Chantier Alpha fictif').id;
  console.log('  ✓ Liens de création, fermeture de modale et création mobile du chantier');

  // Liens corrigés : cliquer vraiment dans les deux tailles, sans contrôles imbriqués.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ['/chantiers', '/depenses', '/encaissements', '/terrain']) {
      await page.goto(route);
      const link = page.getByRole('link', { name: '📷 Photos & reçus', exact: true });
      assert.equal(await link.locator('button').count(), 0);
      await link.click();
      await page.waitForURL(`${app.origin}/photos`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.goto('/terrain');
    await page.getByRole('link', { name: 'Devis & factures →', exact: true }).click();
    await page.waitForURL(`${app.origin}/documents`);
  }
  console.log('  ✓ Liens Photos et Devis depuis les pages métier, sur bureau et mobile');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  assert.equal(await page.getByRole('button', { name: 'Ouvrir le menu' }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('navigation', { name: 'Menu mobile métier' }).getByRole('link', { name: 'Paramètres', exact: true }).click();
  await page.waitForURL(`${app.origin}/parametres`);
  assert.equal(await page.getByRole('button', { name: 'Ouvrir le menu' }).getAttribute('aria-expanded'), 'false');

  // Créer un agent et vérifier qu'une erreur de validation ne ferme pas le formulaire.
  const agentEmail = fakeEmail('agent-a');
  const agentPassword = fakePassword();
  await page.getByLabel('Nom complet de l’agent').fill('Agent Alpha fictif');
  await page.getByLabel('E-mail de l’agent').fill(agentEmail);
  await page.locator('#t-password').fill(fakePassword());
  await page.getByRole('button', { name: 'Créer le compte agent' }).click();
  await page.getByText('Agent Alpha fictif').waitFor();
  await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
  const resetInput = page.getByLabel('Nouveau mot de passe provisoire');
  const tooShort = 'a1';
  await resetInput.fill(tooShort);
  const [rejectedReset] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/team/') && response.request().method() === 'PATCH'),
    page.getByRole('button', { name: 'Valider', exact: true }).click(),
  ]);
  assert.equal(rejectedReset.status(), 422);
  await page.getByText('Le mot de passe doit contenir au moins 10 caractères.', { exact: true }).waitFor();
  assert.equal(await resetInput.isVisible(), true);
  assert.equal(await resetInput.inputValue(), tooShort);
  await resetInput.fill(agentPassword);
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await resetInput.waitFor({ state: 'hidden' });
  await page.getByText(/anciennes sessions sont déconnectées/i).waitFor();
  console.log('  ✓ Menu mobile, création d’agent et réinitialisation avec erreur récupérable');

  // Une panne de chargement de l'équipe doit être signalée, pas remplacée
  // silencieusement par une liste vide.
  const teamError = 'Chargement de l’équipe momentanément indisponible.';
  expectedAdminStatuses.add(503);
  await page.route('**/api/team', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'indisponible', message: teamError } }),
  }));
  await page.reload();
  await page.getByText(teamError, { exact: true }).waitFor();
  await page.unroute('**/api/team');
  await page.reload();
  await page.getByText('Agent Alpha fictif').first().waitFor();
  expectedAdminStatuses.delete(503);

  // Contrôler les cinq exports réels, y compris une cellule potentiellement
  // interprétée comme formule et la conservation de la donnée d'origine en JSON.
  const formulaProject = await admin.request.post('/api/projects', { data: {
    name: '=1+1', client_name: 'Client fictif', budget: 0, start_date: '2026-01-01',
  } });
  assert.equal(formulaProject.status(), 201);
  const exportNames = ['Chantiers (CSV)', 'Dépenses (CSV)', 'Encaissements (CSV)', 'Export complet (CSV)', 'Export JSON (partiel)'];
  for (const name of exportNames) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name, exact: true }).click(),
    ]);
    const bytes = readFileSync(await download.path());
    assert.ok(bytes.length > 0);
    if (name.endsWith('(CSV)')) {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      if (name === 'Chantiers (CSV)') assert.ok(bytes.toString('utf8').includes("'=1+1"));
    } else {
      const backup = JSON.parse(bytes.toString('utf8'));
      assert.ok(JSON.stringify(backup).includes('=1+1'));
    }
  }
  console.log('  ✓ Erreur de chargement de l’équipe visible et cinq exports téléchargés');

  const routes = ['/', '/chantiers', `/chantiers/${projectId}`, '/documents', '/depenses', '/encaissements', '/photos', '/terrain', '/gestion', '/parametres', '/offres', '/cgu', '/adresse-inconnue'];
  for (const route of routes) {
    await page.goto(route, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('a button, button a').count(), 0, `Contrôles imbriqués sur ${route}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Débordement mobile sur ${route}`);
  }
  console.log('  ✓ Treize routes en mobile : pas de débordement ni de boutons dans les liens');

  const other = await makeContext({ width: 1440, height: 900 });
  const otherPage = await other.newPage();
  watchPage(otherPage);
  await register(otherPage, 'Entreprise Bêta fictive', fakeEmail('admin-b'), fakePassword());
  await otherPage.goto('/chantiers');
  await otherPage.getByRole('heading', { name: 'Chantiers', exact: true }).waitFor();
  assert.equal(await otherPage.getByText('Chantier Alpha fictif').count(), 0);
  const foreign = await other.request.get(`/api/projects/${projectId}`);
  assert.ok([403, 404].includes(foreign.status()));
  console.log('  ✓ Deux entreprises : chantier étranger ni listé ni accessible');

  const member = await makeContext({ width: 390, height: 844 });
  const memberPage = await member.newPage();
  watchPage(memberPage);
  await memberPage.goto('/connexion');
  await memberPage.getByLabel('Adresse e-mail').fill(agentEmail);
  await memberPage.locator('#password').fill(fakePassword());
  await memberPage.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await memberPage.getByText('Adresse e-mail ou mot de passe incorrect.').waitFor();
  await memberPage.locator('#password').fill(agentPassword);
  await memberPage.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await memberPage.waitForURL(`${app.origin}/`);
  await memberPage.getByRole('link', { name: 'Voir les chantiers', exact: true }).first().click();
  await memberPage.waitForURL(`${app.origin}/chantiers`);
  assert.equal(await memberPage.getByRole('button', { name: '+ Nouveau chantier', exact: true }).count(), 0);
  await memberPage.getByRole('link', { name: '📷 Photos & reçus', exact: true }).click();
  await memberPage.waitForURL(`${app.origin}/photos`);
  await memberPage.goto('/terrain');
  await memberPage.getByRole('heading', { name: 'Carnet de chantier' }).waitFor();
  assert.equal(await memberPage.getByRole('link', { name: 'Devis & factures →', exact: true }).count(), 0);
  assert.equal((await member.request.get('/api/team')).status(), 403);
  assert.equal((await member.request.get('/api/documents')).status(), 403);
  assert.equal((await member.request.get(`/api/projects/${projectId}/report`)).status(), 403);
  console.log('  ✓ Agent : connexion, navigation mobile et refus des actions réservées à la direction');

  // La confirmation de déconnexion est explicitement acceptée.
  await memberPage.getByRole('button', { name: 'Ouvrir le menu' }).click();
  memberPage.once('dialog', (prompt) => prompt.accept());
  await memberPage.getByRole('button', { name: 'Se déconnecter' }).click();
  await memberPage.waitForURL(`${app.origin}/connexion`);
  assert.deepEqual(failures, []);
  await member.close();
  await other.close();
  await admin.close();
  console.log('  ✓ Déconnexion confirmée et aucune erreur JavaScript inattendue');
  console.log('══ Interactions critiques : SUCCÈS ══');
} finally {
  await browser?.close();
  await app.stop();
}
