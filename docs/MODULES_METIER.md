# Modules métier : première version opérationnelle

Les modules ci-dessous sont accessibles dans **Devis & factures** (`/documents`, administrateur) et **Carnet de chantier** (`/terrain`, administrateur et agents). Chaque fiche chantier possède un lien vers son carnet filtré.

## Installation et validation

Sauvegarder la base de production puis appliquer **`npm run migrate`** avec le rôle d'administration habituel. Le schéma est idempotent et les nouvelles tables disposent toutes du RLS activé et forcé. Les références inter-tables incluent l'entreprise pour interdire les associations croisées. Redéployer l'API et l'interface ensemble ; ces changements ne sont pas déployés automatiquement par la modification du dépôt.

```sh
npm run test:all
npm run build
```

Les tests de modules métier sont exécutés par `npm test` via `tests/operations-cases.mjs`. Ils utilisent un vrai PostgreSQL et le même routeur qu'en production : calculs, transitions, droits, isolation, rapprochements et concurrence sur le stock.

Test navigateur supplémentaire (Linux x64, Node 22 ; Chromium fourni par npm, pas de téléchargement externe de navigateur) :

1. `npm run dev` : API locale, migration et PostgreSQL local.
2. `npm run build`, puis dans un autre terminal `npm run preview -- --port 4173`.
3. `npm run test:browser`.

Ce test cible exclusivement `localhost:4173`. Il crée une entreprise fictive dans la base locale, ouvre les formulaires, crée et accepte un devis, saisit un journal et une présence sans réseau, recharge la page hors ligne puis vérifie la synchronisation sans doublon. Les éventuelles captures d'erreur sont ignorées par Git dans `.arena/`. Le test navigateur est séparé de `test:all` car il requiert les serveurs locaux.

## 1. Devis, bibliothèque et facturation

### Parcours

1. Ajouter si nécessaire des prix réutilisables : libellé, unité, prix de vente, coût prévu.
2. Créer un devis pour un chantier existant ou sans chantier. Ajouter les postes, quantités (3 décimales maximum), prix, coûts et taux de taxe.
3. Modifier le brouillon au besoin. **Émettre** le devis : les montants sont alors figés.
4. Enregistrer l'accord réellement reçu du client : nom, référence du document signé/courrier/e-mail et date de début. Si aucun chantier n'existe, il est créé automatiquement (quota contrôlé). Son budget initial reprend le total du devis ; il reste possible de le modifier dans la fiche.
5. Créer une facture d'acompte, une situation ou un solde.
6. Déclarer le règlement depuis la facture avec date, référence et justificatif éventuel. Ce règlement apparaît aussi dans les encaissements du chantier.
7. Télécharger les documents PDF. Pour annuler une facture non réglée, émettre un avoir intégral ; la facture originale est conservée.

### Calcul des situations

- Acompte : le pourcentage demandé est une **nouvelle fraction du devis**.
- Situation : le pourcentage est un **avancement cumulé** ; le logiciel retire le cumul déjà facturé, acomptes inclus.
- Solde : montant du devis moins le montant déjà facturé, net des avoirs.
- Les bases et taxes sont arrondies au FCFA par calcul entier ; la facture de solde reprend les résidus d'arrondi.
- Exemple sans taxe : devis 1 000 000 ; acompte 30 % = 300 000 ; situation 60 % = **300 000 supplémentaires**, pas 600 000 ; solde = 400 000.
- Un règlement ne peut pas dépasser le solde de la facture. Les paiements déjà saisis ailleurs dans l'application ne sont **pas automatiquement affectés** aux nouvelles factures : ne pas les ressaisir. Le rapprochement de ces anciens règlements reste à traiter avec le support avant utilisation du module sur un historique existant.

### Limites explicites

- **Pas de signature électronique certifiée** : l'accord est consigné manuellement, sans usurper une validation client autonome.
- **Pas de raccordement FNE/DGI** : les mentions (RCCM, NCC, régime fiscal) sont celles de l’entreprise existante. Elles ne certifient pas le PDF auprès de la DGI. Voir [Gestion avancée](GESTION_AVANCEE.md).
- Un seul devis accepté par chantier. Pas encore de gestion des avenants, remises, retenues de garantie, avoirs partiels ou remboursements.
- Les avoirs sur factures déjà réglées sont refusés : pas de remboursement implicite.
- Les documents et règlements affectés sont conservés, pas supprimés. Les montants des règlements affectés sont verrouillés dans l'ancienne API.
- Pas encore d'envoi automatique d'e-mails, SMS ou WhatsApp, ni de paiement client en ligne. SasPay reste réservé à l'abonnement du logiciel.
- Les indicateurs commerciaux portent sur tous les documents ; la liste affiche les 500 plus récents.

## 2. Avances de caisse

L'administrateur confie une avance à un compte actif, avec chantier, objet, date et référence. Le bénéficiaire ou l'administrateur justifie les utilisations avec catégorie, montant, date, référence et pièce facultative. Seul l'administrateur atteste une restitution reçue et clôture l'avance.

`Reliquat = montant confié - dépenses imputées - restitutions enregistrées`.

- Un dépassement est refusé.
- Une clôture avec un reliquat non nul est refusée.
- Le transfert initial et la restitution ne sont **pas** ajoutés aux dépenses du chantier. Chaque utilisation crée une seule dépense réelle.
- Les dépenses générées sont verrouillées contre les modifications/suppressions de l'ancienne API pour éviter de fausser le rapprochement.
- Un agent ne consulte que ses propres avances, sans voir celles des autres agents.
- Une clôture atteste une validation interne de la direction, pas une certification de l'authenticité des justificatifs.

## 3. Présences et coût de main-d'œuvre

L'administrateur crée un répertoire d'ouvriers, sans compte de connexion supplémentaire. Nom, métier et coût journalier sont distincts des comptes agents. Un agent saisit une durée par ouvrier, date et chantier.

- Base de calcul **8 heures / jour** : convention d'estimation du logiciel, pas une règle légale de paie.
- Une seule présence par ouvrier et par jour (les journées réparties entre plusieurs sites ne sont pas encore prises en charge).
- La direction valide ou refuse. Une saisie refusée peut être corrigée en saisissant à nouveau la même journée ; la durée/coût/chantier sont remplacés et repassent en attente.
- La validation crée exactement une dépense de main-d'œuvre ; la présence en attente ne crée pas encore de dépense.
- Les tarifs du répertoire et les coûts de présence sont masqués aux agents dans le carnet. Les droits existants sur la consultation des dépenses chantier restent inchangés.
- Pas de bulletin de salaire, de cotisations, d'indemnités légales ni d'automatisation des majorations. Une présence validée n'est **pas** un salaire payé.
- La correction d'une présence déjà validée ou d'une dépense générée n'est pas encore gérée : vérifier avant validation.

## 4. Journal photo et compte rendu

Chaque note contient date, travaux/incident, commentaire, avancement global déclaré, auteur et photo JPEG/PNG facultative (2 Mo maximum). Les photos sont contrôlées côté serveur et ne sont servies qu'aux utilisateurs de la même entreprise.

Le filtre chantier permet de télécharger un **compte rendu terrain PDF** : 15 dernières notes avec photos et jusqu'à 100 tâches/réserves. Ce document n'est pas un procès-verbal de réception signé. Les notes sont conservées : une correction se fait en ajoutant une nouvelle note, pas en réécrivant une observation passée.

## 5. Tâches, planning simple et réserves

Tâche ou réserve, responsable, échéance, description, états À faire → En cours → Terminée → Validée. La vue par colonnes est un **planning simple de tâches**, pas un planning de charge/Gantt. La vue Gantt distincte est disponible dans Gestion avancée.

L'agent peut créer une tâche pour lui-même et mettre à jour ce qui lui est affecté. La direction peut affecter à un autre compte et valider une correction terminée. Une réserve n'est donc pas automatiquement considérée comme validée dès que l'agent la déclare terminée.

Pas encore de calendrier d'équipe, de dépendances de tâches, de notifications push, d'annotation de plans, de BIM ou de PV de réception signé.

## 6. Achats et stock simple par chantier

1. La direction crée un article : unité et seuil minimum.
2. Un agent ou la direction demande un achat : chantier, article, quantité, prix unitaire, fournisseur et date de livraison souhaitée.
3. La direction approuve ou refuse.
4. Une commande approuvée peut être réceptionnée **en totalité**, avec référence et pièce facultative.
5. La réception crée une dépense et augmente le stock du chantier. La consommation réduit le stock ; un retour d'inutilisé peut réaugmenter le disponible dans la limite de ce qui a été consommé.

Le coût est affecté au chantier à la **réception**, sans deuxième dépense lors de la consommation. Les achats approuvés non réceptionnés restent affichés comme engagements distincts des dépenses. Les sorties concurrentes sont sérialisées pour empêcher les stocks négatifs.

Limites : une ligne/article par commande, réception complète seulement, pas de comparatif fournisseurs, de factures fournisseurs à payer, de transferts inter-chantiers ou d'inventaire comptable valorisé. Un seuil n'est affiché que pour un article ayant déjà des mouvements sur le chantier. Le module quantitatif multi-dépôts distinct est présenté dans [Gestion avancée](GESTION_AVANCEE.md). Le « retour » est un retour d'inutilisé au stock de ce chantier, **pas** un remboursement fournisseur.

## 7. Hors connexion : périmètre et sécurité

Disponible pour le **journal et les présences** uniquement. En production, le service worker met en cache les fichiers publics de l'application, jamais les réponses `/api`, les factures ou les photos déjà stockées sur le serveur.

Préparer l'appareil en se connectant et en ouvrant le carnet et le filtre chantier souhaité une première fois avec du réseau. Le mode de développement Vite ne charge pas de service worker ; tester le rechargement hors ligne avec la version construite (`npm run preview`). En production, HTTPS est requis.

- Copie locale des métadonnées terrain en IndexedDB, sans tarifs ouvriers ni caisse. Les photos nouvellement saisies hors ligne peuvent être conservées dans la file, pas les photos déjà consultées du serveur.
- Identité locale minimale conservée dans l'onglet pendant 24 heures au maximum pour rouvrir le carnet sans réseau. Elle ne donne aucun droit serveur et ne permet pas de connexion initiale hors ligne. Au démarrage hors ligne, les autres pages sont redirigées vers le carnet.
- Maximum de 50 saisies en attente par compte/appareil ; stockage limité par le navigateur. Le bandeau distingue stockage local et enregistrement serveur.
- Synchronisation à la reconnexion ou au bouton, après vérification de l'identité serveur. Les requêtes gardent leur UUID ; la base évite les doublons. Un même UUID et un contenu différent sont refusés.
- Les règles actuelles du serveur restent prioritaires : espace suspendu, abonnement expiré, chantier archivé, ouvrier déjà pointé, session expirée… Une erreur ne doit pas être interprétée comme une synchronisation réussie ; les saisies restent dans la file avec le message d'erreur. Après reconnexion au même compte, retenter ou supprimer explicitement la saisie locale.
- Les données locales ne sont pas chiffrées. Utiliser un appareil personnel protégé. La déconnexion nécessite le réseau pour révoquer la session et demande confirmation avant de supprimer les copies et saisies locales. Ne pas effacer les données du navigateur avant synchronisation.
- Pas de synchronisation financière hors ligne, de géolocalisation, de pointage biométrique ni de notifications en arrière-plan.

## Pilotage et sauvegardes

La fiche chantier distingue désormais devis accepté, facturation nette des avoirs, règlements affectés, achats approuvés non réceptionnés, main-d'œuvre en attente de validation et réserves ouvertes.

**Aucun de ces indicateurs n'est une marge comptable certifiée.** Les dépenses historiques n'ont pas de ventilation fiscale complète ; un coût prévu nul peut simplement signifier « non renseigné ». Le solde des flux saisis n'est pas un bénéfice, et les commandes engagées ne sont pas des paiements fournisseurs constatés.

La sauvegarde JSON complète inclut les nouveaux modules. Les photos du journal sont exportées comme métadonnées uniquement ; les télécharger séparément ou utiliser la sauvegarde PostgreSQL. Les exports CSV existants restent consacrés aux chantiers/dépenses/encaissements.
