# Sauvegardes & export des données

## 1. Sauvegardes de la base

### 1.1 Ce que Neon fournit (à vérifier dans la console : *Settings*, *Backup & Restore*)

| Offre Neon | Restauration instantanée (PITR) | Instantanés manuels |
| --- | --- | --- |
| Free | **6 heures** d'historique (1 Go de changements max) | 1 |
| Launch (payant à l'usage) | jusqu'à **7 jours** (à régler dans *Settings → Postgres → History window*) | oui |
| Scale | jusqu'à 30 jours | oui |

**Avec de vrais clients, 6 heures peuvent être insuffisantes** : l'utilisateur doit vérifier le plan, configurer la fenêtre de récupération adaptée et prendre un instantané avant chaque migration. Sur Launch, la fenêtre peut atteindre 7 jours ; le défaut d'un projet payant est de 1 jour, à vérifier dans la console [9](https://neon.com/docs/postgres/backup-restore/history-window). Aucun changement de plan ou de paramètre n'est effectué par ce dépôt.

### 1.2 Copie indépendante (`pg_dump`) — attention au RLS forcé

Toutes les tables ont `FORCE ROW LEVEL SECURITY`. `pg_dump` désactive `row_security`,
ce qui exige un rôle **superuser** ou **BYPASSRLS**. Pour un propriétaire sans BYPASSRLS,
PostgreSQL peut refuser le dump avec un message indiquant que la requête serait affectée par une politique RLS. Ce comportement découle du fonctionnement documenté de `pg_dump`, qui désactive `row_security` par défaut [1](https://www.postgresql.org/docs/current/app-pgdump.html). Aucun dump ni aucune restauration Neon n'a été testé dans cette session.

1. Dans Neon → **SQL Editor** (branche `preprod`, rôle `neondb_owner`), exécutez :
   ```sql
   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
   ```
2. **Si `rolbypassrls` = `true`** : préparez, par un canal privé, un service PostgreSQL de sauvegarde avec `PGSERVICE` et un fichier de mots de passe protégé. Ne placez pas de chaîne de connexion dans les arguments de la commande ou l'historique du shell. **Testez d'abord sur `preprod`** :
   ```bash
   pg_dump --no-owner --no-privileges -Fc -f "chantierpilot-$(date +%F).dump"
   pg_restore --list "chantierpilot-$(date +%F).dump" > /dev/null && echo "dump lisible"
   ```
   Choisissez un nom de fichier qui n'écrase aucune sauvegarde existante. Une liste lisible ne prouve pas une restauration. Restaurez et contrôlez ensuite sur une cible jetable privée. Utilisez un `pg_dump` de même version majeure que la base, ou plus récent.
3. **Si `rolbypassrls` = `false`** : pas de `pg_dump` complet possible avec ce rôle.
   Appuyez-vous sur la restauration instantanée et les instantanés Neon (offre Launch),
   et ouvrez une évolution dédiée pour un rôle de sauvegarde en lecture seule.

**À ne jamais faire :**
- Ne désactivez pas manuellement le RLS pour contourner une sauvegarde. **Attention :** la migration actuelle contient elle-même un `NO FORCE ROW LEVEL SECURITY` temporaire autour d'une mise à jour des essais ; cette exception et ses effets doivent être examinés avant toute migration réelle.
- Donner BYPASSRLS au rôle `chantierpilot_app`. L'API refuserait d'ailleurs de démarrer.

### 1.3 Rythme et stockage

- Au moins une copie par semaine au démarrage, puis par jour quand l'activité augmente.
  Conservez 7 copies quotidiennes et 12 mensuelles.
- Stockage **chiffré** et **privé**, hors du dépôt Git.
  **Pas d'artefact GitHub Actions** : le dépôt est public, et ses artefacts seraient téléchargeables.
- Une sauvegarde n'est valable qu'après un **test de restauration** sur une branche Neon jetable.

### 1.4 Restauration

- **Erreur récente** (dans la fenêtre PITR) : pour un exercice, créez une cible de restauration isolée et privée à partir de l'instantané ou de l'historique ; vérifiez les totaux et les droits. Ne restaurez pas en place sur la production pendant un test. La restauration instantanée en place écrase les données et le schéma de toutes les bases de la branche ciblée ([8](https://neon.com/docs/introduction/branch-restore)).
- **Depuis un dump** : la procédure dépend du rôle disponible (le RLS forcé s'applique aussi à
  l'écriture). Elle doit être **écrite et testée sur une branche jetable avant le premier
  client réel** : restauration, puis contrôle des totaux (budgets, dépenses, encaissements)
  et du cloisonnement. Ne la considérez pas comme acquise tant que ce test n'est pas fait.

## 2. Export self-service (dans l'app)

Paramètres → **Export & sauvegarde** :

| Fichier | Contenu |
| --- | --- |
| Chantiers (CSV) | Tous les chantiers avec budget, dates, statut |
| Dépenses (CSV) | Toutes les dépenses (montants FCFA, justificatif : oui/non) |
| Encaissements (CSV) | Tous les encaissements (référence, mode, justificatif : oui/non) |
| Export complet (CSV) | Les trois en un fichier |
| Export JSON (partiel) | Entreprise, chantiers, dépenses, encaissements et certaines données métier, y compris archives de paie ; certaines tables et les fichiers binaires sont exclus |

Ces exports ne contiennent **que les données de l'entreprise connectée** (RLS).
Format CSV : UTF-8 avec BOM (Excel francophone), séparateur `;`.

## 3. Justificatifs (pièces jointes)

Les justificatifs sont stockés sous forme binaire dans la base (colonne `BYTEA`). Le chiffrement en transit dépend de la connexion TLS et le chiffrement au repos de la configuration de l'hébergeur ; aucun des deux n'a été vérifié ici.

Un `pg_dump` complet avec les droits appropriés doit inclure ces colonnes, contrairement à l'export JSON qui n'embarque pas les binaires : il indique leur présence avec `has_receipt` / `has_proof`. Vérifiez le contenu et la restauration sur une cible isolée ; ne considérez pas l'export JSON comme une sauvegarde intégrale.

## 4. Restauration logique d'un client (import initial)

Pour importer les données existantes d'un client (offres Pilote fondateur /
Standard) :

1. Demandez un fichier propre (CSV/Excel) : chantiers, dépenses, encaissements.
2. Créez son entreprise dans l'app (inscription).
3. Importez via un script ciblé ou l'interface, **puis vérifiez les totaux**
   (budget, dépenses, encaissements) contre le fichier source.
4. Laissez le client valider avant de considérer l'import terminé.

## 5. Ce qu'il ne faut PAS faire

- Ne copiez jamais `DATABASE_URL_ADMIN` dans les variables du navigateur.
- Ne restaurez pas un dump de production sur une préproduction publique.
- Ne supprimez pas `db/rls.sql` lors d'une restauration : il fait partie du schéma.
