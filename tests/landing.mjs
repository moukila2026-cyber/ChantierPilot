import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const text = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const landingSource = text('src/pages/LandingPage.jsx');
const appSource = text('src/App.jsx');
const logoSource = text('src/components/Logo.jsx');
const htmlSource = text('index.html');
const footerSource = text('src/components/ui.jsx');
const checks = [];
const check = (name, condition) => checks.push([name, Boolean(condition)]);

// Smoke-test du rendu réel de la page React (JSX compilé par esbuild + SSR).
const built = await build({
  absWorkingDir: ROOT,
  entryPoints: ['src/pages/LandingPage.jsx'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  jsx: 'automatic',
  packages: 'external',
  write: false,
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, loaded, loaded.exports);
const LandingPage = loaded.exports.default;
const markup = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/' }, React.createElement(LandingPage)));

check('La page d’accueil se compile en JSX', built.outputFiles[0].text.includes('LandingPage'));
check('Le composant React principal est exporté', typeof LandingPage === 'function');
check('La navigation principale est accessible', markup.includes('aria-label="Navigation principale"'));
check('Le titre parle des chantiers qui avancent', markup.includes('Vos chantiers avancent.'));
check('Le titre met en avant la clarté des chiffres', markup.includes('Vos chiffres restent clairs.'));
check('La promesse est située en Côte d’Ivoire', markup.includes('CÔTE D’IVOIRE'));
check('La devise FCFA est annoncée', markup.includes('en français et en FCFA'));
check('Un CTA permet de créer un espace', markup.includes('Créer mon espace entreprise'));
check('Le CTA conduit à l’inscription', markup.includes('href="/inscription"'));
check('La connexion reste accessible', markup.includes('href="/connexion"'));
check('La section fonctionnalités est rendue', markup.includes('id="fonctionnalites"'));
check('La section méthode est rendue', markup.includes('id="methode"'));
check('Les budgets sont abordés', markup.includes('Budgets et dépenses au même endroit'));
check('Le suivi des justificatifs est abordé', markup.includes('Encaissements avec justificatifs'));
check('Les rapports PDF sont présentés', markup.includes('Rapports de chantier exportables en PDF'));
check('La distinction entre déclaration et preuve est explicite', markup.includes('Une référence n’est pas une preuve.'));
check('Le statut prouvé nécessite une pièce jointe', markup.includes('qu’une pièce est jointe'));
check('Aucun témoignage inventé n’est introduit', !/témoignages?|ils nous font confiance|clients satisfaits/i.test(landingSource));
check('Aucune certification revendiquée sans preuve', !/certifi(?:é|ée|cation)|label officiel/i.test(landingSource));
check('Pas de statistiques commerciales inventées dans le mockup', !/42 500 000|18 250 000|21 000 000|clients accompagnés|\d+\s*%/.test(landingSource));
check('Les chiffres du tableau de bord de démonstration restent vides', landingSource.includes("['Chantiers suivis', '—'") && landingSource.includes("['Budget prévisionnel', '—'"));
check('Le menu mobile est contrôlable au bouton', markup.includes('aria-expanded="false"'));
check('Le menu mobile a un nom accessible', markup.includes('aria-label="Ouvrir le menu"'));
check('Le pied de page SHOPIN30 est partagé', footerSource.includes('Conçu par SHOPIN30'));
check('Le numéro de contact est présent dans le pied de page', footerSource.includes('+225 05 01 30 33 43'));
check('Le numéro possède un lien téléphonique international', footerSource.includes('tel:+2250501303343'));
check('Le routage public conserve le tableau de bord connecté', appSource.includes('if (status === \'anon\') return <LandingPage />') && appSource.includes('<RequireAuth><DashboardPage /></RequireAuth>'));
check('La route racine utilise le routeur de page d’accueil', appSource.includes('<Route path="/" element={<HomeRoute />} />'));
check('Le lien vers les offres est rendu', markup.includes('href="/offres"'));
check('L’illustration est servie depuis le site', markup.includes('/images/landing/chantier-abidjan.webp'));
check('Le texte alternatif de l’illustration est utile', markup.includes('alt="Deux professionnels du BTP'));
check('La page comporte une section d’appel à l’action finale', markup.includes('Prêt à mieux vous organiser'));
check('Les offres restent indicatives', markup.includes('Les offres sont présentées à titre indicatif'));
check('Le logo partagé est compactable', logoSource.includes('compact = false') && logoSource.includes('{!compact &&'));
check('Le logo comporte le signe de toit', logoSource.includes('M9 23 23.5 11 39 23'));
check('Le logo comporte une flèche de navigation', logoSource.includes('m25 18 4 3.3-4 3.2'));
check('Le logo comporte des coches de suivi', logoSource.includes('m17 29 2.1 2.1'));
check('Le document HTML déclare le français', /<html lang="fr-CI">/.test(htmlSource));
check('Le favicon SVG est déclaré', htmlSource.includes('href="/favicon.svg"'));
check('Le manifeste PWA est déclaré', htmlSource.includes('href="/site.webmanifest"'));
check('Les fichiers de marque nécessaires existent', ['public/logo.svg', 'public/favicon.svg', 'public/favicon-32.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png', 'public/site.webmanifest'].every((file) => existsSync(path.join(ROOT, file))));
check('Le manifeste déclare les icônes 192 et 512 pixels', JSON.parse(text('public/site.webmanifest')).icons.map((icon) => icon.sizes).join(',') === '192x192,512x512');
check('La photo WebP locale est présente', existsSync(path.join(ROOT, 'public/images/landing/chantier-abidjan.webp')));

assert.equal(checks.length, 43, `Le nombre de contrôles UI doit rester 43 (actuel : ${checks.length}).`);
for (const [name, ok] of checks) {
  if (!ok) console.error(`  ✗ ${name}`);
  else console.log(`  ✓ ${name}`);
}
const failures = checks.filter(([, ok]) => !ok);
console.log(`  RÉSULTAT : ${checks.length - failures.length} réussis, ${failures.length} échoués`);
assert.equal(failures.length, 0, failures.map(([name]) => name).join('\n'));
