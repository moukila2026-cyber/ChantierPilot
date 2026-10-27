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
| **Exports** | CSV (chantiers / dépenses / encaissements / complet) + export JSON partiel, distinct d'une sauvegarde serveur |
| **Interface** | Navigation latérale sur ordinateur, menu adapté au mobile, tableaux lisibles, montants FCFA explicites |
| **Robustesse** | Messages d'erreur français clairs, validation des montants (entiers FCFA), états de chargement partout |

Honnêteté fonctionnelle : un encaissement est une **déclaration documentée par une référence** (n° de reçu, réf. de virement, transaction Mobile Money). Il n'est présenté comme « prouvé » que lorsqu'un justificatif est joint. Le logiciel ne prétend jamais qu'un paiement a eu lieu sans trace.

## Modules métier ajoutés

- **Devis & factures** : bibliothèque de prix, brouillons modifiables, émission, acceptation enregistrée, création du chantier, acomptes/situations/solde, avoir intégral et PDF. Règlements déclarés affectés aux factures.
- **Avances de caisse** : bénéficiaire, dépenses justifiées, restitution et clôture par la direction, sans double comptage.
- **Carnet terrain** : présences avec validation du coût, journal photo, compte rendu PDF, tâches et réserves affectées.
- **Achats & stock** : demande, approbation, réception complète, consommation et retour d'inutilisé par chantier.
- **Hors connexion ciblé** : journal et présences en attente locale, rechargement de la coque en production, synchronisation avec déduplication.

Premières versions opérationnelles, **pas** un ERP complet, une paie automatisée, une signature certifiée ou une facturation homologuée. → [Parcours, installation, tests et limites](docs/MODULES_METIER.md).

### Gestion avancée

Menu `/gestion` : plans PDF/images avec révisions et annotations positionnées, planning Gantt à dépendances contrôlées, stocks quantitatifs multi-dépôts et livraisons chantier. La paie et la signature électronique certifiée sont hors périmètre : les présences/coûts validés et les accords clients référencés permettent de gérer les chantiers sans ces modules. Paramètres entreprise enrichis avec NCC/régime fiscal ; pas de certification FNE/DGI implicite.

→ [Installation, parcours, sécurité et fonctions restant à raccorder](docs/GESTION_AVANCEE.md).

## Abonnements et paiement SasPay

Essai gratuit de 14 jours, puis **Essentiel 9 900**, **Équipe 19 900**, **Entreprise 39 900 FCFA / 30 jours**. Quotas appliqués côté serveur, activation après confirmation SasPay, lecture seule à expiration, console opérateur SHOPIN30 avec suspension journalisée. Alertes budget, trésorerie et retard dans le tableau de bord.

**Le client valide chaque renouvellement : pas de prélèvement récurrent sans intervention.** La confirmation et les droits sont automatisés. La mise en production nécessite les clés SasPay et son webhook.

→ [Configuration, limites et désignation des opérateurs](docs/ABONNEMENTS_SASPAY.md).

## Démarrage rapide (développement)

```bash
npm install
npm run dev
```

Sans base configurée (ni `DATABASE_URL` ni `DATABASE_URL_ADMIN`), `npm run dev` démarre un **PostgreSQL embarqué local** (binaires officiels, données dans `.pgdata/`), applique le schéma et les politiques RLS, puis lance l'API et l'interface. **Attention :** avec une base configurée, cette commande peut appliquer la migration à cette cible ; ne l'exécutez pas contre la production. Voir [docs/INSTALLATION.md](docs/INSTALLATION.md).

```bash
npm run build           # nécessaire avant les tests navigateur
npm run test:all        # suites API, migrations, unitaires et navigateurs existantes
npm run test:browser    # parcours produit supplémentaires, PostgreSQL temporaire isolé
npm run db:test-rls     # tests d'isolation RLS avec deux entreprises fictives
npm run test:migration  # simulation de migration sur base isolée
npm run test:rate-limit # quota partagé, concurrence et refus sûr en base isolée
npm run test:unit       # validation, CSV, montants, PDF, routeur et limites Vercel
npm run test            # intégration API, quotas, facturation et droits
```

> Les suites tournent sur un vrai PostgreSQL temporaire. Les réponses de SasPay sont simulées dans les tests du contrat de paiement ; aucun débit réel n’est effectué.

`npm run monitor` vérifie en lecture seule la santé HTTP de la cible déjà configurée dans `APP_URL`, sans afficher sa valeur. Ce contrôle limité ne prouve pas que la production est prête. Le mode `MONITOR_REQUIRE_READY` échoue tant que l'API ne fournit pas un signal `ready` fiable ; aucun préflight strict n'est disponible dans cet arbre. Voir [le plan de reprise sans archive](docs/PLAN_REPRISE_SANS_ARCHIVE.md).

## Architecture

```
├── api/                    # API serverless (Vercel) — UNIQUE accès à la base
│   ├── index.js            #   la seule fonction déployée (toutes les URL /api/…)
│   ├── _lib/               #   routeur, db, auth (scrypt), validation (zod), PDF, CSV, sécurité
│   └── _routes/            #   gestionnaires : auth, chantiers + PDF, dépenses, encaissements,
│                           #   tableau de bord, exports, fichiers, audit, santé
├── src/                    # Application React (Vite + Tailwind) — aucun secret
├── db/
│   ├── schema.sql          # Schéma PostgreSQL (contraintes CHECK, relations)
│   ├── rls.sql             # Politiques RLS + rôles + fonctions d'authentification
│   ├── migrate.mjs         # Réapplication du schéma/RLS à revoir avant cible réelle
│   └── test-rls.mjs        # Test d'isolation : deux entreprises, accès croisés
├── server/                 # Serveur API local + PostgreSQL embarqué (dev/tests)
├── tests/                  # Intégration de bout en bout, unitaires, migration « comme Neon »
└── docs/                   # Installation, déploiement, sécurité, sauvegardes
```

**Règle d'or :** le navigateur ne parle qu'à l'API. La clé de base de données n'existe que côté serveur (variables d'environnement Vercel). Chaque requête métier s'exécute dans une transaction portant l'identifiant de l'entreprise — les politiques RLS PostgreSQL refusent tout le reste, y compris en cas de bug applicatif.

## Modèle de sécurité (résumé)

1. **Cloisonnement multi-entreprise par RLS** : `ENABLE` + `FORCE ROW LEVEL SECURITY` sur toutes les tables — même le propriétaire de la table ne lit rien sans contexte.
2. **Rôle de connexion limité** (`chantierpilot_app`) : l'API **refuse de démarrer** avec un rôle superuser/BYPASSRLS (garde de sécurité active).
3. **Mots de passe** : scrypt (sel aléatoire, comparaison à temps constant) — jamais en clair, jamais dans le navigateur.
4. **Sessions** : jetons opaques, seul leur hash SHA-256 est stocké, cookies `HttpOnly` (+ `Secure` et préfixe `__Host-` en production).
5. **Anti-force brute** : quota d'inscription partagé en base après application contrôlée de sa migration ; connexion limitée par instance avec verrouillage de compte persistant. La limitation d'inscription renvoie 503 si sa base ou sa migration est indisponible.
6. **Anti-CSRF** : vérification d'origine + cookies `SameSite`.
7. **Validation serveur ET base** : zod + contraintes `CHECK` (montants entiers FCFA bornés, dates cohérentes).
8. **Journal d'audit** inaltérable (pas d'UPDATE/DELETE possibles).
9. **En-têtes HTTP** : CSP stricte, `X-Frame-Options: DENY`, HSTS, `nosniff`, etc.

Détail complet : [docs/SECURITE.md](docs/SECURITE.md).

## Préparation du déploiement — production non autorisée

Un build ne lance plus automatiquement de migration ni de sauvegarde. Le parcours de mot de passe oublié et un préflight strict restent à construire ; l'application n'est donc pas déclarée prête pour la production. La nouvelle protection d'inscription nécessite sa migration SQL : sans elle, les inscriptions échouent volontairement avec une erreur 503.

Avant toute cible réelle, revoir les migrations, disposer d'une sauvegarde et tester sa restauration sur une base isolée. Tester d'abord la migration en préproduction, puis envisager une application séparée en production par la personne autorisée. **Ne pas lancer `npm run migrate` sur la production en l'état :** la migration générale modifie aussi certains essais et privilèges. Les bases Preview et Production doivent être séparées et l'API doit employer le rôle applicatif limité.

Détails et ordre des opérations : [docs/MIGRATIONS_ET_PREPROD.md](docs/MIGRATIONS_ET_PREPROD.md). Plan complet : [docs/PLAN_MISE_EN_PRODUCTION.md](docs/PLAN_MISE_EN_PRODUCTION.md).
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
- **Backend** : une fonction serverless Vercel (Node.js 22) avec routeur interne, validation zod, rapports PDF (pdfkit)
- **Base** : Neon PostgreSQL — `@neondatabase/serverless` (WebSocket) ou `pg` (TCP), RLS forcée
- **Devise** : FCFA (XOF), montants en entiers — aucune décimale
- **Langue** : français (interface, messages d'erreur, rapports)

## Licence

Projet privé — Tous droits réservés.
