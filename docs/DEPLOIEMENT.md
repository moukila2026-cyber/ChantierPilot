# Déploiement sur Vercel + Neon

## Étape 1 — Base Neon

1. Créez un projet sur [neon.tech](https://neon.tech) (région la plus proche, ex. `us-east-1` ou `eu-central-1`).
2. Récupérez l'URL de connexion du **propriétaire** (`DATABASE_URL_ADMIN`).
3. Créez un mot de passe solide pour le rôle applicatif (`APP_DB_PASSWORD`).
4. Localement (ou dans une CI), appliquez la migration :

```bash
DATABASE_URL_ADMIN="postgresql://…neon.tech/neondb?sslmode=require" \
APP_DB_PASSWORD="…" \
node db/migrate.mjs
```

La migration crée : les tables, les contraintes, les politiques RLS (activées **et forcées**), les rôles `chantierpilot_app` (connexion applicative) et `chantierpilot_definer` (fonctions d'authentification), et vérifie que rien n'échappe au RLS.

Notez l'URL applicative affichée en fin de migration :
`postgresql://chantierpilot_app:<APP_DB_PASSWORD>@…neon.tech/neondb?sslmode=require`

## Étape 2 — Projet Vercel

1. Poussez ce dépôt sur GitHub, puis « Import Project » sur [vercel.com](https://vercel.com).
2. Framework détecté : **Vite** — aucune configuration de build à changer (`vercel.json` est fourni : rewrite SPA + en-têtes de sécurité).
3. Dans *Settings → Environment Variables*, définissez :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | URL du rôle **limité** `chantierpilot_app` (avec `sslmode=require`) |
| `DATABASE_URL_ADMIN` | *(optionnel, oubliez-la si vous migrez depuis votre machine)* |
| `APP_DB_PASSWORD` | *(idem)* |

4. Déployez (`vercel --prod` ou le bouton Deploy).

Vérifications post-déploiement :

- `https://votre-app.vercel.app/api/health` → `{"status":"ok","database":"ok","driver":"neon"}`
- Créez deux comptes de test (deux entreprises) et confirmez que chacun ne voit que ses chantiers.
- `npm run db:test-rls` localement reste la référence du comportement RLS.

## Étape 3 — Domaine & HTTPS

- Ajoutez votre domaine dans Vercel (ex. `app.votre-entreprise.ci`) — HTTPS est automatique (HSTS est déjà envoyé par `vercel.json`).
- Si vous ajoutez des origines spécifiques (intégrations), listez-les dans `ALLOWED_ORIGINS` (séparées par des virgules).

## Ce qui est déjà configuré dans vercel.json

- Rewrite SPA (`/index.html` sauf `/api/*`)
- En-têtes de sécurité : CSP stricte, `X-Frame-Options: DENY`, HSTS 2 ans, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-*`

## Mises à jour

- **Code** : push sur la branche principale → déploiement automatique.
- **Schéma** : relancez `node db/migrate.mjs` avec `DATABASE_URL_ADMIN` (idempotent).
- **Mot de passe de la base** : `ALTER ROLE chantierpilot_app WITH PASSWORD '…'` puis mettez à jour `DATABASE_URL` sur Vercel.

## Limites connues (volontaires)

- Pas de module lotissement, comptabilité complète ou paiement automatique dans la V1.
- Les pièces jointes (justificatifs) sont stockées en base (2 Mo max) : comptez ~2,7 Mo en base64 dans les exports JSON ; pour de gros volumes, migrez vers un stockage objet et gardez l'URL en base.
- La limitation de débit en mémoire est par instance serverless ; le verrouillage de compte, lui, est persistant en base (couvre le multi-instances).
