# Migration et préproduction — procédure à faire valider

**Statut : tests sur PostgreSQL jetable uniquement.** Aucune migration, sauvegarde ou restauration sur une base réelle n'a été lancée par cette reprise. Ne pas fusionner ni déployer en production sans les prérequis et l'accord explicite de la personne responsable. La séparation des bases et les éventuels accès des anciens builds Preview restent à vérifier.

## Ce qui change

- `db/migrations/20261027_register_rate_limit.sql` ajoute une table de compteurs et deux fonctions `SECURITY DEFINER`. La limite d'inscription est de **10 tentatives par IP sur une heure glissante**, partagée entre les instances qui utilisent la même base. Les formulaires invalides sont également comptés. À la 11e tentative, l'API renvoie 429 avec `Retry-After` ; si l'IP fiable ou le dispositif est indisponible, elle renvoie 503 et refuse l'inscription.
- Les tests isolés couvrent les appels simultanés, deux processus API, la fenêtre glissante, le nettoyage concurrent, la réapplication de la migration, le refus d'une table homonyme non identifiée, le RLS forcé, l'interdiction d'accès direct au rôle applicatif et l'indisponibilité en mode Preview. Un démarrage API à froid sous concurrence est également testé : une seule initialisation du pool partage les connexions. Ces tests ne prouvent pas le bon fonctionnement sur Neon ou dans une topologie de proxies réelle.
- Sur Vercel, l'adresse est déterminée à partir des en-têtes établis par la plateforme, en privilégiant `x-vercel-forwarded-for`. En auto-hébergement direct, l'adresse de la connexion est utilisée, pas un en-tête fourni par le client. Un proxy supplémentaire peut agréger les utilisateurs sous une même IP ; sa configuration et l'adresse effectivement vue doivent être vérifiées en préproduction. Ne pas afficher les adresses de test dans les journaux.
- Les empreintes SHA-256 ne contiennent pas l'IP brute mais restent **pseudonymisées, pas anonymes**. Les compteurs expirés sont nettoyés par lots lors de tentatives autorisées ; une période sans trafic ou une panne du nettoyage peut prolonger leur conservation. Prévoir une surveillance et une politique de conservation adaptée, avec avis juridique ; ne pas promettre une purge à heure fixe.
- Le build ne contacte plus automatiquement la base et ne lance plus de copie de tables ou de migration. Le diagnostic historique du script de build est réservé à une cible locale de test explicitement confirmée ; sa copie de tables **n'est pas une sauvegarde**.

## Points de vigilance avant toute cible réelle

1. **Sauvegarde et restauration d'abord.** Vérifier l'offre et la rétention Neon, créer une sauvegarde adaptée puis tester sa restauration sur une cible privée isolée. Ne pas restaurer en place sur une branche contenant des données à conserver. Les restrictions liées au RLS forcé, aux rôles et aux pièces jointes sont détaillées dans [SAUVEGARDES.md](SAUVEGARDES.md).
2. **Séparation des environnements.** Vérifier, sans communiquer les valeurs, que Preview, préproduction et production utilisent bien des bases et accès distincts. La configuration réelle n'a pas été vérifiée dans cette reprise.
3. **Revue SQL et rôles.** Examiner le fichier de migration avec une personne compétente, vérifier que les rôles attendus existent et que l'administrateur peut créer les objets et transférer les fonctions sans contourner les règles d'isolation. Vérifier les privilèges Neon réels : ils n'ont pas été testés ici. Si une table ou une fonction homonyme existe déjà sans le marqueur attendu, la migration s'arrête au lieu de la reprendre silencieusement.
4. **Attention à la migration générale.** `db/migrate.mjs` applique aussi `db/schema.sql` et `db/rls.sql` : certains essais existants peuvent être modifiés, le RLS forcé est temporairement levé sur une table, des déclencheurs/politiques sont recréés et le mot de passe du rôle peut être modifié si `APP_DB_PASSWORD` est défini. Ce chemin n'est pas purement additif ni couvert par une transaction globale ; ne pas l'exécuter sur une base réelle sans revue distincte et accord explicite.
5. **Ordre code/base.** Tester d'abord le SQL et le nouveau code sur une préproduction isolée. Sans la nouvelle fonction en base, l'inscription sera volontairement indisponible. Préparer ensemble migration, déploiement du code et retour arrière ; ne pas activer les clients payants tant que le parcours complet n'est pas vérifié.

## Ordre proposé — aucune commande réelle exécutée ici

- Refaire les tests locaux isolés : `npm run build`, `npm run test:rate-limit`, `npm run test:all` et `npm run test:browser`.
- Après sauvegarde et restauration testée, revue et confirmation de la cible de **préproduction**, la personne autorisée peut appliquer séparément le seul fichier SQL de quota avec son client PostgreSQL configuré de manière privée, par exemple :

  ```bash
  psql -X --set ON_ERROR_STOP=1 --file db/migrations/20261027_register_rate_limit.sql
  ```

  La commande ne montre pas de paramètres de connexion ; vérifier la cible par une méthode privée avant de la lancer et ne jamais copier de secrets ou d'erreurs brutes dans un ticket ou une conversation. Le fichier contient sa propre transaction.
- Vérifier sur cette préproduction les rôles, les droits, la réapplication, la protection contre la concurrence, le traitement d'une panne et l'adresse réellement attribuée par le proxy. Vérifier le parcours utilisateur complet, sans données réelles ni création de comptes non nécessaires.
- Une migration de **production** n'est envisageable qu'après ces validations, une sauvegarde vérifiée, un plan de retour arrière et une autorisation explicite. Elle sera effectuée séparément par la personne autorisée, pas par les builds ni par cet agent.

## Retour arrière et limites

Si le code est déployé avant la migration ou si la base est indisponible, les inscriptions répondent 503 : ne pas contourner cette protection par un repli mémoire en production. En cas d'incident, arrêter la publication et appliquer le plan validé ; ne pas supprimer la table ni restaurer une branche réelle à l'aveugle. Revenir à l'ancien code rétablirait son ancien quota **par instance**, insuffisant contre les contournements multi-instance : cela exige une mesure compensatoire décidée par l'exploitant.

Le mot de passe oublié par e-mail, le préflight strict, les sauvegardes réellement restaurées et la conformité juridique ne sont pas validés. Les protections et les tests de ce document ne constituent pas une autorisation de mise en production.
