# Déploiement sur Vercel + Neon (référence technique)

Procédure détaillée, écran par écran : [VERCEL_PAS_A_PAS.md](VERCEL_PAS_A_PAS.md).
Plan d'ensemble (préproduction, sécurité, juridique, budget) : [PLAN_MISE_EN_PRODUCTION.md](PLAN_MISE_EN_PRODUCTION.md).

## Architecture déployée

| Élément | Détail |
| --- | --- |
| Interface | Build Vite statique (`dist/`), servie par le CDN Vercel |
| API | **Une seule** fonction serverless : `api/index.js` → routeur `api/_lib/router.js` → gestionnaires `api/_routes/**` (dossier préfixé `_`, jamais déployé comme fonction). Compatible avec la limite de 12 fonctions du plan Hobby ; un test unitaire bloque tout dépassement |
| Réécritures | `/api/:route*` → `/api?__route=:route*` ; tout le reste → `/index.html` (SPA) |
| Région | `fra1` (Francfort), à aligner avec Neon `aws-eu-central-1` |
| Base | Neon PostgreSQL, RLS activé **et forcé** sur toutes les tables |

## Base Neon

```bash
# Saisie masquée — voir VERCEL_PAS_A_PAS.md, étape 4
read -rs DATABASE_URL_ADMIN; export DATABASE_URL_ADMIN   # URL du propriétaire (neondb_owner), connexion directe
read -rs APP_DB_PASSWORD;   export APP_DB_PASSWORD      # mot de passe du rôle limité
node db/migrate.mjs
unset DATABASE_URL_ADMIN APP_DB_PASSWORD
```

La migration :
- crée les tables, contraintes, politiques RLS et les rôles `chantierpilot_app` (connexion de l'API) et `chantierpilot_definer` (fonctions d'authentification) ;
- vérifie que le RLS est forcé partout ;
- n'affiche jamais de mot de passe. Elle affiche la cible (hôte, rôle) et un modèle d'URL applicative.

Elle est testée en CI avec un propriétaire **non superuser** (`npm run test:migration`), comme sur Neon.

## Variables Vercel

| Variable | Production | Preview |
| --- | --- | --- |
| `DATABASE_URL` | URL `chantierpilot_app` de la base de production (Sensitive) | URL `chantierpilot_app` de la branche `preprod` (Sensitive) |
| `ALLOWED_ORIGINS` | optionnel (intégrations tierces uniquement) | optionnel |

Aucune URL administrateur dans Vercel. L'intégration marketplace Neon n'est pas utilisée,
car elle injecterait le rôle propriétaire.

## Vérifications post-déploiement

- `GET /api/health` → `{"status":"ok","database":"ok","driver":"neon",…}`
- Parcours complet et test de cloisonnement en préproduction : [VERCEL_PAS_A_PAS.md](VERCEL_PAS_A_PAS.md), étape 8.
- `npm run test:all` reste la référence du comportement (RLS, migration, unitaires, intégration).

## Sécurité envoyée par Vercel et par l'API

- `vercel.json` (toutes les réponses) : CSP stricte, `X-Frame-Options: DENY`, HSTS 2 ans, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- API, en plus : `Cross-Origin-Opener-Policy` et `Cross-Origin-Resource-Policy` (`same-origin`), `Cache-Control: no-store`.
- Cookie de session `__Host-cp_session` (`Secure`, `HttpOnly`, `SameSite=Lax`) sur les déploiements Vercel, en production comme en prévisualisation.

## Mises à jour

- **Code** : Pull Request → CI verte → vérification sur la prévisualisation → fusion dans `main` → production.
- **Schéma** : la migration actuelle n'est pas purement additive. La faire revoir, sauvegarder et tester une restauration, puis valider sur `preprod` avant toute opération séparée sur production, réalisée par l'utilisateur après autorisation explicite. Voir [CORRECTIONS_POST_AUDIT.md](CORRECTIONS_POST_AUDIT.md).
- **Mot de passe applicatif** : la migration peut le modifier si `APP_DB_PASSWORD` est défini. Tout changement d'accès nécessite une décision et une procédure séparées ; ne jamais afficher les valeurs.

## Limites connues (volontaires)

- Pas de module lotissement, comptabilité complète ou paiement automatique.
- Justificatifs stockés en base (2 Mo max, JPEG/PNG/PDF). Pour de gros volumes, il faudra migrer vers un stockage objet en gardant une référence en base.
- La limitation de débit en mémoire est propre à chaque instance ; le verrouillage de compte, lui, est persistant en base.
