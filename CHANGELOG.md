# Journal des modifications

## Non publié — reprise du 27 octobre 2026

### Sécurité et fiabilité
- Mise à jour de Zod vers une version corrigée de l’avis GHSA-mrhx-c7xc-m3w5 ; messages de validation par défaut en français et tests des collections surdimensionnées.
- Rejet des dates calendaires impossibles avant l’enregistrement.
- Neutralisation des cellules texte pouvant être interprétées comme formules dans les exports CSV, sans modifier les données enregistrées.
- Les journaux de migration et d'erreurs API ne publient plus de chaîne de connexion, détails ni objets d'erreur bruts ; seuls certains codes techniques non sensibles sont conservés.
- Quota d'inscription partagé en base : dix tentatives par IP sur une heure glissante, contrôles atomiques, 429 avec délai, refus sûr si le dispositif est indisponible. Migration distincte et tests isolés ; application réelle non effectuée. Les premières requêtes concurrentes partagent désormais l'initialisation du pool PostgreSQL.
- Le build Vercel n'accède plus automatiquement à la base et ne déclenche plus de sauvegarde ou migration. Le diagnostic historique est limité aux tests locaux explicitement confirmés ; sa copie de tables n'est pas une sauvegarde complète.
- Les suites npm s'exécutent avec un environnement enfant minimal sans configuration applicative héritée ; le mode test ne charge pas `.env`. PostgreSQL et les ports de test sont éphémères ; les anciens répertoires locaux ne sont plus effacés par les suites RLS et API.

### Parcours
- Remplacement de 17 boutons imbriqués dans des liens par de véritables liens conservant leur présentation ; tests de navigation, clavier, PDF et mobile.
- Un agent ne voit plus le raccourci terrain menant aux documents réservés aux administrateurs.
- L'export JSON est identifié comme partiel : il ne remplace pas une sauvegarde serveur et exclut notamment les pièces jointes.
- La réinitialisation du mot de passe d’un agent conserve le formulaire en cas d’échec et évite les soumissions simultanées ; une panne de chargement de l’équipe est signalée.
- L’import BPU CSV ne transforme plus silencieusement les prix invalides, signale les lignes et les dépassements, accepte les champs CSV entre guillemets et les unités à un caractère. Ce n’est pas un import DQE/BGP.

### Vérification et documentation
- Ajout de parcours navigateur isolés sur inscription, mobile, rôles, entreprises, exports et erreurs ; intégration des suites navigateur supplémentaires et de l’audit de dépendances à la CI. Les annotations CI d'échec masquent les journaux et valeurs de fixtures.
- Test spécifique du quota sur deux processus API et PostgreSQL jetable, y compris concurrence, réapplication, nettoyage, rôles et panne. Procédure de préproduction ajoutée ; l'état des anciennes exécutions CI doit être recontrôlé.
- Inventaire statique et état de couverture dans `docs/INVENTAIRE_BOUTONS.md` ; procédure de sauvegarde clarifiée.
- Ajout d'une sonde `npm run monitor` sans affichage de cible : contrôle de santé limité et mode strict qui échoue tant que l'API n'atteste pas explicitement sa disponibilité complète. Cette sonde ne remplace pas un préflight.
- **Limites :** le commit d’audit initial et ses livrables ne sont pas disponibles et l'utilisateur ne possède pas d'archive ; poursuivre en reconstruisant et testant les éléments requis, sans prétendre retrouver le patch à l'identique. La migration courante n'est pas purement additive : elle met à jour certains essais et modifie temporairement le RLS ; elle doit être revue avant toute exécution réelle. Cette reprise ne constitue pas une validation de production.
