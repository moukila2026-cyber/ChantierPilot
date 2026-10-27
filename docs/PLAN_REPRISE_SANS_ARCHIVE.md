# Plan de reprise sans archive

Le commit d'audit annoncé et son ZIP ne sont pas disponibles, et l'utilisateur ne possède pas l'archive. **Ce n'est pas un motif pour arrêter le travail ni pour lui redemander le ZIP.** Le point de départ est le code de la PR et l'[audit existant](RAPPORT_AUDIT_FINAL.md). Les corrections à reconstruire doivent être conçues et testées comme de nouveaux changements : leur identité avec le patch perdu ne peut pas être garantie.

## Étapes techniques

1. **Protéger les données et les diagnostics** : tests uniquement sur bases PostgreSQL temporaires et comptes fictifs ; ne jamais afficher secrets ou détails d'erreurs bruts. Les journaux techniques et la sonde de santé ont été renforcés ; la sonde ne constitue pas un préflight de production.
2. **Migration et quota : partiellement réalisés.** Une migration distincte ajoute la limitation d'inscription partagée ; elle a été testée sur une base jetable avec concurrence, deux processus, réapplication et échec fermé. Elle n'a pas été appliquée sur une cible réelle. Les autres migrations manquantes restent à concevoir ; examiner séparément la migration générale qui modifie certains essais et touche temporairement au RLS forcé. Faire valider sauvegarde, restauration et procédure avant toute cible réelle ; voir [migration et préproduction](MIGRATIONS_ET_PREPROD.md).
3. **Reconstruire l'authentification manquante** : mot de passe oublié par e-mail, jetons temporaires à usage unique, stockage sécurisé, messages ne révélant pas si un compte existe, expiration et invalidation des sessions, limites persistantes adaptées aux instances multiples. Tester les scénarios de succès, expiration, réutilisation, échec d'envoi, abus et cloisonnement ; ne configurer aucun fournisseur réel pendant les tests.
4. **Reconstruire un préflight réel** : contrôler les prérequis effectivement implémentés, la base et les droits sans exposer de valeur ; ne jamais annoncer « prêt » lorsque les contrôles nécessaires manquent. Compléter l'API de santé avec un signal de disponibilité complet fiable avant d'attendre un succès du moniteur en mode strict.
5. **Compléter les parcours métier demandés** : examiner les besoins et formats réels pour DQE/BGP et XLSX/DOCX ; implémenter et tester les fonctionnalités convenues sans confondre l'import BPU CSV avec les autres formats. Ne pas inventer de spécification ou de données juridiques.
6. **Finir l'inventaire** : reprendre les 477 occurrences encore à vérifier et les états partiels, avec rôles, entreprises distinctes, erreurs en français, console, navigation clavier, tailles desktop et mobile, téléchargements et formulaires. Garder les statuts honnêtes et ajouter des tests Playwright robustes sur données fictives.
7. **Relancer les contrôles** après chaque série de modifications : installation propre, compilation, tests complets, navigateur, audit des dépendances et, lorsqu'il existera réellement, préflight strict. Les deux contrôles `quality` du commit `e219afc` ont échoué sur GitHub malgré les tests locaux réussis ; leurs détails ne sont pas accessibles depuis ce sandbox. Mettre à jour la PR, vérifier les nouveaux contrôles et ne pas présenter la production comme prête avant les prérequis.

## Décisions et informations qui resteront nécessaires de la part de l'utilisateur

- Les informations juridiques exactes de l'entreprise et une revue par un juriste ivoirien ; vérifier ensuite les démarches applicables auprès de l'ARTCI. Aucun texte ne doit inventer ces informations.
- Le choix du transport e-mail et sa configuration privée ; ne jamais demander ni publier les valeurs des clés.
- La séparation effective des bases Preview, préproduction et production, une offre Vercel adaptée à l'usage commercial, le domaine et l'alignement des configurations.
- Une sauvegarde Neon et un exercice de restauration isolé, puis une migration de préproduction validée avant toute migration de production réalisée par l'utilisateur.
- La supervision et les alertes, les contrôles finaux, puis son autorisation explicite avant toute fusion susceptible de mettre la production à jour.
