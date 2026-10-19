# Sécurité — modèle complet ChantierPilot

Objectif : **aucune donnée ne peut fuiter entre entreprises, et aucune faille applicative ne peut y conduire**, parce que l'isolation est imposée par la base de données elle-même.

## 1. Cloisonnement multi-entreprise (RLS)

Toutes les tables métier (`companies`, `app_users`, `sessions`, `projects`, `expenses`, `payments`, `audit_log`) ont :

```sql
ALTER TABLE … ENABLE ROW LEVEL SECURITY;
ALTER TABLE … FORCE ROW LEVEL SECURITY;   -- s'applique AUSSI au propriétaire
```

Chaque requête métier s'exécute dans une transaction qui pose le contexte :

```sql
BEGIN;
SELECT set_config('app.company_id', '<uuid>', true);  -- SET LOCAL
SELECT set_config('app.user_id',    '<uuid>', true);
SELECT set_config('app.role',       'admin',  true);
… requêtes …
COMMIT;
```

Les politiques comparent `company_id` à `app_current_company_id()`. **Sans contexte, la fonction renvoie NULL → toutes les politiques refusent (déni par défaut).** Le `true` de `set_config` rend le contexte local à la transaction : aucune fuite possible d'une connexion poolée à l'autre.

Vérifié par `db/test-rls.mjs` (22 tests, deux entreprises fictives) :
lecture croisée, modification, suppression, insertion dans le chantier d'autrui,
création « au nom de » l'autre entreprise, lecture sans contexte, immuabilité du
journal d'audit, FORCE RLS sur le propriétaire non-superuser, interdiction de
`SET ROLE` vers le rôle défineur.

## 2. Rôles PostgreSQL

| Rôle | Usage | Droits |
| --- | --- | --- |
| propriétaire (Neon `neondb_owner`…) | migrations uniquement (`DATABASE_URL_ADMIN`) | DDL |
| `chantierpilot_app` | **connexion de l'API** (`DATABASE_URL`) | DML limité, `NOBYPASSRLS`, `NOLOGIN`→`LOGIN` par la migration |
| `chantierpilot_definer` | propriétaire des fonctions d'authentification `SECURITY DEFINER` | SELECT/UPDATE sur `app_users`, `sessions` uniquement |

**Garde de sécurité active** : à son démarrage, l'API interroge `pg_roles` et
**refuse de fonctionner** si le rôle de connexion est superuser ou `BYPASSRLS`
(`assertSafeDatabaseRole`). Un oubli de configuration ne peut donc pas exposer
les données.

Les fonctions `SECURITY DEFINER` (`api_lookup_user`, `api_lookup_session`,
`api_fail_login`, `api_succeed_login`, `api_cleanup_sessions`) :
- ne touchent qu'à `app_users` / `sessions` (jamais les tables métier) ;
- ont un `search_path` verrouillé (`SET search_path = pg_catalog, public`) ;
- ne sont exécutables que par `chantierpilot_app` (REVOKEd FROM PUBLIC) ;
- ne contournent le RLS que via `app_is_definer()` (vrai uniquement pour ce rôle).

## 2 bis. Rôles applicatifs : administrateur et agent

| Action | Administrateur (`admin`) | Agent (`member`) |
| --- | --- | --- |
| Voir tableau de bord, chantiers, dépenses, encaissements de **son entreprise** | oui | oui |
| Saisir / modifier dépenses et encaissements, joindre des justificatifs | oui | oui |
| Créer / modifier / archiver un chantier | oui | **non (403)** |
| Supprimer une dépense ou un encaissement | oui | **non (403)** |
| Rapport PDF, exports CSV/JSON, journal d'activité | oui | **non (403)** |
| Modifier le profil de l'entreprise | oui | **non (403)** |
| Créer / désactiver / réactiver un compte, réinitialiser son mot de passe | oui | **non (403)** |
| Changer **son propre** mot de passe | oui | oui |

Contrôle **côté serveur** sur chaque route (`ensureAdmin` / `requireAdmin` dans
`api/_lib/pipeline.js`) : masquer un bouton dans l'interface ne suffirait pas.
La gestion des comptes passe uniquement par `/api/team` (jamais de création
manuelle en base) : création réservée à l'administrateur, mot de passe haché
(scrypt), journalisation dans `audit_log`. La désactivation d'un compte coupe
immédiatement ses sessions (`api_lookup_session` exige `is_active`) ; la
réinitialisation du mot de passe révoque en plus ses sessions via la fonction
`api_admin_revoke_sessions` (SECURITY DEFINER, limitée à la même entreprise et
au rôle admin). Aucune suppression définitive de compte : désactivation seule,
pour conserver la traçabilité. Le cloisonnement RLS par entreprise s'applique
de la même façon aux agents : un agent ne voit que les données de son entreprise,
et l'administrateur d'une autre entreprise ne peut ni voir ni modifier ses comptes (404).

## 3. Authentification & sessions

- **Mots de passe** : scrypt (N=16384, r=8, p=1, sel 128 bits par mot de passe), comparaison `timingSafeEqual`. Stockage `scrypt$N$r$p$sel$hash` — jamais en clair.
- **Politique de mot de passe** : ≥ 10 caractères, au moins une lettre et un chiffre (vérifiée serveur + message français).
- **Sessions** : jeton opaque 256 bits ; la base ne stocke que son **hash SHA-256**. Expiration 7 jours glissants, révocation à la déconnexion, purge des vieilles sessions.
- **Cookie** : `HttpOnly`, `SameSite=Lax`, `Secure` + préfixe `__Host-` en production (pas de vol par JavaScript, pas de fixation de domaine).
- **Anti-force brute** : limitation de débit par IP (mémoire) **et** verrouillage de compte persistant en base après 5/10 échecs (3 puis 15 minutes) — efficace même sur plusieurs instances serverless. Message unique côté connexion (pas d'énumération d'e-mails : « Adresse e-mail ou mot de passe incorrect. »).
- **Changement de mot de passe** : vérifie l'ancien, révoque toutes les autres sessions.

## 4. Transport, CSRF, en-têtes

- HTTPS obligatoire en production (HSTS 2 ans, `includeSubDomains`).
- **CSRF** : contrôle d'origine (`Origin` doit correspondre à `Host` ou `ALLOWED_ORIGINS`) sur toute requête d'état, + cookies `SameSite=Lax`.
- **CSP** stricte : `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (caméra/micro/localisation/paiement désactivés).
- Réponses API en `Cache-Control: no-store`.

## 5. Validation des données

Double barrière — serveur (zod, messages français) **et** base (contraintes `CHECK`) :

- Montants : **entiers FCFA uniquement** (XOF sans décimale), `1 ≤ montant ≤ 999 999 999 999`, rejet des négatifs, des zéros (dépenses/encaissements) et des décimales.
- Dates : format `AAAA-MM-JJ`, bornées 2000–2100, `end_date ≥ start_date`.
- Textes : longueurs maximales partout (2000 caractères max), listes blanches pour statuts/catégories/modes de paiement.
- Fichiers : 2 Mo max, types JPEG/PNG/PDF, **contenu vérifié par magic bytes** (un `.jpg` qui est un script est refusé).
- Corps de requête limité à 3 Mo.

## 6. Calculs & honnêteté financière

- Tous les totaux (tableau de bord, fiche chantier, PDF) sont calculés **côté SQL**, jamais dans le navigateur.
- Un encaissement exige une **référence** (n° de reçu, réf. virement, transaction Mobile Money) : aucun paiement « sans preuve ». Le badge UI et le PDF distinguent **« déclaré »** (référence) et **« justificatif joint »** (prouvé).
- Le rapport PDF porte la mention explicite que les encaissements sont déclarés par l'entreprise et ne constituent pas une pièce comptable certifiée.

## 7. Traçabilité

- Table `audit_log` : chaque création / modification / suppression (chantiers, dépenses, encaissements, compte, profil entreprise).
- **Inaltérable** : aucune politique UPDATE/DELETE (vérifié par les tests RLS).
- Consultable dans l'app (Paramètres → Journal d'activité).

## 8. Secrets

- Aucun secret dans le dépôt (`.env` ignoré par Git) — voir `.env.example` commenté.
- Le navigateur ne reçoit **jamais** la clé de base : il ne parle qu'aux fonctions serverless.
- `DATABASE_URL_ADMIN` (propriétaire) sert uniquement aux migrations ; l'application utilise le rôle limité.
- Pas de fuite de stack trace au client (erreurs 500 génériques, détails journalisés serveur).

## 9. Ce qui est hors périmètre (à mettre en place à l'exploitation)

- Rotation périodique du mot de passe de base (`APP_DB_PASSWORD` / `DATABASE_URL`).
- Surveillance (logs Vercel, alertes sur pics de 401/429).
- Sauvegardes planifiées — voir [SAUVEGARDES.md](SAUVEGARDES.md).
- Sous-domaines de préproduction avec des données fictives uniquement.

## 10. Vérification continue

```bash
npm run db:test-rls   # isolation multi-entreprise (22 assertions SQL)
npm run test          # parcours complet API (59 assertions, dont permissions croisées)
```

Ces deux suites doivent rester **vertes avant toute mise en production et avant
l'import des données d'un client réel**.
