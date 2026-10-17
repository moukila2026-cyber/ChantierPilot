# Sauvegardes & export des données

## 1. Sauvegardes Neon (recommandées)

Neon conserve l'historique de votre base (PITR — restauration à un instant précis,
selon le plan). Vérifiez dans la console Neon : *Settings → Backup & Restore*.

Pour une copie indépendante (bonne pratique : au moins une par jour, conservée
7 jours, une par mois, conservée 12 mois) :

```bash
pg_dump "$DATABASE_URL_ADMIN" --no-owner --no-privileges \
  -Fc -f "chantierpilot-$(date +%F).dump"
```

Restauration :

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL_ADMIN" chantierpilot-2026-01-31.dump
```

Automatisez via une tâche planifiée (cron, GitHub Actions…) qui écrit sur un
stockage chiffré — **ne stockez jamais les dumps dans le dépôt Git**.

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
