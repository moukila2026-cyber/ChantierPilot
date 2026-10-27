# Rapport d'audit — ChantierPilot, reprise partielle

**Date : 27 octobre 2026 — Statut : non prêt pour la production.**

Les vérifications locales de compilation, de tests et de dépendances passent, mais elles ne valident ni la production ni l'ensemble des parcours. Le commit `be100e7` annoncé, son patch et les livrables associés ne sont pas disponibles dans l'arbre reçu ; la recherche du commit sur GitHub n'a pas trouvé cet objet et l'utilisateur ne possède pas l'archive. La suite repart donc du code disponible pour reconstruire et tester les fonctions requises ; une identité avec le patch perdu ne peut pas être garantie. L'arbre examiné part du commit `3efe370`, sur la branche `arena/db806f43-chantierpilot`.

L'[inventaire détaillé des interactions](INVENTAIRE_BOUTONS.md) contient **500 occurrences statiques**, dont **477 restent à vérifier** ; les 23 autres sont corrigées ou testées partiellement, sans garantie sur tous leurs états. Les contrôles et menus dynamiques peuvent représenter davantage d'actions que ces occurrences. Il ne s'agit pas d'une validation exhaustive.

## 1. Corrections réalisées dans cette reprise

| Sujet | Résultat | Références |
| --- | --- | --- |
| Dépendances et validation | Zod mis à jour pour corriger l'avis GHSA-mrhx-c7xc-m3w5 ; messages courants en français, collections bornées et dates impossibles refusées. | `package.json`, `package-lock.json`, `api/_lib/validate.js`, `tests/unit.mjs`, `tests/run.mjs` |
| Navigation et PDF | 17 boutons imbriqués dans des liens remplacés par des liens stylés ; navigation clavier, deux téléchargements PDF et navigation mobile exercés. | `src/components/ui.jsx`, pages concernées, `tests/browser-features.mjs` |
| Droits et équipe | Raccourci vers les documents masqué aux agents ; erreur de chargement d'équipe visible ; réinitialisation d'un agent non fermée en cas d'échec et envoi simultané évité. | `src/pages/OperationsPage.jsx`, `src/pages/SettingsPage.jsx`, `tests/browser-interactions.mjs` |
| BPU CSV | Analyse des délimiteurs et guillemets, refus des montants invalides ou ambigus et du dépassement de 200 postes, sans import partiel ; unités d'un caractère acceptées. Il ne s'agit pas d'un import DQE/BGP. | `src/lib/bpuCsv.js`, `src/pages/DocumentsPage.jsx`, routes et tests correspondants |
| Exports | Cellules texte à risque de formule neutralisées dans les CSV ; cinq téléchargements administrateur exercés. L'interface signale que l'export JSON est partiel et ne remplace pas une sauvegarde serveur. | `api/_lib/csv.js`, `api/_routes/export.js`, `src/pages/SettingsPage.jsx`, `tests/browser-interactions.mjs` |
| Journaux et tests isolés | Migration, API et serveur local ne publient plus de message, détail ou objet d'erreur brut dans les journaux ; une liste fermée de codes techniques reste disponible. Les suites npm utilisent un environnement minimal et ne chargent pas `.env` en mode test. | `db/migrate.mjs`, `api/_lib/safe-log.js`, `server/env.mjs`, `tests/helpers/`, suites de test |
| Surveillance | Une sonde HTTP en lecture seule est disponible sans afficher la cible. Son mode strict échoue tant que l'API ne déclare pas explicitement une disponibilité complète ; elle ne remplace pas un préflight. | `scripts/monitor.mjs`, `tests/unit.mjs`, `package.json` |
| Inscription multi-instance | Quota partagé par IP sur une heure glissante, contrôlé atomiquement en base ; refus sûr en cas d'indisponibilité. Migration et tests sur base jetable uniquement ; en absence de migration sur une cible, les inscriptions y renverront 503. | `api/_lib/register-rate-limit.js`, `api/_routes/auth/register.js`, `db/migrations/20261027_register_rate_limit.sql`, `tests/register-rate-limit.mjs` |
| Build et migration | Les builds Vercel n'accèdent plus automatiquement à la base et ne lancent plus de copie ou de migration ; procédure de revue et préproduction ajoutée. Les accès éventuels des anciens builds restent à vérifier. | `scripts/build-vercel.mjs`, `docs/MIGRATIONS_ET_PREPROD.md`, `tests/unit.mjs` |
| Documentation et CI | Documentation de sauvegarde et de reprise corrigée ; étapes navigateur et audit ajoutées. Les deux jobs `quality` et les contrôles Vercel du commit `f15bf49` ont réussi ; les jobs du commit précédent `e219afc` avaient échoué, pour une cause non déterminée. Vérifier les contrôles du dernier commit sur la PR. | `CHANGELOG.md`, `CORRECTIONS_POST_AUDIT.md`, `SAUVEGARDES.md`, `.github/workflows/ci.yml` |

## 2. Dernière vérification locale

Exécutée après les corrections ci-dessus, avec PostgreSQL isolé et données fictives :

| Commande / contrôle | Résultat |
| --- | --- |
| `npm ci` | Réussi, code 0 |
| `npm run build` | Réussi, code 0 |
| `npm run test:all` | Réussi, code 0 : suites RLS, unitaires, interface, intégration, simulation de migration, quota partagé, thème et fonctionnalités navigateur ; résultats locaux seulement |
| `npm run test:rate-limit` | Réussi sur une base jetable : deux processus, concurrence, démarrage à froid, RLS, réapplication et panne ; exécuté aussi dans `test:all` |
| `npm run test:browser` | Réussi, code 0 : parcours isolés métier et interactions, rôles, isolation entre entreprises, erreurs, exports et vérifications mobiles ciblées |
| `npm audit` | Réussi, code 0 ; 0 vulnérabilité signalée |
| `git diff --check` | Réussi, code 0 |
| Préflight strict | **Non disponible.** Une tentative antérieure a échoué avec `MODULE_NOT_FOUND` parce que `scripts/preflight.mjs` est absent ; il n'a pas été relancé lors de la vérification finale. |
| Nettoyage | Aucune instance PostgreSQL temporaire des suites ni aucun de leurs répertoires temporaires détecté après les tests. |

Les tests navigateur couvrent notamment des scénarios desktop et mobile, la création d'entreprise et de chantier, les droits agent, les erreurs d'équipe, cinq exports et 13 routes mobiles. Ils ne prouvent pas que chaque bouton, formulaire, erreur, rôle, format d'écran ou interaction dynamique fonctionne.

Les tests ne vérifient pas la configuration réelle de Neon ou Vercel, la délivrabilité d'e-mails, les paiements réels, la conformité juridique ou la restauration d'une sauvegarde réelle. Le quota partagé a été vérifié sur deux processus et une base jetable ; il reste à appliquer et à valider sur une préproduction séparée. La limitation de connexion reste, elle, en mémoire par instance en complément du verrouillage de compte en base.

## 3. Bloquants techniques et fonctionnels

- Le commit `be100e7`, ses fichiers et le patch annoncés manquent. L'utilisateur ne possède pas l'archive : reconstruire les fonctions requises à partir du code existant plutôt que bloquer sur sa recherche ; ne pas prétendre qu'il s'agit du même patch.
- `scripts/preflight.mjs` et `scripts/backup-dump.mjs` sont absents. Les structures du mot de passe oublié et `kv_store` annoncées restent absentes. Une migration distincte pour `rate_limit_counters` et ses fonctions existe mais n'a été appliquée que sur des bases de test ; la [procédure de préproduction](MIGRATIONS_ET_PREPROD.md) reste à valider. La sonde `npm run monitor` ne peut pas attester la disponibilité complète sans signal fiable.
- Le parcours de mot de passe oublié par e-mail, une politique de confidentialité et des mentions légales complètes, les exports XLSX/DOCX et les imports DQE/BGP sont absents de cet arbre. Une réinitialisation d'agent par un administrateur et un import BPU CSV existent, mais ne remplacent pas ces fonctions.
- L'export JSON inclut une partie des données métier et les archives historiques de paie, mais exclut des tables et des fichiers binaires. Un téléchargement JSON réussi n'est pas une sauvegarde complète ni une restauration testée.
- Les deux jobs `quality` du commit `e219afc` ont échoué sur GitHub ; leurs journaux détaillés n'étaient pas accessibles depuis le sandbox, donc leur cause reste inconnue. Les deux jobs `quality` et les contrôles Vercel du commit `f15bf49` ont ensuite réussi ; vérifier également les contrôles du dernier commit sur la PR.

## 4. Migration : ce qui doit être revu avant toute cible réelle

Une migration **additive** vise à ajouter des structures compatibles, sans supprimer ni modifier silencieusement des données existantes. **La migration courante ne peut pas être décrite comme purement additive ou sans risque** :

- `db/schema.sql` ajoute des tables et colonnes, mais modifie aussi `companies.trial_until` pour certaines entreprises existantes ; il désactive puis réactive temporairement le RLS forcé sur cette table et recrée des déclencheurs.
- `db/rls.sql` recrée des politiques. Le script lance le schéma et les politiques séparément, sans transaction globale explicite couvrant les deux ; l'atomicité et le comportement en cas d'erreur sur la cible réelle restent à examiner.
- Si `APP_DB_PASSWORD` est défini, le script peut modifier le mot de passe du rôle applicatif. Ses journaux masquent la cible ; ils ne suffisent pas à vérifier indépendamment la base visée.

Aucune migration réelle, sauvegarde ou restauration n'a été exécutée pendant cette session. **Avant toute exécution**, faire revoir les effets sur les données et les droits, préparer un retour arrière, disposer d'une sauvegarde vérifiée et tester une restauration sur une cible privée isolée. Ensuite seulement, tester la migration en préproduction, contrôler les données et l'isolation, puis envisager séparément la production par l'utilisateur après autorisation explicite. La [procédure de sauvegarde](SAUVEGARDES.md) décrit notamment les limites de `pg_dump` avec le RLS forcé.

## 5. Ce qui reste à faire, par priorité

1. **Reconstruire les corrections manquantes sans archive** : partir de la PR et de l'arbre disponibles, implémenter les fonctions requises par étapes et compléter l'inventaire et les tests. Si l'ancien patch réapparaît, le comparer, sans le présumer identique à la nouvelle reprise.
2. **Sécuriser le plan de migration** : revoir la migration pour qu'elle soit additive ou faire approuver explicitement ses effets sur les données ; préparer un retour arrière. Faire une sauvegarde et tester la restauration **avant** toute migration, puis valider la préproduction et, séparément, la production par vos soins.
3. **Sauvegardes Neon** : vérifier l'offre Launch, les instantanés, la rétention et les coûts ; définir une fenêtre de récupération adaptée et tester une restauration isolée. Sur Launch, l'historique est réglable jusqu'à sept jours et la valeur initiale payante indiquée par Neon est d'un jour [1](https://neon.com/docs/postgres/backup-restore/history-window). Une restauration en place écrase la branche ciblée [8](https://neon.com/docs/postgres/backup-restore/branch-restore).
4. **Séparer Preview, préproduction et production** : vérifier effectivement bases, accès et variables pour chaque environnement avant tout push susceptible de déclencher un aperçu Vercel. L'historique Vercel consulté montre des déploiements Git de ce projet en production depuis `main` ; une fusion peut donc mettre le code en production automatiquement. Ne jamais partager les valeurs de configuration dans le chat.
5. **Hébergement commercial** : l'équipe Vercel consultée était sur l'offre Hobby au moment de la vérification ; celle-ci est réservée à l'usage personnel non commercial selon Vercel [1](https://vercel.com/docs/limits/fair-use-guidelines). Vérifier l'offre adaptée avec Vercel. L'achat de domaine, le forfait et l'hébergement restent à votre charge ; vérifier aussi l'alignement du domaine, de `APP_URL` et de `vercel.json`.
6. **E-mail et juridique** : après récupération ou création des fonctions correspondantes, configurer en privé soit `RESEND_API_KEY` avec `MAIL_FROM`, soit `MAIL_WEBHOOK_URL` ; tester l'envoi. Compléter l'identité légale et la confidentialité avec un juriste ivoirien, puis vérifier les démarches applicables auprès de l'ARTCI.
7. **Préflight et supervision** : reconstruire un préflight strict réel, terminer les prérequis puis lancer le contrôle. Prévoir une supervision et des alertes 5xx et planifier `npm run monitor`. Après déploiement autorisé, relancer le préflight et le moniteur en mode `MONITOR_REQUIRE_READY` activé, sans publier de valeur de variable. Ce mode échoue actuellement car l'API ne fournit pas de signal `ready` complet.
8. **Revue et publication** : finir les interactions restantes sur desktop et mobile, pour chaque rôle, entreprise et erreur pertinente. Une PR pourra ensuite être revue après vérification de l'isolation Preview ; aucune fusion ni mise en production sans accord explicite.

## 6. Commandes de reprise sans valeurs de configuration

À chaque étape de reconstruction, sur des données de test isolées :

```bash
npm ci
npm run build
npm run test:all
npm run test:browser
npm audit
```

Exécuter la commande suivante **uniquement lorsqu'un préflight strict réel aura été reconstruit et examiné** :

```bash
node scripts/preflight.mjs --strict
```

`npm run monitor` exécute la sonde de santé ; son résultat de base ne prouve pas que la production est prête. Le mode strict échoue actuellement faute de signal de disponibilité complet dans l'API. Toute commande de migration ou de restauration doit rester conditionnée aux vérifications et autorisations ci-dessus.

## 7. Actions non effectuées

Au moment des vérifications, aucun secret, identifiant, fichier de configuration d'environnement ou réglage Vercel n'avait été modifié. Aucun déploiement, migration, sauvegarde ou restauration de production n'avait été réalisé dans cette session. La séparation des environnements distants n'a pas été vérifiée ; consulter GitHub pour l'état actuel du commit, du push et de la PR.
