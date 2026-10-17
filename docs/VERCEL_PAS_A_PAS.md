# Vercel pas à pas — de zéro au produit fini

Ce guide mène **du dépôt GitHub vide jusqu'à l'application en production**, sans étape sautée. Comptez environ 45 minutes la première fois.

---

## Étape 0 — Ce qu'il faut avoir sous la main

| Élément | Rôle |
| --- | --- |
| Un compte **GitHub** | Hébergement du code |
| Un compte **Neon** (https://neon.tech) | Base PostgreSQL (offre gratuite suffisante pour démarrer) |
| Un compte **Vercel** (https://vercel.com) | Hébergement de l'application (offre gratuite suffisante) |
| Node.js ≥ 20 installé en local | Pour lancer la migration SQL |

---

## Étape 1 — Le code sur GitHub

Le dépôt `moukila2026-cyber/ChantierPilot` contient **tout le code nécessaire** :

```
api/        src/        db/        server/        tests/        docs/
vercel.json  vite.config.js  package.json  package-lock.json  index.html
.env.example  .gitignore  README.md
```

Vérification rapide : sur GitHub, le dépôt doit afficher ces dossiers à la racine
et le fichier `vercel.json`. S'il manque quelque chose :

```bash
git status                # ne doit rien rester d'important non commité
git push origin main      # le code complet est sur la branche principale
```

> `node_modules/`, `.env` et `.pgdata/` sont volontairement ignorés (`.gitignore`) :
> jamais de secret ni de base de données dans Git.

---

## Étape 2 — Créer la base de données (Neon)

1. Allez sur **https://console.neon.tech** → **Create project**.
2. Choisissez :
   - **Region** : la plus proche de vos clients (`us-east-1` ou `eu-central-1`).
   - **PostgreSQL** : version proposée par défaut.
3. Cliquez sur **Connection Details** et notez l'URL de connexion
   (elle ressemble à `postgresql://neondb_owner:XXXX@ep-xxxx.aws.neon.tech/neondb?sslmode=require`).
   C'est votre **`DATABASE_URL_ADMIN`** — la clé d'administration, **réservée aux migrations**.
4. Inventez un mot de passe solide pour le rôle applicatif : c'est votre **`APP_DB_PASSWORD`**
   (12 caractères minimum : lettres, chiffres, `- _ . ! @ #`).

---

## Étape 3 — Initialiser la base (migration)

Depuis votre machine (ou n'importe quel poste avec le code) :

```bash
git clone https://github.com/moukila2026-cyber/ChantierPilot.git
cd ChantierPilot
npm install

DATABASE_URL_ADMIN="postgresql://neondb_owner:XXXX@ep-xxxx.aws.neon.tech/neondb?sslmode=require" \
APP_DB_PASSWORD="VotreMotDePasseSolide" \
node db/migrate.mjs
```

✅ La migration est **idempotente** : vous pouvez la relancer sans risque à chaque
évolution du schéma. À la fin, elle affiche l'URL **applicative** à utiliser :

```
DATABASE_URL=postgresql://chantierpilot_app:VotreMotDePasseSolide@ep-xxxx.aws.neon.tech/neondb?sslmode=require
```

**Copiez-la précieusement** — c'est elle qui va dans Vercel. Elle utilise le rôle
**limité** `chantierpilot_app` : même avec cette clé, impossible de contourner le
cloisonnement entre entreprises (et l'API refuse de démarrer avec une clé
superuser, par sécurité).

---

## Étape 4 — Créer le projet sur Vercel

1. Allez sur **https://vercel.com/new**.
2. **Import Git Repository** → sélectionnez `ChantierPilot` (autorisez Vercel
   à accéder au dépôt GitHub si demandé).
3. Vercel détecte automatiquement **Vite** — ne changez rien :
   - *Framework Preset* : Vite
   - *Build Command* : `npm run build`
   - *Output Directory* : `dist`
   - (*vercel.json* configure déjà les rewrites SPA et les en-têtes de sécurité)
4. **Ne cliquez pas encore sur Deploy** : d'abord les variables d'environnement.

---

## Étape 5 — Variables d'environnement (l'étape qui ne doit pas être oubliée)

Dans le projet Vercel : **Settings → Environment Variables**, ajoutez :

| Name | Value | Environments |
| --- | --- | --- |
| `DATABASE_URL` | l'URL `chantierpilot_app` de l'étape 3 | Production, Preview, Development |
| `APP_DB_PASSWORD` | le mot de passe de l'étape 2 *(optionnel, utile pour migrer depuis la CI)* | Production |
| `DATABASE_URL_ADMIN` | *(optionnel — seulement si vous lancez les migrations depuis Vercel)* | — **jamais en Production si vous ne l'utilisez pas** |

Puis **Save**.

> 🔐 Rappel : `DATABASE_URL_ADMIN` est une clé d'administration. Idéalement, elle
> ne vit que sur votre machine de migration. Le navigateur de vos utilisateurs ne
> reçoit **aucune** de ces clés : les requêtes passent par les fonctions serverless.

---

## Étape 6 — Premier déploiement

1. Cliquez sur **Deploy** (ou `vercel --prod` depuis la CLI).
2. Vercel installe les dépendances, build `dist/`, publie les fonctions `api/*`.
3. Environ 1 minute plus tard, l'URL `https://chantierpilot-xxxx.vercel.app` est en ligne.

---

## Étape 7 — Vérifications « produit fini » (10 minutes)

Ouvrez l'URL et validez chaque point :

| # | Vérification | Attendu |
| --- | --- | --- |
| 1 | `https://votre-app.vercel.app/api/health` | `{"status":"ok","database":"ok","driver":"neon"}` |
| 2 | Créer le compte de **l'entreprise A** (inscription) | Accès au tableau de bord |
| 3 | Créer un chantier + une dépense + un encaissement | Tout s'affiche, montants en FCFA |
| 4 | Télécharger le **rapport PDF** du chantier | PDF avec le nom et les coordonnées de l'entreprise A |
| 5 | Exporter un **CSV** (Paramètres) | Fichier s'ouvre dans Excel avec les bonnes colonnes |
| 6 | Se déconnecter, créer le compte de **l'entreprise B** avec un autre e-mail | B ne voit **aucun** chantier de A |
| 7 | Noter l'URL d'un chantier de A, la coller en étant connecté sur B | Message « Chantier introuvable » |
| 8 | Test sur téléphone (ou redimensionner le navigateur) | Menu mobile, tableaux lisibles |
| 9 | Essayez 10 mauvais mots de passe | Compte temporairement verrouillé (anti-force brute) |
| 10 | `npm run test:all` en local (si évolution du code) | 55 + 22 tests verts |

Les points 6 et 7 sont **le test d'isolation entre entreprises** : ne passez pas
en production sans les avoir faits.

---

## Étape 8 — Domaine personnalisé (optionnel mais recommandé)

1. Vercel → **Settings → Domains** → ajoutez `app.votre-entreprise.ci` (ou `.com`).
2. Chez votre registrar (ou votre hébergeur de domaine), créez le **CNAME**
   indiqué par Vercel (`cname.vercel-dns.com`) ou l'enregistrement **A** proposé.
3. Attendez la propagation DNS (quelques minutes à quelques heures).
4. HTTPS est automatique (certificat Let's Encrypt) et **HSTS est déjà activé**
   par `vercel.json`.

---

## Étape 9 — Exploitation au quotidien

| Action | Comment |
| --- | --- |
| Mettre à jour l'application | `git push` sur `main` → déploiement automatique |
| Évoluer le schéma SQL | Modifier `db/schema.sql` / `db/rls.sql`, relancer `node db/migrate.mjs` avec `DATABASE_URL_ADMIN` |
| Sauvegarder les données | `pg_dump` quotidien + PITR Neon (voir docs/SAUVEGARDES.md) |
| Surveiller | Vercel → Observability (logs des fonctions `api/*`) ; alertez sur les pics de 401/429 |
| Ajouter un utilisateur à une entreprise | Pour l'instant : création de compte + rattachement (V1 = 1 entreprise = 1 compte admin) |
| Importer les données d'un client | Voir docs/SAUVEGARDES.md §4 — **après** avoir validé les tests ci-dessus |

---

## Étape 10 — Checklist finale avant de remettre à un client

- [ ] `npm run test:all` vert (RLS + intégration)
- [ ] Les 10 vérifications de l'étape 7 faites sur l'URL de production
- [ ] Sauvegarde `pg_dump` de la base configurée (plan récurrent)
- [ ] Identifiants du client créés, mot de passe transmis par canal sûr
- [ ] Coordonnées de l'entreprise renseignées dans **Paramètres** (elles apparaissent sur le PDF)
- [ ] Domaine personnalisé + HTTPS actifs
- [ ] Aucune clé `DATABASE_URL_ADMIN` dans les variables inutiles de Vercel

---

## Dépannage rapide

| Symptôme | Cause → solution |
| --- | --- |
| `503` avec le message « SÉCURITÉ — connexion refusée » | `DATABASE_URL` pointe vers le propriétaire → utilisez l'URL `chantierpilot_app` |
| `503` « DATABASE_URL est absente » | Variable non définie sur **tous** les environnements (Production + Preview) |
| Page blanche après déploiement | `vercel.json` manquant ou build non terminé → vérifiez les logs du build |
| `403 « origine_refusee » » | Domaine personnalisé ajouté : ajoutez-le dans `ALLOWED_ORIGINS` si besoin (rare) |
| PDF vide ou erreur 500 | Vérifiez les logs de la fonction `api/projects/[id]/report` dans Vercel |
| Les données d'un client n'apparaissent pas | Vérifiez qu'il est bien connecté à SA fiche entreprise (un compte = une entreprise) |
