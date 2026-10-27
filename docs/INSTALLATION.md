# Installation (développement & Neon)

## 1. Prérequis

- Node.js ≥ 20
- npm ≥ 10
- Un compte [Neon](https://neon.tech) pour la production (optionnel en local : PostgreSQL embarqué fourni)

## 2. Installation locale

```bash
git clone <votre-dépôt>
cd ChantierPilot
npm install
```

### Mode A — sans base externe (le plus simple)

```bash
npm run dev
```

Un PostgreSQL local (binaires officiels, port 55432) démarre dans `.pgdata/`, le schéma et les politiques RLS sont appliqués automatiquement, puis :

- interface : http://localhost:5173
- API : http://localhost:8787 (proxifiée par Vite via `/api`)

L'API tourne avec le rôle **limité** `chantierpilot_app` (le RLS est donc réellement appliqué, comme en production).

### Mode B — avec une base Neon (recommandé pour coller à la production)

> Utilisez une **branche Neon de développement** (ex. `dev`), jamais la production.
> Le fichier `.env` est ignoré par Git ; il ne doit jamais être partagé.

1. Créez une branche Neon `dev` et copiez son URL **propriétaire** en connexion directe (Neon → Connect, pooling désactivé).
2. Créez le fichier `.env` (voir `.env.example`) :

```env
DATABASE_URL_ADMIN=postgresql://<propriétaire>:<motdepasse>@<ep>.neon.tech/neondb?sslmode=require
APP_DB_PASSWORD=<mot_de_passe_solide_pour_le_rôle_app>
```

3. Lancez l'application :

```bash
npm run dev
```

`npm run dev` peut appliquer la migration avec `DATABASE_URL_ADMIN`, puis démarrer l'API avec le rôle limité `chantierpilot_app`. **Ne le lancez jamais avec une cible réelle ou de production sans revue préalable :** la migration actuelle n'est pas strictement additive et peut modifier le rôle applicatif si `APP_DB_PASSWORD` est défini. Vérifiez la cible par un moyen indépendant ; les journaux ne l'identifient pas. Voir [CORRECTIONS_POST_AUDIT.md](CORRECTIONS_POST_AUDIT.md) et [SAUVEGARDES.md](SAUVEGARDES.md).

> **Jamais** mettez l'URL du propriétaire/superuser dans `DATABASE_URL` : l'API refuse
> catégoriquement un rôle qui pourrait contourner le cloisonnement des entreprises
> (voir docs/SECURITE.md).

## 3. Tests

```bash
npm run db:test-rls     # 22 tests d'isolation RLS (deux entreprises fictives)
npm run test:migration  # migration avec un propriétaire non superuser (comme Neon)
npm run test:unit       # montants, pagination, PDF, routeur API, limite de fonctions Vercel
npm run test            # 59 tests d'intégration API (CRUD, calculs, permissions, exports, PDF…)
npm run test:all        # tout (obligatoire avant toute livraison)
```

Les tests démarrent leur propre PostgreSQL isolé et imposent explicitement leur cible : ils ne touchent jamais la base indiquée dans `.env`.

## 4. Scripts disponibles

| Script | Rôle |
| --- | --- |
| `npm run dev` | PostgreSQL local (si besoin) + migration + API + interface |
| `npm run build` | Build de production (dans `dist/`) |
| `npm run migrate` | Applique `db/schema.sql` + `db/rls.sql` sur `DATABASE_URL_ADMIN` (à défaut `DATABASE_URL`) |
| `npm run db:test-rls` | Vérifie l'isolation multi-entreprise au niveau SQL |
| `npm run test` | Tests d'intégration de bout en bout |

## 5. Structure des variables d'environnement

| Variable | Usage | En production |
| --- | --- | --- |
| `DATABASE_URL` | Connexion de l'API — rôle **limité** `chantierpilot_app` | **Seule** variable de base dans Vercel |
| `DATABASE_URL_ADMIN` | Migrations uniquement (propriétaire) | Jamais dans Vercel — terminal de migration uniquement |
| `APP_DB_PASSWORD` | Mot de passe du rôle applicatif (migration) | Jamais dans Vercel — terminal de migration uniquement |
| `ALLOWED_ORIGINS` | Origines CSRF supplémentaires (CSV) | Optionnel |
| `DB_DRIVER` | `neon` ou `pg` (auto-détection sinon) | Optionnel |

## 6. Dépannage

| Symptôme | Cause / solution |
| --- | --- |
| `DATABASE_URL_ADMIN est absente` (migration) | Exportez l'URL propriétaire dans le terminal ou renseignez `.env` (mode B) |
| `permission denied for schema public` (migration) | Code antérieur à la V1.2 : mettez à jour le dépôt (`db/rls.sql` corrigé pour les propriétaires non superuser) |
| `SÉCURITÉ — connexion refusée : … superuser ou BYPASSRLS` | `DATABASE_URL` utilise le propriétaire de la base. Utilisez le rôle `chantierpilot_app` créé par la migration |
| `relation … does not exist` | Lancez `npm run migrate` |
| Port déjà utilisé (55432, 8787, 5173) | Une ancienne session tourne encore : arrêtez-la ou changez `PG_PORT` / `API_PORT` |
| `initdb: error: invalid locale name` | Utilisez `server/embedded-pg.mjs` (il force `C.UTF8`) — ne passez pas par la librairie `embedded-postgres` directement |
