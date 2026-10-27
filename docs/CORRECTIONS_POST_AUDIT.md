# Corrections post-audit — reprise partielle

## État et limite de la reprise

L’arbre reçu est basé sur `3efe370`, sur la branche de cette session. Le commit `be100e7` annoncé, son patch et les livrables d’audit ne sont pas présents localement ; la recherche du commit dans le dépôt GitHub n’a pas trouvé cet objet. L'utilisateur indique ne pas disposer de l'archive. Il n'est plus nécessaire de la lui redemander : les fonctions requises doivent être reconstruites et testées à partir du code disponible, sans prétendre avoir récupéré ou validé le patch manquant. Ne pas déclarer cet arbre prêt pour la production.

L’[inventaire des interactions](INVENTAIRE_BOUTONS.md) distingue ce qui a été exercé de ce qui reste à vérifier. Il ne démontre pas l’absence d’erreur sur toutes les commandes.

## Modifications réalisées ici

| Domaine | Correction | Fichiers principaux |
| --- | --- | --- |
| Validation | Zod corrigé pour GHSA-mrhx-c7xc-m3w5, erreurs par défaut en français, dates calendaires strictes | `package.json`, `package-lock.json`, `api/_lib/validate.js` |
| Exports | Cellules CSV texte sensibles neutralisées pour les tableurs, données sources conservées | `api/_lib/csv.js`, `tests/unit.mjs` |
| BPU | Analyse CSV sans conversion silencieuse ni import partiel sur erreur ; formats délimités, guillemets et unités courtes | `src/lib/bpuCsv.js`, `src/pages/DocumentsPage.jsx`, `api/_lib/operations.js`, `api/_routes/documents.js`, `api/_routes/operations.js` |
| Navigation | Dix-sept contrôles interactifs imbriqués remplacés par des liens stylés ; documents réservés à l’administrateur masqués pour l’agent dans le carnet | `src/components/ui.jsx`, pages concernées |
| Équipe | Conserver le formulaire de réinitialisation en cas d’échec, empêcher les doubles envois et signaler l’échec de chargement | `src/pages/SettingsPage.jsx` |
| Confidentialité des journaux | Migration, API, pool et serveur local : pas de chaîne de connexion, message, détail ou objet d'erreur brut ; codes techniques issus d'une liste fermée. Résumé CI d'échec limité à des indications non sensibles | `db/migrate.mjs`, `api/_lib/safe-log.js`, `scripts/ci-report-failure.mjs`, API et serveur local |
| Quota d'inscription | Dix tentatives par IP et heure glissante, compteur PostgreSQL partagé, refus 429 ou 503 selon le cas ; rôles, concurrence et réapplication testés sur base isolée uniquement | `api/_lib/register-rate-limit.js`, `api/_routes/auth/register.js`, `db/migrations/20261027_register_rate_limit.sql`, `tests/register-rate-limit.mjs` |
| Sécurité du build | Plus d'accès automatique à une base, de copie de tables ou de migration lors d'un build Vercel ; le diagnostic historique reste limité aux tests locaux explicitement confirmés | `scripts/build-vercel.mjs`, `tests/unit.mjs`, `docs/MIGRATIONS_ET_PREPROD.md` |
| Surveillance | Sonde de santé sans affichage de cible ; le mode strict échoue tant que l'API ne fournit pas explicitement un signal de disponibilité complète. Aucun contrôle réel de production effectué. | `scripts/monitor.mjs`, `tests/unit.mjs`, `package.json` |
| Tests | Les commandes npm de test utilisent un lanceur enfant à environnement minimal ; pas de lecture du `.env` en mode test. Bases et ports éphémères, pas d'effacement des anciens répertoires PostgreSQL locaux, nettoyage en fin de suite et en cas d'interruption ; test automatique de non-transmission des variables sensibles. Couverture supplémentaire mobile/rôles/exports | `server/env.mjs`, `tests/helpers/`, `db/test-rls.mjs`, `tests/run.mjs`, suites navigateur, `.github/workflows/ci.yml` |
| Exports et sauvegardes | L'interface précise que l'export JSON est partiel et ne remplace pas une sauvegarde serveur restaurée et vérifiée ; documentation des limites RLS et des pièces jointes | `src/pages/SettingsPage.jsx`, `api/_routes/export.js`, `docs/SAUVEGARDES.md` |

## Blocages identifiés dans l’arbre courant

- La limitation d'inscription partagée est désormais définie dans une migration distincte, testée seulement sur base jetable et non appliquée sur une cible réelle. Sans cette migration, l'API refuse les inscriptions ; les limites d'autres routes, dont la connexion, restent en mémoire par instance. Les structures de mot de passe oublié et `kv_store` annoncées restent absentes ; le repli KV utilise `audit_log`.
- Le parcours de mot de passe oublié par e-mail, les pages légales dédiées, les exports XLSX/DOCX et l’import DQE/BGP demandés ne sont pas présents. Le changement de mot de passe et la réinitialisation d’un agent par son administrateur sont des fonctions différentes.
- `scripts/preflight.mjs` et `scripts/backup-dump.mjs` sont absents. Ne pas créer de résultat de préflight artificiellement favorable. Une nouvelle sonde `npm run monitor` existe, mais le mode strict reste en échec tant que l'API ne publie pas un signal de disponibilité complète fiable ; elle ne remplace pas le préflight. La procédure de migration et préproduction est dans `docs/MIGRATIONS_ET_PREPROD.md`.
- **La migration actuelle n'est pas purement additive.** `db/schema.sql` met à jour `companies.trial_until` pour certaines entreprises existantes, désactive puis réactive temporairement le RLS forcé sur cette table et recrée des déclencheurs ; `db/rls.sql` recrée des politiques. `db/migrate.mjs` peut aussi modifier le mot de passe du rôle applicatif si `APP_DB_PASSWORD` est défini. Il faut revoir ces effets, l'atomicité et le plan de retour arrière avant toute exécution réelle ; ne pas la présenter comme sans risque.
- La sauvegarde/retour arrière et les migrations de préproduction et production n’ont pas été exécutés. La documentation [SAUVEGARDES](SAUVEGARDES.md) rappelle les restrictions RLS et le test sur cible isolée.
- La revue de chaque interaction dans tous les rôles, entreprises, erreurs et formats d’écran n’est pas terminée. Les deux exécutions `quality` du commit `e219afc` ont échoué sur GitHub (suite complète et parcours navigateur respectivement) ; les journaux détaillés n'étaient pas accessibles depuis ce sandbox. Les contrôles locaux passent, mais il faut refaire et analyser la CI après mise à jour de la PR avant toute décision.

## Suite recommandée

1. Sans attendre d'archive, reconstruire les fonctions manquantes à partir du dépôt, des besoins et des tests ; si un artefact réapparaît plus tard, le comparer sans écraser les corrections déjà faites.
2. Relancer la compilation, `npm run test:all`, `npm run test:browser` et `npm audit`. Construire un véritable préflight strict contrôlant les prérequis plutôt qu'un faux résultat favorable.
3. Compléter l’inventaire et les tests des interactions restantes ; vérifier aussi les fonctionnalités absentes.
4. Avant toute migration réelle : sauvegarde vérifiée et restauration sur une cible isolée. Ensuite seulement, migration sur préproduction, validation, puis migration de production **par l’utilisateur**.
5. Garder la PR existante en brouillon ; ne fusionner ni déployer en production avant revue des prérequis et autorisation explicite.
