# Thème Noir Charbon & Or — ChantierPilot

Ce document décrit l’identité visuelle **Noir Charbon & Or**, les garanties d’accessibilité, l’organisation de la navigation métier et les garde-fous techniques mis en place pour la production sur `https://chantierpilote.vercel.app`.

---

## 1. Palette de référence et contrastes WCAG

| Rôle visuel | Hex | Usage | Contraste mesuré |
| --- | --- | --- | --- |
| **Noir Charbon profond** | `#0c0b09` | En-tête public, écrans d’authentification, icône PWA | `18,1 : 1` avec `#fbf8f1` (AAA) |
| **Noir Charbon surface** | `#141210` | Barre latérale, bandeau tableau de bord, en-tête de modale, pied de page | `16,8 : 1` avec `#fbf8f1` (AAA) |
| **Ardoise chaude** | `#1c1916` / `#1f1b17` | Cartes encastrées sur fond sombre, champ de recherche latéral | `14,6 : 1` avec `#fbf8f1` (AAA) |
| **Or Chantier (CTA principal)** | `#e5a93b` | Bouton primaire, onglet actif latéral, repères de plan ouverts | **`8,85 : 1`** avec texte `#141210` (AAA) |
| **Or Lumière (sur fond sombre)** | `#eab956` / `#f4a340` | Mots-clés mis en valeur, toit du pictogramme Logo & PDF, badges sombres | **`10,2 : 1`** sur `#141210` (AAA) |
| **Or Ambré foncé (sur fond clair)** | `#854d0e` | Surtitres (`eyebrow`), liens d’action et indicateurs sur fond clair | **`6,2 – 6,7 : 1`** sur `#ffffff` / `#f5f2eb` (AA) |
| **Sable Ivoire (fond applicatif)** | `#f5f2eb` | Arrière-plan général reposant en plein soleil sur mobile | `15,1 : 1` avec `#141210` (AAA) |

### Typographie & lisibilité des montants FCFA
- Police géométrique **Plus Jakarta Sans** avec variantes tabulaires (`font-variant-numeric: tabular-nums lining-nums`) activées via `.tabular` sur tous les montants en FCFA, pourcentages et compteurs.
- Cibles tactiles minimales de `44 px` (`min-h-11`) sur tous les champs, boutons et entrées mobiles.

---

## 2. Organisation de la navigation et parcours utilisateur

1. **Navigation structurée en 4 pôles métier (`src/components/Layout.jsx`)** :
   - **Pilotage** : *Tableau de bord*, *Chantiers*
   - **Commerce & trésorerie** : *Devis & factures* (administrateurs), *Dépenses*, *Encaissements*
   - **Terrain & coordination** : *Carnet de chantier*, *Gestion avancée* (plans annotés, Gantt, multi-dépôts)
   - **Entreprise** : *Paramètres*, *Offres & tarifs*
2. **Recherche rapide instantanée (`Ctrl/Cmd + K`)** : filtre à la volée les rubriques principales ainsi que les sous-modules profonds (*Nouveau chantier*, *Nouveau devis*, *Journal photo*, *Tâches & réserves*, *Avances de caisse*, *Ouvriers & présences*, *Plans annotés*, *Planning Gantt*, *Stocks multi-dépôts*).
3. **Actions directes sans clic perdu** :
   - Le bouton **« + Nouveau chantier »** (et **« Créer mon premier chantier »**) sur le tableau de bord ouvre directement la modale de création et redirige vers la fiche du chantier créé.
   - Les raccourcis `/chantiers?nouveau=1`, `/depenses?nouveau=1`, `/encaissements?nouveau=1` et `/documents?nouveau=1` ouvrent immédiatement le formulaire correspondant.
4. **Navigation mobile ergonomique** :
   - Barre d’accès rapide fixe en bas d’écran (*Accueil*, *Chantiers*, *Terrain*, *Dépenses*, *Rubriques*) complétée par un tiroir latéral complet avec recherche intégrée.
5. **Honnêteté des données** :
   - Sur la page d’accueil publique (`LandingPage.jsx`), l’aperçu porte explicitement les mentions *« Données fictives »* et *« Illustration du tableau de bord · chiffres fictifs, à titre de démonstration »*, sans aucun faux témoignage.
   - Dans l’espace connecté (`DashboardPage.jsx`), **aucun chiffre n’est jamais inventé** : un compte neuf affiche `0 FCFA` et un parcours d’accompagnement en 3 étapes.

---

## 3. Diagnostic et correctif production des CSS, images et Service Worker

### Cause racine identifiée sur la production Vercel
1. Dans `vercel.json`, la règle générique `/(.*) -> /index.html` interceptait toute requête vers un chemin d’asset absent ou issu d’un déploiement précédent (`/assets/*.css`, `/images/*`) et renvoyait `index.html` avec le statut `200 text/html`. Avec `X-Content-Type-Options: nosniff`, le navigateur rejette légitimement toute feuille CSS servie en `text/html`.
2. Dans `scripts/service-worker.js`, l’ancienne mise en cache ne vérifiait ni `response.ok` ni l’absence de `Content-Type: text/html` sur les extensions statiques (`.css`, `.js`, `.svg`, `.png`, `.webp`, `.jpg`), et `vite.config.js` ne précachait pas `.mjs` ni les icônes/illustrations publiques.

### Correctifs appliqués
- **`vercel.json`** : exclusion stricte de `/api/`, `/assets/`, `/images/`, `/pdfjs/`, des fichiers racine (`logo.svg`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`, `sw.js`) et de toute URL portant une extension statique de la réécriture `/index.html` ; ajout de `Cache-Control: no-cache, no-store, must-revalidate` sur `/sw.js`, `immutable` sur `/assets/*` et `worker-src 'self' blob:;` dans la CSP pour PDF.js.
- **`scripts/service-worker.js` & `vite.config.js`** : validation `isValidAssetResponse` (rejet systématique des réponses non-200 ou `text/html` pour les fichiers statiques et purge automatique d’une entrée HTTP corrompue) **sans jamais toucher ni supprimer la base IndexedDB `chantierpilot-terrain-v1`** qui conserve la file de synchronisation hors ligne des équipes terrain.

---

## 4. Commandes de vérification

```bash
npm run build           # Build client + Service Worker versionné
npm run check:assets    # Vérifie dist/, les en-têtes/rewrites vercel.json et l'intégrité des images/CSS
npm run test:all        # Suites API, migrations Neon, conformité landing et unités PDF/icônes
npm run test:theme      # Vérification Playwright desktop + mobile, contrastes WCAG et parcours UX
node scripts/check-assets.mjs --live=https://chantierpilote.vercel.app
```
