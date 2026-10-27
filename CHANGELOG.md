# Journal des modifications

## Non publié — reprise du 27 octobre 2026

### Sécurité et fiabilité
- Mise à jour de Zod vers une version corrigée de l’avis GHSA-mrhx-c7xc-m3w5 ; messages de validation par défaut en français et tests des collections surdimensionnées.
- Rejet des dates calendaires impossibles avant l’enregistrement.
- Neutralisation des cellules texte pouvant être interprétées comme formules dans les exports CSV, sans modifier les données enregistrées.
- Le journal de migration ne publie plus de chaîne de connexion ni les détails bruts d’une erreur de pilote.
- Les suites npm s'exécutent avec un environnement enfant minimal sans configuration applicative héritée ; le mode test ne charge pas `.env`. PostgreSQL et les ports de test sont éphémères ; les anciens répertoires locaux ne sont plus effacés par les suites RLS et API.

### Parcours
- Remplacement de 17 boutons imbriqués dans des liens par de véritables liens conservant leur présentation ; tests de navigation, clavier, PDF et mobile.
- Un agent ne voit plus le raccourci terrain menant aux documents réservés aux administrateurs.
- L'export JSON est identifié comme partiel : il ne remplace pas une sauvegarde serveur et exclut notamment les pièces jointes.
- La réinitialisation du mot de passe d’un agent conserve le formulaire en cas d’échec et évite les soumissions simultanées ; une panne de chargement de l’équipe est signalée.
- L’import BPU CSV ne transforme plus silencieusement les prix invalides, signale les lignes et les dépassements, accepte les champs CSV entre guillemets et les unités à un caractère. Ce n’est pas un import DQE/BGP.

### Vérification et documentation
- Ajout de parcours navigateur isolés sur inscription, mobile, rôles, entreprises, exports et erreurs ; intégration des suites navigateur supplémentaires et de l’audit de dépendances à la CI.
- Inventaire statique et état de couverture dans `docs/INVENTAIRE_BOUTONS.md` ; procédure de sauvegarde clarifiée.
- **Blocages :** le commit d’audit initial et ses livrables ne sont pas disponibles. La migration courante n'est pas purement additive : elle met à jour certains essais et modifie temporairement le RLS ; elle doit être revue avant toute exécution réelle. Les fonctionnalités manquantes et les autres prérequis restent à traiter ; cette reprise ne constitue pas une validation de production.
