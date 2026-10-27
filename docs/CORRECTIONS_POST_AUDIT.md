# Corrections post-audit — reprise partielle

## État et limite de la reprise

L’arbre reçu est basé sur `3efe370`, sur la branche de cette session. Le commit `be100e7` annoncé, son patch et les livrables d’audit ne sont pas présents localement ; la recherche du commit dans le dépôt GitHub n’a pas trouvé cet objet. Les corrections de ce commit ne peuvent donc pas être considérées comme appliquées. Ne pas fusionner ni déployer cet arbre comme s’il les contenait.

L’[inventaire des interactions](INVENTAIRE_BOUTONS.md) distingue ce qui a été exercé de ce qui reste à vérifier. Il ne démontre pas l’absence d’erreur sur toutes les commandes.

## Modifications réalisées ici

| Domaine | Correction | Fichiers principaux |
| --- | --- | --- |
| Validation | Zod corrigé pour GHSA-mrhx-c7xc-m3w5, erreurs par défaut en français, dates calendaires strictes | `package.json`, `package-lock.json`, `api/_lib/validate.js` |
| Exports | Cellules CSV texte sensibles neutralisées pour les tableurs, données sources conservées | `api/_lib/csv.js`, `tests/unit.mjs` |
| BPU | Analyse CSV sans conversion silencieuse ni import partiel sur erreur ; formats délimités, guillemets et unités courtes | `src/lib/bpuCsv.js`, `src/pages/DocumentsPage.jsx`, `api/_lib/operations.js`, `api/_routes/documents.js`, `api/_routes/operations.js` |
| Navigation | Dix-sept contrôles interactifs imbriqués remplacés par des liens stylés ; documents réservés à l’administrateur masqués pour l’agent dans le carnet | `src/components/ui.jsx`, pages concernées |
| Équipe | Conserver le formulaire de réinitialisation en cas d’échec, empêcher les doubles envois et signaler l’échec de chargement | `src/pages/SettingsPage.jsx` |
| Confidentialité des journaux | Pas de chaîne de connexion ni de message brut du pilote affiché par la migration | `db/migrate.mjs` |
| Tests | Les commandes npm de test utilisent un lanceur enfant à environnement minimal ; pas de lecture du `.env` en mode test. Bases et ports éphémères, pas d'effacement des anciens répertoires PostgreSQL locaux, nettoyage en fin de suite et en cas d'interruption ; test automatique de non-transmission des variables sensibles. Couverture supplémentaire mobile/rôles/exports | `server/env.mjs`, `tests/helpers/`, `db/test-rls.mjs`, `tests/run.mjs`, suites navigateur, `.github/workflows/ci.yml` |
| Exports et sauvegardes | L'interface précise que l'export JSON est partiel et ne remplace pas une sauvegarde serveur restaurée et vérifiée ; documentation des limites RLS et des pièces jointes | `src/pages/SettingsPage.jsx`, `api/_routes/export.js`, `docs/SAUVEGARDES.md` |

## Blocages identifiés dans l’arbre courant

- Les tables `kv_store`, `rate_limit_counters`, `password_resets` et les fonctions `api_rate_limit_hit`, `api_password_reset_create`, `api_password_reset_consume` annoncées ne figurent pas dans `db/schema.sql` / `db/rls.sql`. La limitation est actuellement en mémoire par instance ; le repli KV utilise `audit_log`.
- Le parcours de mot de passe oublié par e-mail, les pages légales dédiées, les exports XLSX/DOCX et l’import DQE/BGP demandés ne sont pas présents. Le changement de mot de passe et la réinitialisation d’un agent par son administrateur sont des fonctions différentes.
- `scripts/preflight.mjs`, `scripts/backup-dump.mjs`, `docs/MIGRATIONS_ET_PREPROD.md` et la commande `npm run monitor` annoncés sont absents. Ne pas créer de résultat de préflight artificiellement favorable.
- **La migration actuelle n'est pas purement additive.** `db/schema.sql` met à jour `companies.trial_until` pour certaines entreprises existantes, désactive puis réactive temporairement le RLS forcé sur cette table et recrée des déclencheurs ; `db/rls.sql` recrée des politiques. `db/migrate.mjs` peut aussi modifier le mot de passe du rôle applicatif si `APP_DB_PASSWORD` est défini. Il faut revoir ces effets, l'atomicité et le plan de retour arrière avant toute exécution réelle ; ne pas la présenter comme sans risque.
- La sauvegarde/retour arrière et les migrations de préproduction et production n’ont pas été exécutés. La documentation [SAUVEGARDES](SAUVEGARDES.md) rappelle les restrictions RLS et le test sur cible isolée.
- La revue de chaque interaction dans tous les rôles, entreprises, erreurs et formats d’écran n’est pas terminée. La CI configurée n’a pas été exécutée sur GitHub dans cette session.

## Suite recommandée

1. Fournir le patch, l’archive ou le commit d’audit manquant ; comparer puis intégrer sans écraser les corrections de cette session.
2. Relancer la compilation, `npm run test:all`, `npm run test:browser`, `npm audit` et le préflight strict une fois son script récupéré.
3. Compléter l’inventaire et les tests des interactions restantes ; vérifier aussi les fonctionnalités absentes.
4. Avant toute migration réelle : sauvegarde vérifiée et restauration sur une cible isolée. Ensuite seulement, migration sur préproduction, validation, puis migration de production **par l’utilisateur**.
5. Ne créer/fusionner une PR ou déployer qu’après revue des prérequis, et ne fusionner ni déployer sans autorisation explicite.
