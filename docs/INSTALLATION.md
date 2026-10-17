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

1. Créez un projet Neon, notez l'URL de connexion (format `postgresql://…neon.tech/…?sslmode=require`).
2. Créez le fichier `.env` (voir `.env.example`) :

```env
DATABASE_URL_ADMIN=postgresql://<propriétaire>:<motdepasse>@<ep>.neon.tech/neondb?sslmode=require
APP_DB_PASSWORD=<mot_de_passe_solide_pour_le_rôle_app>
```

3. Appliquez le schéma, les politiques RLS et créez le rôle applicatif :

```bash
node db/migrate.mjs
```

La migration est **idempotente** (relançable sans risque) et vérifie que le RLS est bien activé **et forcé** sur toutes les tables. Elle affiche l'URL à utiliser pour l'API :

```env
DATABASE_URL=postgresql://chantierpilot_app:<APP_DB_PASSWORD>@<ep>.neon.tech/neondb?sslmode=require
API_PORT=8787
```

4. Lancez l'application :

```bash
npm run dev
```

> **Jamais** mettez l'URL du propriétaire/superuser dans `DATABASE_URL` : l'API refuse
> catégoriquement un rôle qui pourrait contourner le cloisonnement des entreprises
> (voir docs/SECURITE.md).

## 3. Tests

```bash
npm run db:test-rls   # 22 tests d'isolation RLS (deux entreprises fictives)
npm run test          # 55 tests d'intégration API (CRUD, calculs, permissions, exports, PDF…)
npm run test:all      # les deux
```

Les tests démarrent leur propre PostgreSQL isolé — ils ne touchent à aucune donnée existante.

## 4. Scripts disponibles

| Script | Rôle |
| --- | --- |
| `npm run dev` | PostgreSQL local (si besoin) + migration + API + interface |
| `npm run build` | Build de production (dans `dist/`) |
| `npm run migrate` | Applique `db/schema.sql` + `db/rls.sql` sur `DATABASE_URL(_ADMIN)` |
| `npm run db:test-rls` | Vérifie l'isolation multi-entreprise au niveau SQL |
| `npm run test` | Tests d'intégration de bout en bout |

## 5. Structure des variables d'environnement

| Variable | Usage | En production |
| --- | --- | --- |
| `DATABASE_URL` | Connexion de l'API — rôle **limité** `chantierpilot_app` | Obligatoire |
| `DATABASE_URL_ADMIN` | Migrations uniquement (propriétaire) | Uniquement au déploiement/migration |
| `APP_DB_PASSWORD` | Mot de passe du rôle applicatif (migration) | Migration uniquement |
| `ALLOWED_ORIGINS` | Origines CSRF supplémentaires (CSV) | Optionnel |
| `DB_DRIVER` | `neon` ou `pg` (auto-détection sinon) | Optionnel |

## 6. Dépannage

| Symptôme | Cause / solution |
| --- | --- |
| `DATABASE_URL est absente` | Créez `.env` (mode B) ou laissez `npm run dev` démarrer le PostgreSQL local (mode A) |
| `SÉCURITÉ — connexion refusée : … superuser ou BYPASSRLS` | `DATABASE_URL` utilise le propriétaire de la base. Utilisez le rôle `chantierpilot_app` créé par la migration |
| `relation … does not exist` | Lancez `npm run migrate` |
| Port déjà utilisé (55432, 8787, 5173) | Une ancienne session tourne encore : arrêtez-la ou changez `PG_PORT` / `API_PORT` |
| `initdb: error: invalid locale name` | Utilisez `server/embedded-pg.mjs` (il force `C.UTF8`) — ne passez pas par la librairie `embedded-postgres` directement |
