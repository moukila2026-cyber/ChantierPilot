# ChantierPilot

**SaaS de gestion de chantiers pour les entreprises de BTP en Côte d'Ivoire.**
Budgets, dépenses, encaissements, rapports PDF — en FCFA, en français, utilisable sur téléphone comme sur ordinateur.

![Stack](https://img.shields.io/badge/React-Vite-blue) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8) ![PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-00E599) ![Vercel](https://img.shields.io/badge/déploiement-Vercel-black)

---

## Fonctionnalités (V1)

| Module | Détail |
| --- | --- |
| **Espaces isolés** | Chaque entreprise a son espace cloisonné — vérifié jusque dans la base de données (RLS) |
| **Chantiers** | Création, modification, archivage — nom, client, localisation, budget prévisionnel, dates, statut |
| **Dépenses** | Catégorie, montant, date, fournisseur, description, justificatif facultatif (JPEG/PNG/PDF, 2 Mo) |
| **Encaissements** | Client, montant, date, **référence obligatoire**, mode de paiement, justificatif facultatif |
| **Tableau de bord** | Budget, dépenses, encaissements, solde client, résultat provisoire — calculés côté SQL |
| **Fiche chantier** | Totaux, consommation du budget, historique chronologique complet |
| **Rapport PDF** | Par chantier, avec le nom et les coordonnées de l'entreprise, généré côté serveur |
| **Exports** | CSV (chantiers / dépenses / encaissements / complet) + sauvegarde JSON |
| **Interface** | Navigation latérale sur ordinateur, menu adapté au mobile, tableaux lisibles, montants FCFA explicites |
| **Robustesse** | Messages d'erreur français clairs, validation des montants (entiers FCFA), états de chargement partout |

Honnêteté fonctionnelle : un encaissement est une **déclaration documentée par une référence** (n° de reçu, réf. de virement, transaction Mobile Money). Il n'est présenté comme « prouvé » que lorsqu'un justificatif est joint. Le logiciel ne prétend jamais qu'un paiement a eu lieu sans trace.

## Démarrage rapide (développement)

```bash
npm install
npm run dev
```

Sans `DATABASE_URL`, `npm run dev` démarre un **PostgreSQL embarqué local** (binaires officiels, données dans `.pgdata/`), applique le schéma et les politiques RLS, puis lance l'API et l'interface. Pour un développement réel sur Neon, renseignez `.env` (voir [docs/INSTALLATION.md](docs/INSTALLATION.md)).

```bash
npm run test        # 55 tests d'intégration API (deux entreprises, permissions, calculs, exports, PDF…)
npm run db:test-rls # 22 tests d'isolation RLS avec deux entreprises fictives
npm run build       # build de production (Vite)
```

> Les deux suites de tests tournent sur un vrai PostgreSQL — pas de simulateur.

## Architecture

```
├── api/                    # Fonctions serverless (Vercel) — UNIQUE accès à la base
│   ├── _lib/               #   db, auth (scrypt), validation (zod), PDF, CSV, sécurité
│   ├── auth/               #   inscription, connexion, session, mot de passe
│   ├── projects/           #   chantiers + rapport PDF
│   ├── expenses/ payments/ #   dépenses et encaissements
│   └── …                   #   tableau de bord, exports, fichiers, audit, santé
├── src/                    # Application React (Vite + Tailwind) — aucun secret
├── db/
│   ├── schema.sql          # Schéma PostgreSQL (contraintes CHECK, relations)
│   ├── rls.sql             # Politiques RLS + rôles + fonctions d'authentification
│   ├── migrate.mjs         # Migration idempotente + vérification RLS forcée
│   └── test-rls.mjs        # Test d'isolation : deux entreprises, accès croisés
├── server/                 # Serveur API local + PostgreSQL embarqué (dev/tests)
├── tests/run.mjs           # Tests d'intégration de bout en bout
└── docs/                   # Installation, déploiement, sécurité, sauvegardes
```

**Règle d'or :** le navigateur ne parle qu'à l'API. La clé de base de données n'existe que côté serveur (variables d'environnement Vercel). Chaque requête métier s'exécute dans une transaction portant l'identifiant de l'entreprise — les politiques RLS PostgreSQL refusent tout le reste, y compris en cas de bug applicatif.

## Modèle de sécurité (résumé)

1. **Cloisonnement multi-entreprise par RLS** : `ENABLE` + `FORCE ROW LEVEL SECURITY` sur toutes les tables — même le propriétaire de la table ne lit rien sans contexte.
2. **Rôle de connexion limité** (`chantierpilot_app`) : l'API **refuse de démarrer** avec un rôle superuser/BYPASSRLS (garde de sécurité active).
3. **Mots de passe** : scrypt (sel aléatoire, comparaison à temps constant) — jamais en clair, jamais dans le navigateur.
4. **Sessions** : jetons opaques, seul leur hash SHA-256 est stocké, cookies `HttpOnly` (+ `Secure` et préfixe `__Host-` en production).
5. **Anti-force brute** : limitation de débit + verrouillage de compte persistant en base.
6. **Anti-CSRF** : vérification d'origine + cookies `SameSite`.
7. **Validation serveur ET base** : zod + contraintes `CHECK` (montants entiers FCFA bornés, dates cohérentes).
8. **Journal d'audit** inaltérable (pas d'UPDATE/DELETE possibles).
9. **En-têtes HTTP** : CSP stricte, `X-Frame-Options: DENY`, HSTS, `nosniff`, etc.

Détail complet : [docs/SECURITE.md](docs/SECURITE.md).

## Déploiement (production)

1. Créer une base **Neon** (PostgreSQL).
2. Exécuter `node db/migrate.mjs` avec l'URL d'administration (crée schéma, RLS et le rôle `chantierpilot_app`).
3. Déployer sur **Vercel** avec `DATABASE_URL` = URL du rôle **limité** `chantierpilot_app`.

Guide pas à pas complet (de zéro au produit fini) : [docs/VERCEL_PAS_A_PAS.md](docs/VERCEL_PAS_A_PAS.md) · Détails : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) · [docs/INSTALLATION.md](docs/INSTALLATION.md).
Sauvegardes & exports : [docs/SAUVEGARDES.md](docs/SAUVEGARDES.md).
Authentification managée (Neon Auth, optionnel) : [docs/NEON_AUTH.md](docs/NEON_AUTH.md).

## Offres de lancement

Grille testée auprès des premiers prospects — sans prétention de tarif moyen du marché (également visible dans l'app, menu « Offres & tarifs ») :

| Offre | Installation | Puis |
| --- | --- | --- |
| **Pilote fondateur** (premier client) | **75 000 FCFA** — configuration, import si données propres, formation, assistance 14 jours | 25 000 FCFA/mois |
| **Offre Standard** (plusieurs chantiers) | **150 000 FCFA** — configuration personnalisée, import convenu, formation dirigeant + équipe, rapport PDF personnalisé | 35 000 à 50 000 FCFA/mois |

Services complémentaires : site web professionnel à partir de **100 000 FCFA** (selon contenu et fonctions) · catalogue de réalisations avec photos (devis séparé) · fonctionnalité sur mesure (devis après analyse).

## Technologies

- **Frontend** : React 19 + Vite, Tailwind CSS v4, React Router — responsive mobile/tablette/ordinateur
- **Backend** : fonctions serverless Vercel (Node.js), validation zod, rapports PDF (pdfkit)
- **Base** : Neon PostgreSQL — `@neondatabase/serverless` (WebSocket) ou `pg` (TCP), RLS forcée
- **Devise** : FCFA (XOF), montants en entiers — aucune décimale
- **Langue** : français (interface, messages d'erreur, rapports)

## Licence

Projet privé — Tous droits réservés.
