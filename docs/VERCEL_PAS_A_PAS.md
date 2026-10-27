# Vercel + Neon pas à pas — de zéro à l'application en ligne

Ce guide mène **d'aucun compte jusqu'à l'application en production**, avec une
**préproduction** séparée. Comptez 1 h 30 la première fois.

> Vue d'ensemble, budget, sécurité et obligations légales :
> [PLAN_MISE_EN_PRODUCTION.md](PLAN_MISE_EN_PRODUCTION.md). Ce guide-ci est la partie technique.

## Règles de sécurité (valables à chaque étape)

- Un mot de passe, une URL de base de données ou un jeton ne se colle **que** dans :
  la console Neon, la console Vercel, votre gestionnaire de mots de passe, ou votre
  terminal au moment de la migration. **Jamais** dans un chat, un e-mail, WhatsApp,
  un ticket, un document partagé ou Git.
- Deux URL, deux usages :
  - **URL administrateur** (rôle `neondb_owner`) → **uniquement** pour lancer la migration
    depuis votre poste. Elle ne va **pas** dans Vercel.
  - **URL applicative** (rôle limité `chantierpilot_app`) → **seule** valeur de `DATABASE_URL` dans Vercel.
    L'API refuse de démarrer avec un rôle superuser ou BYPASSRLS.
- **N'installez pas** l'intégration automatique « Neon » depuis la marketplace Vercel :
  elle crée une `DATABASE_URL` avec le rôle propriétaire. On relie Neon à Vercel **à la main**.

---

## Étape 0 — Comptes et outils

| Élément | Rôle | Offre |
| --- | --- | --- |
| **GitHub** | Code (`moukila2026-cyber/ChantierPilot`) | existant |
| **Neon** (https://console.neon.tech) | Base PostgreSQL | Free pour la préproduction ; **Launch** (payant à l'usage) avant les vrais clients pour 7 jours de restauration |
| **Vercel** (https://vercel.com) | Hébergement | **Pro** pour un usage commercial (Hobby = usage personnel non commercial selon les conditions Vercel) |
| **Node.js 22** sur votre poste | Lancer la migration | https://nodejs.org |
| **Gestionnaire de mots de passe** (Bitwarden, 1Password, KeePassXC…) | Générer et garder les secrets | gratuit possible |

---

## Étape 1 — Le code

- La branche `main` est celle que Vercel déploie en production.
- On ne pousse **jamais** directement sur `main` : chaque évolution passe par une
  Pull Request, avec CI verte (`npm ci`, `npm run build`, `npm run test:all`), puis fusion.
- Chaque Pull Request reçoit automatiquement une **URL de prévisualisation** Vercel,
  branchée sur la base de **préproduction** (étape 6).

---

## Étape 2 — Créer la base Neon (production + préproduction)

1. https://console.neon.tech → **New project**.
   - *Project name* : `chantierpilot`
   - *Postgres version* : celle proposée par défaut (17 au moment de l'écriture)
   - *Cloud provider / Region* : **AWS — Europe Central 1 (Frankfurt)**.
     C'est la région la plus proche de la Côte d'Ivoire ; `vercel.json` place les
     fonctions Vercel au même endroit (`fra1`).
2. Le projet contient une branche principale (nommée `production` ou `main`) : c'est la **production**.
3. **Branches → Create branch** → nom `preprod`, à partir de la branche principale.
   C'est la **préproduction** (base séparée, mêmes réglages).

---

## Étape 3 — Préparer deux mots de passe applicatifs

Dans votre gestionnaire de mots de passe, générez **deux** mots de passe différents :

| Nom dans le gestionnaire | Usage |
| --- | --- |
| `ChantierPilot — chantierpilot_app — PREPROD` | rôle limité, base `preprod` |
| `ChantierPilot — chantierpilot_app — PROD` | rôle limité, base production |

Règles : **24 caractères ou plus**, uniquement **lettres, chiffres, `-` et `_`**.
Pas de `@`, `#`, `/`, `:`, `?` ni espace : ils casseraient l'URL de connexion.

---

## Étape 4 — Préparer les migrations (bloquées en attente de revue)

**Ne pas lancer de migration en production à ce stade.** Le commit d'audit attendu et le préflight strict sont absents. Le schéma actuel ajoute des éléments mais modifie aussi certains essais existants, change temporairement le RLS forcé et recrée des déclencheurs et politiques. Sa sûreté sur vos données et son atomicité n'ont pas été vérifiées. Voir [CORRECTIONS_POST_AUDIT.md](CORRECTIONS_POST_AUDIT.md).

1. Récupérez les corrections manquantes et faites revoir la migration et le plan de retour arrière.
2. Vérifiez que Preview, préproduction et production ciblent des bases distinctes, sans partager leurs identifiants. Configurez les accès par un canal privé ; ne publiez aucune chaîne de connexion ou valeur de variable.
3. Préparez une sauvegarde Neon et testez sa restauration sur une cible isolée : voir [SAUVEGARDES.md](SAUVEGARDES.md).
4. Après accord, l'utilisateur pourra tester la migration sur la préproduction **uniquement après avoir vérifié la cible par un moyen indépendant** :

   ```bash
   node db/migrate.mjs
   ```

   Le journal masque la cible : la ligne `Cible : base de migration configurée` ne permet pas de confirmer l'hôte ou le rôle. Le script peut modifier le mot de passe du rôle applicatif si `APP_DB_PASSWORD` est défini ; vérifiez ce point sans afficher sa valeur.
5. Après validation des résultats en préproduction, une migration de production reste une opération séparée, par l'utilisateur et après autorisation explicite. Gardez les accès applicatifs et administratifs dans leurs environnements respectifs, jamais dans le navigateur ou dans les journaux.

---

## Étape 5 — Créer le projet Vercel

1. https://vercel.com/new → **Import Git Repository** → GitHub.
   Si Vercel demande d'installer son application GitHub, choisissez
   **Only select repositories** → `ChantierPilot` (accès minimal).
2. Réglages détectés (ne rien changer) : *Framework* **Vite**, *Root Directory* `./`,
   *Build Command* `npm run build`, *Output Directory* `dist`.
3. **Ne cliquez pas encore sur Deploy** : ouvrez *Environment Variables* (étape 6).

---

## Étape 6 — Variables d'environnement (le point critique)

| Name | Value | Environnement | Option |
| --- | --- | --- | --- |
| `DATABASE_URL` | `DATABASE_URL — PROD` (rôle `chantierpilot_app`) | **Production** uniquement | **Sensitive** |
| `DATABASE_URL` | `DATABASE_URL — PREPROD` (rôle `chantierpilot_app`) | **Preview** uniquement | **Sensitive** |

**Rien d'autre.** Pas de `DATABASE_URL_ADMIN`, pas de `APP_DB_PASSWORD` dans Vercel :
les migrations se lancent depuis votre poste (étape 4).

Si le projet a déjà été créé, passez par **Settings → Environment Variables** pour ajouter ces variables,
puis redéployez.

Réglages complémentaires :
- **Settings → Build and Deployment → Node.js Version** : `22.x`.
- **Settings → Deployment Protection** : laissez **Vercel Authentication** actif pour les
  prévisualisations. La préproduction n'est alors visible que par les membres du projet.

---

## Étape 7 — Déployer

1. Cliquez sur **Deploy**. Vercel installe, construit `dist/` et publie **une seule
   fonction** `api/index.js` qui sert toutes les URL `/api/...` (compatible avec
   la limite de 12 fonctions du plan Hobby).
2. Une Pull Request ouverte produit une **prévisualisation** (base `preprod`).
   La fusion dans `main` déclenche la **production**.

---

## Étape 8 — Vérifications

### En préproduction (URL de prévisualisation d'une Pull Request) — parcours complet, données fictives

| # | Vérification | Attendu |
| --- | --- | --- |
| 1 | `…/api/health` | `{"status":"ok","database":"ok","driver":"neon",…}` |
| 2 | Inscription de **l'entreprise A** (données fictives) | Accès au tableau de bord |
| 3 | Chantier + dépense + encaissement **sans** justificatif | L'encaissement est affiché « Déclaré », **pas** « Prouvé » |
| 4 | Joindre un justificatif (PDF/JPG/PNG, 2 Mo max) à l'encaissement | Il passe à « Prouvé » ; le fichier se rouvre |
| 5 | Rapport **PDF** du chantier | Coordonnées de A, montants en FCFA entiers et en lettres |
| 6 | Exports **CSV** et **JSON** (Paramètres) | S'ouvrent dans Excel ; seulement les données de A |
| 7 | Déconnexion → inscription de **l'entreprise B** | B ne voit **aucune** donnée de A |
| 8 | Coller l'URL d'un chantier de A en étant connecté sur B | « Chantier introuvable » |
| 9 | Pied de page sur chaque page | « SHOPIN30 » et `+225 05 01 30 33 43` cliquable |
| 10 | Téléphone (ou fenêtre étroite) | Menu mobile, tableaux lisibles |
| 11 | 10 mauvais mots de passe | Verrouillage temporaire |
| 12 | Outils du navigateur → cookie de session | `__Host-cp_session`, `Secure`, `HttpOnly` |

Les points 7 et 8 sont **le test de cloisonnement entre entreprises** : pas de
production sans eux.

### En production (après fusion)

1. `https://<projet>.vercel.app/api/health` → `"database":"ok"`, `"driver":"neon"`.
2. Page d'accueil, connexion, CGU et pied de page s'affichent.
3. Le premier compte réel est créé **après** les étapes juridiques du plan.

---

## Étape 9 — Domaine personnalisé (recommandé)

1. Vercel → **Settings → Domains** → ajoutez par exemple `app.votre-domaine.ci`.
2. Chez le gestionnaire du domaine, créez l'enregistrement **exactement** indiqué par
   Vercel (CNAME pour un sous-domaine, A pour le domaine nu).
3. Attendez la propagation, puis vérifiez le cadenas HTTPS. HSTS est déjà envoyé.
4. Le contrôle anti-CSRF compare l'origine à l'hôte appelé : rien à configurer pour
   un domaine servi par Vercel. `ALLOWED_ORIGINS` ne sert qu'aux intégrations tierces.

---

## Étape 10 — Exploitation

| Action | Comment |
| --- | --- |
| Mettre à jour l'application | Pull Request → CI verte → test sur la prévisualisation → fusion |
| Faire évoluer le schéma SQL | Migration (étape 4) sur `preprod`, vérification, **puis** production, **avant** de fusionner le code qui en dépend |
| Sauvegarder | Voir [SAUVEGARDES.md](SAUVEGARDES.md) |
| Surveiller | Vercel → Logs / Observability ; alerte sur les pics de 401, 429 et 5xx |
| Changer un mot de passe de base | Relancer la migration avec le nouvel `APP_DB_PASSWORD`, puis mettre à jour `DATABASE_URL` dans Vercel et redéployer |

---

## Dépannage

| Symptôme | Cause → solution |
| --- | --- |
| `503` « SÉCURITÉ — connexion refusée » | `DATABASE_URL` utilise le propriétaire → mettez l'URL `chantierpilot_app` |
| `503` « DATABASE_URL est absente » | Variable manquante pour cet environnement (Production **ou** Preview) → ajoutez-la puis redéployez |
| `/api/health` → `"database":"indisponible"` | Mot de passe ou hôte erroné dans l'URL, ou caractère spécial non encodé |
| Migration : « DATABASE_URL_ADMIN est absente » | Variable non exportée dans **ce** terminal |
| Migration : « doit utiliser l'URL du PROPRIÉTAIRE » | Vous avez fourni l'URL `chantierpilot_app` → prenez l'URL `neondb_owner` |
| Migration : « password authentication failed » | URL administrateur incomplète ou mot de passe du propriétaire réinitialisé dans Neon |
| Échec « No more than 12 Serverless Functions » | Un fichier a été ajouté hors de `api/_routes/` → le test unitaire le signale |
| Page blanche | Build non terminé ou `vercel.json` modifié → logs du build |
| `403 origine_refusee` | Appel depuis un autre domaine → ajoutez-le à `ALLOWED_ORIGINS` si c'est légitime |
| PDF en erreur | Logs de la fonction `api/index.js` dans Vercel (chemin `/api/projects/<id>/report`) |
