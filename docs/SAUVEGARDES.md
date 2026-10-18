# Sauvegardes & export des données

## 1. Sauvegardes de la base

### 1.1 Ce que Neon fournit (à vérifier dans la console : *Settings*, *Backup & Restore*)

| Offre Neon | Restauration instantanée (PITR) | Instantanés manuels |
| --- | --- | --- |
| Free | **6 heures** d'historique (1 Go de changements max) | 1 |
| Launch (payant à l'usage) | jusqu'à **7 jours** (à régler dans *Settings → History*) | oui |
| Scale | jusqu'à 30 jours | oui |

**Avec de vrais clients, 6 heures ne suffisent pas** : passez la base de production en
**Launch** avec 7 jours d'historique, et prenez un instantané avant chaque migration.

### 1.2 Copie indépendante (`pg_dump`) — attention au RLS forcé

Toutes les tables ont `FORCE ROW LEVEL SECURITY`. `pg_dump` désactive `row_security`,
ce qui exige un rôle **superuser** ou **BYPASSRLS**. Pour un propriétaire sans BYPASSRLS,
PostgreSQL refuse le dump avec :
`query would be affected by row-level security policy` (vérifié par `npm run test:migration`).

1. Dans Neon → **SQL Editor** (branche `preprod`, rôle `neondb_owner`), exécutez :
   ```sql
   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
   ```
2. **Si `rolbypassrls` = `true`** : le dump fonctionne avec l'URL propriétaire.
   **Testez-le sur `preprod`**, puis restaurez-le sur une branche jetable :
   ```bash
   read -rs DATABASE_URL_ADMIN; export DATABASE_URL_ADMIN
   pg_dump "$DATABASE_URL_ADMIN" --no-owner --no-privileges -Fc -f "chantierpilot-$(date +%F).dump"
   pg_restore --list "chantierpilot-$(date +%F).dump" > /dev/null && echo "dump lisible"
   unset DATABASE_URL_ADMIN
   ```
   Utilisez un `pg_dump` de même version majeure que la base, ou plus récent.
3. **Si `rolbypassrls` = `false`** : pas de `pg_dump` complet possible avec ce rôle.
   Appuyez-vous sur la restauration instantanée et les instantanés Neon (offre Launch),
   et ouvrez une évolution dédiée pour un rôle de sauvegarde en lecture seule.

**À ne jamais faire :**
- `ALTER TABLE … NO FORCE ROW LEVEL SECURITY`, même si PostgreSQL le suggère : cela supprimerait l'isolation entre entreprises.
- Donner BYPASSRLS au rôle `chantierpilot_app`. L'API refuserait d'ailleurs de démarrer.

### 1.3 Rythme et stockage

- Au moins une copie par semaine au démarrage, puis par jour quand l'activité augmente.
  Conservez 7 copies quotidiennes et 12 mensuelles.
- Stockage **chiffré** et **privé**, hors du dépôt Git.
  **Pas d'artefact GitHub Actions** : le dépôt est public, et ses artefacts seraient téléchargeables.
- Une sauvegarde n'est valable qu'après un **test de restauration** sur une branche Neon jetable.

### 1.4 Restauration

- **Erreur récente** (dans la fenêtre PITR) : Neon → *Backup & Restore* → restaurer la branche à l'instant voulu.
  Ou créer une branche à cet instant pour comparer avant d'agir.
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
| Sauvegarde JSON | Structure complète (entreprise, chantiers, dépenses, encaissements) — base de restauration logique |

Ces exports ne contiennent **que les données de l'entreprise connectée** (RLS).
Format CSV : UTF-8 avec BOM (Excel francophone), séparateur `;`.

## 3. Justificatifs (pièces jointes)

Les justificatifs sont stockés chiffrés en transit dans la base (colonne `BYTEA`).
Ils apparaissent dans la sauvegarde `pg_dump` automatiquement. L'export JSON
n'embarque pas les binaires (poids) — indiquez `has_receipt` / `has_proof` comme
trace ; pour une extraction binaire complète, utilisez `pg_dump`.

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
