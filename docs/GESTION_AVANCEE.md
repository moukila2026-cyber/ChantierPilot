# Gestion avancée — périmètre et mise en service

> **Prudence — migration non validée pour une cible réelle.** Les commandes historiques ci-dessous ne doivent pas être lancées sur une base réelle sans revue, sauvegarde, restauration testée et autorisation. Le chemin général peut modifier des essais et des droits ; suivre d'abord [migration et préproduction](MIGRATIONS_ET_PREPROD.md). Le build ne lance plus de migration automatique.

Menu **Gestion avancée**, route `/gestion`. Modules actifs : plans PDF/images (pas de BIM 3D), Gantt et stocks multi-dépôts. La paie et la signature électronique certifiée ont été retirées à la demande du propriétaire.

## Déploiement

Après sauvegarde, restauration testée et revue de la migration générale, valider la préproduction avant tout redéploiement de l'API et de l'interface. Tables métier avec RLS forcé et clés étrangères composites entreprise/identifiant ; aucune nouvelle fonction Vercel indépendante. Les commandes utilisent le verrou d’entreprise et la déduplication existants. Les tests utilisent PostgreSQL isolé : `npm run test:all`, puis `npm run build` et `npm run test:browser`.

## Plans PDF/images versionnés

- L’administrateur importe un PDF, PNG ou JPEG (2 Mo maximum), avec chantier, nom et révision. Une révision existante n’est pas écrasée. Empreinte SHA-256 conservée ; elle établit l’intégrité des octets stockés, **pas une certification**.
- PDF.js rend la page dans le navigateur. Worker, polices, tables CMap et décodeurs sont servis localement, sans CDN. Évaluation JavaScript PDF désactivée ; rendu de chaque page borné à 2 500 × 3 500 pixels au maximum. Les originaux sont protégés par la session et le RLS, avec réponse sans cache.
- Cliquer sur le plan pour placer une observation, ou utiliser le bouton accessible « Ajouter un repère au centre ». Les coordonnées normalisées restent attachées à la page et à cette révision. Chaque utilisateur de l’entreprise peut ajouter une observation ; seule la direction la marque résolue.
- Les repères d’une révision ne sont pas reportés automatiquement sur une nouvelle révision. L’original téléchargeable ne contient pas les annotations. Pas encore d’export PDF aplati ou de fusion avec le compte rendu du carnet.
- Ce module est en ligne uniquement. Les annotations ne sont pas encore liées aux tâches/réserves du carnet. Il ne prétend pas lire les maquettes IFC, Revit, DWG ou effectuer des métrés BIM.

## Planning Gantt

La direction crée les tâches : chantier, début, fin incluse, responsable actif, progression 0–100 % et prédécesseur facultatif. La vue trace les barres proportionnellement aux dates, avec progression superposée et dates lisibles, y compris sur mobile. Filtre chantier disponible.

- Une seule dépendance fin → début par tâche ; le début doit suivre strictement la fin du prédécesseur.
- Prédécesseur du même chantier et absence de boucle contrôlés par l’API.
- Une modification qui retarderait un prédécesseur au-delà du début de ses successeurs est refusée. Déplacer d’abord les successeurs.
- Pas de déplacement des dates par glisser-déposer, d’ordonnancement automatique, de chemin critique, de calendrier des jours fériés ou de calcul de charge. Les tâches Gantt et les tâches/réserves du carnet sont pour l’instant deux listes distinctes.
- Les agents consultent le planning ; la modification reste réservée à la direction.

## Stocks multi-dépôts

Répertoire des dépôts (nom, adresse), réutilisation des articles du carnet. La direction saisit :

1. **Entrée** : source vide, dépôt destination renseigné, chantier vide.
2. **Transfert** : source et destination distinctes, chantier vide.
3. **Sortie externe** : source renseignée, destination et chantier vides.
4. **Livraison chantier** : source renseignée, destination vide, chantier actif renseigné.

Chaque mouvement exige quantité (3 décimales maximum) et référence/motif. Le disponible est recalculé depuis tous les mouvements ; la liste affiche les 500 derniers. Les transferts sont atomiques et les sorties concurrentes ne peuvent pas rendre le stock négatif. La livraison chantier crée aussi une entrée dans son stock existant, sans deuxième dépense.

**Périmètre quantitatif, pas comptable** : pas de valorisation FIFO/coût moyen, pas de facture fournisseur ou de dépense créée par une entrée de dépôt. Les achats destinés aux dépôts sont à comptabiliser séparément ; ne pas les saisir aussi comme une réception chantier. Les mouvements sont conservés, pas effacés. Pas encore de retour chantier → dépôt, de réception d’achat directement en dépôt, d’inventaire valorisé ou de ventilation automatique du coût dépôt vers chantier. Les agents consultent les stocks mais ne passent pas ces mouvements.

## Fonctionnement sans paie ni signature certifiée

Ces deux modules ont été supprimés de l’interface et des traitements métier de l’API, pas simplement masqués. Les anciens liens d’onglets reviennent à la vue Plans ; l’ancien téléchargement de bulletin répond HTTP 410. Les anciennes commandes de paie ne sont plus acceptées. Aucun prestataire ni statut de signature n’est exposé par l’API.

Le parcours chantier reste autonome :

- **Main-d’œuvre** : répertoire d’ouvriers, présences, contrôle et validation de leur coût par la direction. Le coût validé alimente les dépenses une seule fois. Cela ne génère ni bulletin ni paiement de salaire.
- **Gestion de paie externe** : le comptable ou le prestataire de l’entreprise reste chargé des bulletins, cotisations et règlements. Les coûts déjà imputés par les présences ne doivent pas être ressaisis dans les dépenses. Les autres charges non encore imputées peuvent être enregistrées séparément avec leur référence/justificatif selon le suivi de l’entreprise ; aucune réconciliation comptable automatique n’est revendiquée.
- **Accord client** : PDF du devis transmis par les moyens habituels, signature papier ou accord par e-mail/courrier obtenu à l’extérieur, puis enregistrement du nom et de la référence de l’accord dans le devis. Conserver l’original de l’accord hors de l’application. Le devis accepté reste relié au chantier et aux factures. Ce parcours n’est pas présenté comme une signature électronique certifiée.
- Les devis, factures, encaissements, avances, plans, Gantt, stocks et saisies terrain hors ligne ne dépendaient pas de ces deux modules et sont conservés.

### Données historiques

Aucune table contenant d’éventuelles données de paie n’est détruite. Les tables historiques `payroll_profiles` et `payroll_slips` restent isolées par RLS et disponibles uniquement dans l’export complet administrateur et les sauvegardes PostgreSQL. Elles ne sont plus lues ni modifiées par les parcours métier. Leur maintien technique évite la suppression de ces tables et préserve leur récupération, sans réactiver les fonctionnalités ; la migration dans son ensemble doit néanmoins être revue avant toute exécution réelle. La suppression définitive de ces archives nécessiterait une décision distincte après sauvegarde et contrôle des obligations de conservation.

## Entreprises immatriculées et factures officielles

L’entreprise n’a pas à « être constituée une seconde fois ». Les paramètres acceptent désormais **RCCM, numéro de compte contribuable et régime fiscal**, repris sur les documents commerciaux PDF.

Cela ne remplace pas le mécanisme de normalisation de la facture. La FAQ DGI distingue génération directe FNE/RNE, interfaçage API et TERNE :
https://www.fne.dgi.gouv.ci/faq.php

ChantierPilot ne transmet pas encore de facture à la DGI et ne délivre aucun identifiant/QR de certification FNE. Utiliser le circuit officiel applicable pour les factures concernées. Le logiciel ne doit donc pas afficher « facture certifiée » au seul motif que l’entreprise a renseigné son NCC. L’intégration FNE est un raccordement distinct de la signature électronique et des mentions de l’émetteur.

## Sauvegarde

L’export JSON administrateur contient métadonnées de plans, annotations, planning, dépôts et mouvements. Les éventuelles archives de paie antérieures au retrait restent dans la sauvegarde complète. Il contient des données personnelles sensibles : stockage protégé requis. Les octets des plans ne figurent pas dans le JSON ; télécharger les originaux séparément ou sauvegarder PostgreSQL. Les plans et les archives de paie ne sont pas mis en cache hors ligne par l’application.
