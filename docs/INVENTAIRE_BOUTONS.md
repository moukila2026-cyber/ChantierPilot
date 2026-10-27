# Inventaire des interactions — état partiel du 27 octobre 2026

> **Non prêt pour la production.** Le commit de corrections attendu et son patch sont absents. Cet inventaire porte uniquement sur l’arbre disponible et ne prouve pas que chaque action fonctionne dans tous les rôles, entreprises, erreurs et tailles d’écran.

## Légende et méthode

- **OK — … (partiel)** : action effectivement exercée dans le scénario cité, sans extrapoler aux autres états.
- **Corrigé — …** : modification de cette session avec retest indiqué ; les autres états restent à vérifier.
- **À vérifier** : présent dans le code, mais pas suffisamment testé pour être déclaré OK.
- **Absent / bloquant** : fonctionnalité requise absente de l’arbre disponible ; ce n’est pas « non applicable ».
- **Non applicable** : uniquement les anciens modules paie/signature déjà retirés avant cette session ; leurs anciens liens ont été contrôlés.

Les lignes ci-dessous sont extraites de l’AST JSX : boutons, liens, formulaires, champs, options, modales, gestionnaires et champs métier dynamiques repérables. Une ligne de composant peut produire plusieurs commandes selon les données ; les menus dynamiques importants sont détaillés ci-après. Les lignes et libellés sont des repères de code, pas une preuve de clic. La couverture effective figure dans les suites `test:all` et `test:browser`.

## Routes et éléments attendus

| Périmètre | État observé |
| --- | --- |
| Accueil, connexion, inscription, offres, CGU, 404 | Présents ; certains liens et formulaires testés ; reste à vérifier. |
| Tableau de bord, chantiers, fiche, dépenses, encaissements, photos, terrain, gestion, paramètres | Présents ; parcours critiques partiellement testés, y compris mobile. |
| Console opérateur | Présente ; autorisations API couvertes par l’intégration, interactions UI à compléter. |
| Mot de passe oublié / réinitialisation par e-mail | **Absent / bloquant** sur cet arbre. La réinitialisation d’un agent par son administrateur est distincte et a été testée. |
| Mentions légales complètes et politique de confidentialité dédiée | **Absentes / bloquantes** ; les CGU présentes indiquent elles-mêmes qu’une politique dédiée et l’identité juridique sont à compléter. |
| Export PDF | Présent ; rapport et PV téléchargés au clavier ; tous les modèles et états ne sont pas vérifiés. |
| Exports CSV / JSON | Les cinq liens des paramètres ont été téléchargés et vérifiés en environnement fictif ; autres rôles et erreurs à compléter. |
| Exports XLSX / DOCX | **Absents / bloquants** si requis par la mission ; aucun lien ou générateur identifié dans cet arbre. |
| Import BPU CSV | Corrigé et partiellement testé ; le blocage des montants invalides, les guillemets et l’unité courte sont couverts. |
| Import DQE / BGP | **Absent / bloquant** : ne pas confondre avec le BPU CSV actuel. |
| Modules paie et signature certifiée | Non applicable : déjà retirés sur la base de départ ; anciens liens testés par `test:browser`. |

## Menus et commandes générés dynamiquement

| Groupe | Éléments | État |
| --- | --- | --- |
| Navigation métier | Tableau de bord ; Chantiers ; Devis & factures ; Dépenses ; Encaissements ; Photos & reçus ; Carnet de chantier ; Gestion avancée ; Paramètres ; Offres & tarifs ; console opérateur selon droits. | Mobile, Paramètres testé ; autres liens et combinaisons à compléter. |
| Barre mobile | Accueil ; Chantiers ; Photos ; Terrain ; Dépenses ; menu. | Menu et navigation ciblée testés ; autres commandes à compléter. |
| Raccourcis de recherche | Nouveau chantier ; Nouveau devis ; Journal photo ; Planning & réserves ; Avances de caisse ; Présences & ouvriers ; Achats & stock ; Plans annotés ; Planning Gantt ; Stocks multi-dépôts. | Profondeur et permissions à compléter. |
| Terrain | Journal photo ; Planning & réserves ; Avances de caisse ; Présences ; Achats & stock. | Journal et présences/hors ligne testés ; autres parcours UI à compléter. |
| Gestion avancée | Plans annotés ; Planning Gantt ; Multi-dépôts. | Création/modification Gantt, dépôt et repère sur PDF testés ; autres actions à compléter. |
| Paramètres / exports | Chantiers CSV ; Dépenses CSV ; Encaissements CSV ; Export complet CSV ; Export JSON (partiel). | Les cinq téléchargements ont été exercés par un administrateur fictif ; autres états à vérifier. |
| Offres | Essayer 14 jours, un lien par offre ; Payer avec SasPay selon forfait et rôle. | Essai testé ; aucun paiement réel ; fournisseur simulé uniquement côté tests API. |

## Relevé statique (500 occurrences)

### src/components/AttachmentPreviewModal.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 27 | Modal | − / % / + / ↻ Pivoter / Réinitialiser / Document PDF haute définition / Nouvel onglet ↗ / ⬇ Télécharger | À vérifier |
| 32 | Button | − | À vérifier |
| 38 | Button | + | À vérifier |
| 41 | Button | ↻ Pivoter | À vérifier |
| 45 | Button | Réinitialiser | À vérifier |
| 54 | a | Nouvel onglet ↗ | À vérifier |
| 62 | a | ⬇ Télécharger | À vérifier |
### src/components/BusinessForm.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 12 | form | Annuler | À vérifier |
| 22 | FileField | Dynamique / sans libellé statique | À vérifier |
| 33 | Select | Sélectionner… | À vérifier |
| 34 | option | Sélectionner… | À vérifier |
| 35 | option | Dynamique / sans libellé statique | À vérifier |
| 38 | Textarea | Dynamique / sans libellé statique | À vérifier |
| 40 | Input | Dynamique / sans libellé statique | À vérifier |
| 56 | Button | Annuler | À vérifier |
| 57 | Button | Dynamique / sans libellé statique | À vérifier |
### src/components/ErrorBoundary.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 34 | button | Recharger la page | À vérifier |
### src/components/forms.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 34 | input | Dynamique / sans libellé statique | À vérifier |
| 43 | input | Dynamique / sans libellé statique | À vérifier |
| 60 | button | retirer | À vérifier |
| 77 | form | Annuler / Enregistrer / Ajouter la dépense | À vérifier |
| 83 | Select | Chantier | À vérifier |
| 84 | option | Chantier | À vérifier |
| 90 | Select | Catégorie | À vérifier |
| 91 | option | Catégorie | À vérifier |
| 95 | Input | Montant (FCFA) | À vérifier |
| 101 | Input | Date | À vérifier |
| 104 | Input | Fournisseur | À vérifier |
| 108 | Textarea | Description | À vérifier |
| 111 | FileField | Justificatif (facultatif) | À vérifier |
| 119 | Button | Annuler | À vérifier |
| 120 | Button | Enregistrer / Ajouter la dépense | À vérifier |
| 136 | form | Annuler / Enregistrer / Enregistrer l'encaissement | À vérifier |
| 142 | Select | Chantier | À vérifier |
| 143 | option | Chantier | À vérifier |
| 149 | Input | Client | À vérifier |
| 152 | Input | Montant (FCFA) | À vérifier |
| 158 | Input | Date | À vérifier |
| 161 | Select | Mode de paiement | À vérifier |
| 162 | option | Mode de paiement | À vérifier |
| 168 | Input | Référence (obligatoire) | À vérifier |
| 172 | Textarea | Mémo | À vérifier |
| 174 | FileField | Justificatif (facultatif) | À vérifier |
| 182 | Button | Annuler | À vérifier |
| 183 | Button | Enregistrer / Enregistrer l'encaissement | À vérifier |
### src/components/Layout.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 179 | input | Rechercher une rubrique | À vérifier |
| 193 | button | Effacer la recherche | À vérifier |
| 209 | NavLink | Console SHOPIN30 / → → /shopin30 | À vérifier |
| 233 | NavLink | Dynamique / sans libellé statique | À vérifier |
| 263 | button | Dynamique / sans libellé statique | À vérifier |
| 308 | button | Se déconnecter | À vérifier |
| 324 | button | Ouvrir le menu | À vérifier |
| 346 | div | Dynamique / sans libellé statique | À vérifier |
| 353 | button | Fermer le menu | À vérifier |
| 361 | button | Se déconnecter | À vérifier |
| 390 | NavLink | Gérer mon forfait → → /offres | À vérifier |
| 406 | NavLink | Dynamique / sans libellé statique | À vérifier |
| 422 | button | Rubriques | À vérifier |
### src/components/Logo.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 25 | Link | ChantierPilot — accueil | À vérifier |
### src/components/PlanViewer.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 82 | Button | Page précédente | À vérifier |
| 84 | Button | Page suivante | À vérifier |
| 85 | a | Original | À vérifier |
| 91 | div | Dynamique / sans libellé statique | À vérifier |
| 120 | Button | Ajouter un repère au centre | À vérifier |
| 128 | Button | Résoudre | À vérifier |
### src/components/ui.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 37 | Link | Dynamique / sans libellé statique | À vérifier |
| 38 | a | Dynamique / sans libellé statique | À vérifier |
| 45 | button | Dynamique / sans libellé statique | À vérifier |
| 78 | input | Dynamique / sans libellé statique | À vérifier |
| 86 | input | Dynamique / sans libellé statique | À vérifier |
| 92 | button | Dynamique / sans libellé statique | À vérifier |
| 118 | select | Dynamique / sans libellé statique | À vérifier |
| 125 | textarea | Dynamique / sans libellé statique | À vérifier |
| 196 | button | Fermer | À vérifier |
| 259 | div | Dynamique / sans libellé statique | À vérifier |
| 273 | button | Fermer | À vérifier |
| 317 | Button | Page précédente | À vérifier |
| 329 | Button | Page suivante | À vérifier |
| 386 | a | +225 05 01 30 33 43 | À vérifier |
| 393 | a | Conditions générales d’utilisation → /cgu | À vérifier |
| 429 | Modal | Annuler | À vérifier |
| 432 | Button | Annuler | À vérifier |
| 433 | Button | Dynamique / sans libellé statique | À vérifier |
### src/pages/AdvancedPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 20 | champ dynamique | Chantier | À vérifier |
| 24 | champ dynamique | Tâche | À vérifier |
| 24 | champ dynamique | Début | À vérifier |
| 24 | champ dynamique | Fin incluse | À vérifier |
| 24 | champ dynamique | Avancement (%) | À vérifier |
| 24 | champ dynamique | Responsable | À vérifier |
| 24 | champ dynamique | Après la tâche (facultatif) | À vérifier |
| 28 | button | Dynamique / sans libellé statique | À vérifier |
| 29 | select | Tous les chantiers | À vérifier |
| 29 | option | Tous les chantiers | À vérifier |
| 29 | option | Dynamique / sans libellé statique | À vérifier |
| 31 | Button | + Importer un plan | À vérifier |
| 31 | champ dynamique | Nom du plan | À vérifier |
| 31 | champ dynamique | Révision (ex. A, B, indice 02) | À vérifier |
| 31 | champ dynamique | Plan PDF, JPEG ou PNG — 2 Mo maximum | À vérifier |
| 32 | select | Révision à consulter | À vérifier |
| 32 | option | Choisir un plan et sa révision… | À vérifier |
| 32 | option | · / · Rév. | À vérifier |
| 34 | PlanViewer | Dynamique / sans libellé statique | À vérifier |
| 34 | champ dynamique | Observation | À vérifier |
| 36 | Button | + Nouvelle tâche Gantt | À vérifier |
| 37 | Button | Modifier | À vérifier |
| 38 | Button | + Nouveau dépôt | À vérifier |
| 38 | champ dynamique | Nom | À vérifier |
| 38 | champ dynamique | Adresse | À vérifier |
| 38 | Button | Entrée / transfert / sortie | À vérifier |
| 38 | champ dynamique | Article (créé dans Achats & stock) | À vérifier |
| 38 | champ dynamique | Dépôt source (vide pour une entrée) | À vérifier |
| 38 | champ dynamique | Dépôt destination (vide pour une sortie) | À vérifier |
| 38 | champ dynamique | Chantier destinataire (sortie seulement) | À vérifier |
| 38 | champ dynamique | Quantité | À vérifier |
| 38 | champ dynamique | Référence / motif | À vérifier |
| 42 | Modal | Dynamique / sans libellé statique | À vérifier |
| 42 | BusinessForm | Dynamique / sans libellé statique | À vérifier |
### src/pages/DashboardPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 87 | Button | + Nouveau chantier | À vérifier |
| 91 | ButtonLink | Voir les chantiers → /chantiers | Corrigé — lien agent testé en mobile |
| 93 | Link | Tous les chantiers → /chantiers | À vérifier |
| 120 | Link | + Dépense / Achat ou frais chantier → /depenses?nouveau=1 | À vérifier |
| 124 | Link | + Encaissement / Règlement client référencé → /encaissements?nouveau=1 | À vérifier |
| 129 | Link | + Devis / facture / Chiffrage & avancement → /documents?nouveau=1 | À vérifier |
| 134 | Link | Carnet terrain / Journal photo & présences → /terrain | À vérifier |
| 138 | Link | Plans & Gantt / Plans annotés & multi-dépôts → /gestion | À vérifier |
| 174 | Button | Créer mon premier chantier | À vérifier |
| 220 | Link | Dynamique / sans libellé statique | À vérifier |
| 323 | Link | Tout voir → → /chantiers | À vérifier |
| 331 | Button | + Nouveau chantier | À vérifier |
| 332 | ButtonLink | Voir les chantiers → /chantiers | À vérifier |
| 353 | Link | Dynamique / sans libellé statique | À vérifier |
| 406 | Modal | Nouveau chantier | À vérifier |
| 411 | ProjectForm | Dynamique / sans libellé statique | À vérifier |
### src/pages/DocumentsPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 43 | form | Créer le chantier à l’acceptation / Prestations & matériaux ( / ) / Ajouter depuis mon BPU ( / )… / + Ajouter un poste / | À vérifier |
| 49 | Input | Intitulé des travaux | À vérifier |
| 52 | Select | Créer le chantier à l’acceptation | À vérifier |
| 56 | option | Créer le chantier à l’acceptation | À vérifier |
| 57 | option | Chantier existant (facultatif) | À vérifier |
| 61 | Input | Client | À vérifier |
| 64 | Input | Adresse client | À vérifier |
| 71 | Select | Ajouter depuis ma bibliothèque | À vérifier |
| 80 | option | Ajouter depuis mon BPU ( / )… | À vérifier |
| 81 | option | — / / | À vérifier |
| 91 | button | Supprimer | À vérifier |
| 96 | Input | Ex. Pose de carrelage | À vérifier |
| 100 | Input | Dynamique / sans libellé statique | À vérifier |
| 115 | Button | + Ajouter un poste | À vérifier |
| 122 | Input | Taux de taxe (%) | À vérifier |
| 125 | Input | Validité du devis | À vérifier |
| 139 | Button | Annuler | À vérifier |
| 140 | Button | Enregistrer le brouillon / Créer le brouillon | À vérifier |
| 163 | form | Colonnes attendues : / Désignation ; Unité ; Prix vente FCFA ; Coût prévu FCFA / (séparateur / ; / , / ou copier-coller  | À vérifier |
| 166 | Button | Modèle CSV | À vérifier |
| 172 | input | Charger un fichier .csv depuis votre ordinateur ou téléphone | À vérifier |
| 198 | Textarea | Ou collez / ajustez directement vos lignes BPU ci-dessous | À vérifier |
| 226 | Button | Annuler | À vérifier |
| 227 | Button | Importer / poste(s) | À vérifier |
| 300 | Button | Importer BPU (CSV) | Corrigé — validation BPU testée (partiel) |
| 303 | Button | + Devis | À vérifier |
| 323 | Input | Rechercher un document | À vérifier |
| 324 | Select | Type de document | À vérifier |
| 325 | option | Dynamique / sans libellé statique | À vérifier |
| 327 | Button | + Prix réutilisable ( / ) | À vérifier |
| 387 | a | Télécharger PDF | À vérifier |
| 390 | a | WhatsApp | À vérifier |
| 399 | Link | Voir le chantier → | À vérifier |
| 404 | Button | Dupliquer | À vérifier |
| 409 | Button | Modifier | À vérifier |
| 414 | Button | Émettre | À vérifier |
| 417 | Button | Acceptation reçue | À vérifier |
| 426 | Button | Refusé | À vérifier |
| 429 | Button | Créer une facture | À vérifier |
| 438 | Button | Enregistrer un règlement | À vérifier |
| 449 | Button | Avoir intégral | À vérifier |
| 468 | Modal | Dynamique / sans libellé statique | À vérifier |
| 471 | QuoteForm | Dynamique / sans libellé statique | À vérifier |
| 475 | BusinessForm | Dynamique / sans libellé statique | À vérifier |
### src/pages/ExpensesPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 130 | ButtonLink | 📷 Photos & reçus → /photos | Corrigé — navigation testée (rôles partiels) |
| 131 | Button | + Nouvelle dépense | À vérifier |
| 140 | Link | Aller aux chantiers → /chantiers | À vérifier |
| 154 | Input | Rechercher dans les dépenses | À vérifier |
| 162 | Button | Réinitialiser | À vérifier |
| 171 | Select | Filtrer par chantier | À vérifier |
| 172 | option | Tous les chantiers | À vérifier |
| 173 | option | Dynamique / sans libellé statique | À vérifier |
| 175 | Select | Filtrer par catégorie | À vérifier |
| 176 | option | Toutes les catégories | À vérifier |
| 177 | option | Dynamique / sans libellé statique | À vérifier |
| 179 | Input | Date de début | À vérifier |
| 180 | Input | Date de fin | À vérifier |
| 192 | Button | + Nouvelle dépense | À vérifier |
| 213 | Link | Dynamique / sans libellé statique | À vérifier |
| 223 | button | 👁 Aperçu du justificatif | À vérifier |
| 235 | a | Télécharger | À vérifier |
| 244 | Button | Modifier | À vérifier |
| 249 | Button | Supprimer | À vérifier |
| 269 | Link | Dynamique / sans libellé statique | À vérifier |
| 276 | button | 👁 Voir le justificatif | À vérifier |
| 290 | Button | Modifier | À vérifier |
| 295 | Button | Supprimer | À vérifier |
| 307 | Modal | Dynamique / sans libellé statique | À vérifier |
| 308 | ExpenseForm | Dynamique / sans libellé statique | À vérifier |
| 314 | AttachmentPreviewModal | Dynamique / sans libellé statique | À vérifier |
| 316 | ConfirmDialog | Supprimer cette dépense ? | À vérifier |
### src/pages/LandingPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 59 | a | Fonctionnalités | À vérifier |
| 60 | a | Comment ça marche | À vérifier |
| 61 | Link | Offres → /offres | À vérifier |
| 62 | Link | Se connecter → /connexion | À vérifier |
| 63 | Link | Créer mon espace → /inscription | À vérifier |
| 71 | button | Dynamique / sans libellé statique | À vérifier |
| 87 | a | Fonctionnalités | À vérifier |
| 88 | a | Comment ça marche | À vérifier |
| 89 | Link | Offres → /offres | À vérifier |
| 90 | Link | Se connecter → /connexion | À vérifier |
| 91 | Link | Créer mon espace entreprise → /inscription | À vérifier |
| 125 | Link | Créer mon espace entreprise → /inscription | À vérifier |
| 131 | Link | Se connecter → /connexion | À vérifier |
| 318 | Link | Ouvrir un compte entreprise → /inscription | À vérifier |
| 324 | Link | Consulter les offres → /offres | À vérifier |
### src/pages/LoginPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 67 | form | Connexion / Connexion en cours… / Se connecter | OK — connexion et erreur testées (partiel) |
| 71 | Input | Adresse e-mail | À vérifier |
| 79 | PasswordInput | Mot de passe | À vérifier |
| 86 | Button | Connexion en cours… / Se connecter | OK — connexion et erreur testées (partiel) |
| 94 | Link | Créer mon entreprise → /inscription | À vérifier |
### src/pages/NotFoundPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 11 | Link | Connexion → /connexion | À vérifier |
| 24 | ButtonLink | Retour au tableau de bord → / | Corrigé — clic/clavier testé (partiel) |
| 25 | ButtonLink | Offres & tarifs → /offres | Corrigé — clic/clavier testé (partiel) |
### src/pages/OperationsPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 56 | champ dynamique | Chantier | À vérifier |
| 57 | champ dynamique | Date | À vérifier |
| 58 | champ dynamique | Référence / justificatif de l’opération | À vérifier |
| 59 | champ dynamique | Montant (FCFA) | À vérifier |
| 60 | champ dynamique | Justificatif facultatif | À vérifier |
| 65 | ButtonLink | 📷 Photos & reçus → /photos | Corrigé — navigation testée (rôles partiels) |
| 65 | ButtonLink | Devis & factures → → /documents | Corrigé — navigation testée (rôles partiels) |
| 66 | select | Tous les chantiers | À vérifier |
| 66 | option | Tous les chantiers | À vérifier |
| 66 | option | Dynamique / sans libellé statique | À vérifier |
| 66 | a | Compte rendu terrain PDF | À vérifier |
| 70 | Button | Synchroniser | À vérifier |
| 70 | Button | Supprimer localement | À vérifier |
| 71 | button | Dynamique / sans libellé statique | À vérifier |
| 73 | Button | + Note terrain | À vérifier |
| 73 | champ dynamique | Travaux / incident | À vérifier |
| 73 | champ dynamique | Avancement global déclaré (%) | À vérifier |
| 73 | champ dynamique | Travaux réalisés, difficultés et prochaines étapes | À vérifier |
| 73 | champ dynamique | Photo du chantier | À vérifier |
| 74 | a | Dynamique / sans libellé statique | À vérifier |
| 76 | Button | + Planifier | À vérifier |
| 76 | champ dynamique | Type | À vérifier |
| 76 | champ dynamique | Objet | À vérifier |
| 76 | champ dynamique | Description | À vérifier |
| 76 | champ dynamique | Responsable | À vérifier |
| 76 | champ dynamique | Échéance | À vérifier |
| 77 | Button | Dynamique / sans libellé statique | À vérifier |
| 79 | Button | + Avance | À vérifier |
| 79 | champ dynamique | Bénéficiaire | À vérifier |
| 79 | champ dynamique | Objet de l’avance | À vérifier |
| 80 | Button | Ajouter une dépense | À vérifier |
| 80 | champ dynamique | Catégorie | À vérifier |
| 80 | champ dynamique | Description | À vérifier |
| 80 | Button | Restitution reçue | À vérifier |
| 80 | Button | Clôturer | À vérifier |
| 82 | Button | + Ouvrier | À vérifier |
| 82 | champ dynamique | Nom complet | À vérifier |
| 82 | champ dynamique | Métier | À vérifier |
| 82 | champ dynamique | Coût journalier (FCFA) | À vérifier |
| 82 | Button | + Présence | À vérifier |
| 82 | champ dynamique | Ouvrier | À vérifier |
| 82 | champ dynamique | Durée travaillée (minutes) | À vérifier |
| 84 | Button | Valider | À vérifier |
| 84 | Button | Refuser | À vérifier |
| 86 | Button | + Article | À vérifier |
| 86 | champ dynamique | Article | À vérifier |
| 86 | champ dynamique | Unité (sac, kg, m³…) | À vérifier |
| 86 | champ dynamique | Seuil d’alerte par chantier | À vérifier |
| 86 | Button | + Achat | À vérifier |
| 86 | champ dynamique | Article | À vérifier |
| 86 | champ dynamique | Fournisseur | À vérifier |
| 86 | champ dynamique | Quantité (jusqu’à 3 décimales) | À vérifier |
| 86 | champ dynamique | Prix unitaire (FCFA) | À vérifier |
| 86 | champ dynamique | Livraison attendue | À vérifier |
| 88 | Button | Dynamique / sans libellé statique | À vérifier |
| 89 | Button | Approuver | À vérifier |
| 89 | Button | Refuser | À vérifier |
| 89 | Button | Réceptionner | À vérifier |
| 92 | Modal | Dynamique / sans libellé statique | À vérifier |
| 92 | BusinessForm | Dynamique / sans libellé statique | À vérifier |
### src/pages/OperatorPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 45 | form | Réactiver / Suspendre les modifications de / ? / Une réactivation ne prolonge pas la période payée. Lecture et exports r | À vérifier |
| 55 | textarea | operator-reason | À vérifier |
| 65 | Button | Confirmer | À vérifier |
| 66 | Button | Annuler | À vérifier |
| 88 | Button | Réactiver / Suspendre | À vérifier |
### src/pages/PaymentsPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 131 | ButtonLink | 📷 Photos & reçus → /photos | Corrigé — navigation testée (rôles partiels) |
| 132 | Button | + Nouvel encaissement | À vérifier |
| 141 | Link | Aller aux chantiers → /chantiers | À vérifier |
| 155 | Input | Rechercher dans les encaissements | À vérifier |
| 163 | Button | Réinitialiser | À vérifier |
| 172 | Select | Filtrer par chantier | À vérifier |
| 173 | option | Tous les chantiers | À vérifier |
| 174 | option | Dynamique / sans libellé statique | À vérifier |
| 176 | Select | Filtrer par mode | À vérifier |
| 177 | option | Tous les modes | À vérifier |
| 178 | option | Dynamique / sans libellé statique | À vérifier |
| 180 | Input | Date de début | À vérifier |
| 181 | Input | Date de fin | À vérifier |
| 193 | Button | + Nouvel encaissement | À vérifier |
| 213 | Link | Dynamique / sans libellé statique | À vérifier |
| 226 | button | 👁 Aperçu | À vérifier |
| 238 | a | Télécharger | À vérifier |
| 247 | Button | Modifier | À vérifier |
| 252 | Button | Supprimer | À vérifier |
| 272 | Link | Dynamique / sans libellé statique | À vérifier |
| 281 | button | 👁 Aperçu | À vérifier |
| 295 | Button | Modifier | À vérifier |
| 300 | Button | Supprimer | À vérifier |
| 312 | Modal | Dynamique / sans libellé statique | À vérifier |
| 313 | PaymentForm | Dynamique / sans libellé statique | À vérifier |
| 319 | AttachmentPreviewModal | Dynamique / sans libellé statique | À vérifier |
| 321 | ConfirmDialog | Supprimer cet encaissement ? | À vérifier |
### src/pages/PhotosPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 244 | input | Dynamique / sans libellé statique | À vérifier |
| 247 | ButtonLink | + Créer d’abord un chantier → /chantiers?nouveau=1 | Corrigé — lien et modale testés en mobile |
| 269 | input | Dynamique / sans libellé statique | À vérifier |
| 280 | input | Dynamique / sans libellé statique | À vérifier |
| 296 | ButtonLink | + Nouveau chantier → /chantiers?nouveau=1 | Corrigé — lien et modale testés en mobile |
| 318 | button | Dynamique / sans libellé statique | À vérifier |
| 334 | Select | Filtrer les pièces par chantier | À vérifier |
| 339 | option | Tous les chantiers | À vérifier |
| 341 | option | Dynamique / sans libellé statique | À vérifier |
| 362 | button | Document PDF / Cliquer pour ouvrir l’aperçu | À vérifier |
| 409 | button | Agrandir / Zoom | À vérifier |
| 425 | Modal | ✓ Pièce prête : / 📷 Photo d’avancement du chantier (Journal photo) / 🧾 Facture / reçu d’une dépense BTP / 💰 Preuve d’ | À vérifier |
| 430 | form | ✓ Pièce prête : / 📷 Photo d’avancement du chantier (Journal photo) / 🧾 Facture / reçu d’une dépense BTP / 💰 Preuve d’ | À vérifier |
| 438 | Select | 📷 Photo d’avancement du chantier (Journal photo) / 🧾 Facture / reçu d’une dépense BTP / 💰 Preuve d’encaissement clien | À vérifier |
| 443 | option | 📷 Photo d’avancement du chantier (Journal photo) | À vérifier |
| 444 | option | 🧾 Facture / reçu d’une dépense BTP | À vérifier |
| 445 | option | 💰 Preuve d’encaissement client (Mobile Money, virement…) | À vérifier |
| 451 | Select | Chantier concerné | À vérifier |
| 460 | option | Chantier concerné | À vérifier |
| 465 | Input | Date | À vérifier |
| 478 | Input | Objet de la photo | À vérifier |
| 487 | Input | Avancement constaté (%) | À vérifier |
| 498 | Textarea | Observations (facultatif) | À vérifier |
| 512 | Select | Catégorie BTP | À vérifier |
| 517 | option | Catégorie BTP | À vérifier |
| 521 | Input | Montant (FCFA) | À vérifier |
| 533 | Input | Fournisseur | À vérifier |
| 541 | Input | Désignation | À vérifier |
| 556 | Input | Montant encaissé (FCFA) | À vérifier |
| 566 | Select | Mode de règlement | À vérifier |
| 571 | option | Mode de règlement | À vérifier |
| 577 | Input | Nom du client | À vérifier |
| 585 | Input | Référence transaction / reçu | À vérifier |
| 598 | Button | Annuler | À vérifier |
| 599 | Button | Enregistrer dans le chantier | À vérifier |
| 604 | AttachmentPreviewModal | Dynamique / sans libellé statique | À vérifier |
### src/pages/PricingPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 313 | ButtonLink | Essayer 14 jours → /inscription | Corrigé — lien d’essai testé (partiel) |
| 317 | Button | Redirection vers SasPay… / Payer avec SasPay | À vérifier |
| 372 | a | Reprendre ↗ | À vérifier |
| 376 | Button | Vérification… / Vérifier | À vérifier |
| 417 | Link | Connexion → /connexion | À vérifier |
| 420 | Link | Créer mon espace → /inscription | À vérifier |
### src/pages/ProjectDetailPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 31 | form | Actif / En pause / Terminé / réceptionné / Annuler / Enregistrer / Ajouter le contrat | À vérifier |
| 41 | Input | Sous-traitant / tâcheron | À vérifier |
| 45 | Input | Lot BTP / corps d’état | À vérifier |
| 51 | Input | Téléphone (WhatsApp) | À vérifier |
| 54 | Input | Forfait convenu (FCFA) | À vérifier |
| 59 | Input | st-prog | À vérifier |
| 65 | Select | Actif / En pause / Terminé / réceptionné | À vérifier |
| 66 | option | Actif | À vérifier |
| 67 | option | En pause | À vérifier |
| 68 | option | Terminé / réceptionné | À vérifier |
| 73 | Textarea | Observations | À vérifier |
| 76 | Button | Annuler | À vérifier |
| 77 | Button | Enregistrer / Ajouter le contrat | À vérifier |
| 91 | form | Lot / ( / ) · Forfait / · Déjà réglé / · Reste / . / Ce versement sera automatiquement ajouté aux dépenses du chantier e | À vérifier |
| 107 | Input | Montant versé (FCFA) | À vérifier |
| 111 | Input | Date de règlement | À vérifier |
| 115 | Input | Libellé / situation | À vérifier |
| 117 | FileField | Reçu / décharge signée (facultatif) | À vérifier |
| 124 | Button | Annuler | À vérifier |
| 125 | Button | Enregistrer le versement | À vérifier |
| 162 | ButtonLink | ← Retour aux chantiers → /chantiers | À vérifier |
| 329 | Link | ← Tous les chantiers → /chantiers | À vérifier |
| 348 | ButtonLink | Carnet terrain | Corrigé — navigation ou téléchargement testé |
| 351 | ButtonLink | Rapport PDF | Corrigé — navigation ou téléchargement testé |
| 352 | ButtonLink | PV réception PDF | Corrigé — navigation ou téléchargement testé |
| 353 | a | WhatsApp client | À vérifier |
| 361 | Button | Copier le point | À vérifier |
| 362 | Button | Modifier | À vérifier |
| 366 | Button | + Dépense | À vérifier |
| 369 | Button | + Encaissement | À vérifier |
| 413 | Button | Remettre en retenue / Marquer la mainlevée | À vérifier |
| 425 | Link | Devis & factures → → /documents | À vérifier |
| 458 | button | Dynamique / sans libellé statique | À vérifier |
| 518 | Button | + Ajouter une dépense | À vérifier |
| 543 | button | 👁 Aperçu ( / justificatif / ) | À vérifier |
| 555 | a | Télécharger | À vérifier |
| 564 | Button | Modifier | À vérifier |
| 572 | Button | Supprimer | À vérifier |
| 598 | Button | + Ajouter un encaissement | À vérifier |
| 628 | button | 👁 aperçu | À vérifier |
| 645 | Button | Modifier | À vérifier |
| 653 | Button | Supprimer | À vérifier |
| 684 | Button | + Sous-traitant / tâcheron | À vérifier |
| 694 | Button | + Ajouter un sous-traitant | À vérifier |
| 751 | Button | + Verser un acompte | À vérifier |
| 755 | Button | Modifier / % | À vérifier |
| 758 | a | WhatsApp | À vérifier |
| 767 | Button | Supprimer | À vérifier |
| 840 | Modal | Dynamique / sans libellé statique | À vérifier |
| 841 | ExpenseForm | Dynamique / sans libellé statique | À vérifier |
| 848 | Modal | Dynamique / sans libellé statique | À vérifier |
| 849 | PaymentForm | Dynamique / sans libellé statique | À vérifier |
| 856 | Modal | Dynamique / sans libellé statique | À vérifier |
| 857 | SubcontractForm | Dynamique / sans libellé statique | À vérifier |
| 866 | Modal | Enregistrer un versement au sous-traitant | À vérifier |
| 868 | SubcontractPayModal | Dynamique / sans libellé statique | À vérifier |
| 877 | Modal | Dynamique / sans libellé statique | À vérifier |
| 878 | ProjectForm | Dynamique / sans libellé statique | À vérifier |
| 899 | AttachmentPreviewModal | Dynamique / sans libellé statique | À vérifier |
| 901 | ConfirmDialog | Dynamique / sans libellé statique | À vérifier |
### src/pages/ProjectsPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 23 | form | Aucune retenue (0 %) / 5 % (retenue courante) / 7,5 % / 10 % (retenue renforcée) / Annuler / Enregistrer les modificatio | À vérifier |
| 40 | Input | Nom du chantier | À vérifier |
| 44 | Input | Client | À vérifier |
| 50 | Input | Téléphone client (WhatsApp) | À vérifier |
| 54 | Input | Localisation | À vérifier |
| 61 | Input | Budget prévisionnel (FCFA) | À vérifier |
| 66 | Select | Statut | À vérifier |
| 67 | option | Statut | À vérifier |
| 73 | Input | Date de début | À vérifier |
| 76 | Input | Date de fin (optionnelle) | À vérifier |
| 82 | Select | Aucune retenue (0 %) / 5 % (retenue courante) / 7,5 % / 10 % (retenue renforcée) | À vérifier |
| 83 | option | Aucune retenue (0 %) | À vérifier |
| 84 | option | 5 % (retenue courante) | À vérifier |
| 85 | option | 7,5 % | À vérifier |
| 86 | option | 10 % (retenue renforcée) | À vérifier |
| 90 | Input | Date prévue de mainlevée | À vérifier |
| 101 | Textarea | Notes | À vérifier |
| 105 | Button | Annuler | À vérifier |
| 106 | Button | Enregistrer les modifications / Créer le chantier | À vérifier |
| 204 | ButtonLink | 📷 Photos & reçus → /photos | Corrigé — navigation testée (rôles partiels) |
| 205 | Button | + Nouveau chantier | À vérifier |
| 207 | ButtonLink | 📷 Photos & reçus → /photos | Corrigé — navigation testée (rôles partiels) |
| 212 | Input | Rechercher un chantier | À vérifier |
| 223 | Select | Filtrer par statut | À vérifier |
| 224 | option | Chantiers actifs | À vérifier |
| 225 | option | Tous les statuts | À vérifier |
| 226 | option | Dynamique / sans libellé statique | À vérifier |
| 238 | Button | + Nouveau chantier | À vérifier |
| 260 | Link | Dynamique / sans libellé statique | À vérifier |
| 272 | Button | Modifier | À vérifier |
| 276 | Button | Rouvrir / Archiver | À vérifier |
| 293 | Link | Dynamique / sans libellé statique | À vérifier |
| 312 | Button | Modifier | À vérifier |
| 316 | Button | Rouvrir / Archiver | À vérifier |
| 328 | Modal | Dynamique / sans libellé statique | À vérifier |
| 333 | ProjectForm | Dynamique / sans libellé statique | À vérifier |
| 351 | ConfirmDialog | Dynamique / sans libellé statique | À vérifier |
### src/pages/RegisterPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 60 | form | Votre entreprise / Votre compte administrateur / Création en cours… / Créer mon entreprise | OK — inscription et erreur testées (partiel) |
| 67 | Input | Nom de l'entreprise | À vérifier |
| 71 | Input | Ville | À vérifier |
| 75 | Input | Téléphone | À vérifier |
| 79 | Input | E-mail professionnel | À vérifier |
| 84 | Input | Adresse | À vérifier |
| 89 | Input | RCCM (optionnel) | À vérifier |
| 98 | Input | Nom complet | À vérifier |
| 102 | Input | Adresse e-mail | À vérifier |
| 108 | PasswordInput | Mot de passe | À vérifier |
| 113 | Button | Création en cours… / Créer mon entreprise | OK — inscription et erreur testées (partiel) |
| 121 | Link | Se connecter → /connexion | À vérifier |
### src/pages/SettingsPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 86 | form | Créer le compte agent | À vérifier |
| 88 | Input | Nom complet de l’agent | À vérifier |
| 91 | Input | E-mail de l’agent | À vérifier |
| 94 | PasswordInput | Mot de passe provisoire | À vérifier |
| 96 | Button | Créer le compte agent | À vérifier |
| 111 | Button | Réinitialiser le mot de passe | Corrigé — succès et erreur testés (admin) |
| 113 | Button | Désactiver | À vérifier |
| 114 | Button | Réactiver | À vérifier |
| 119 | form | Valider | Corrigé — succès et erreur testés (admin) |
| 121 | PasswordInput | Nouveau mot de passe provisoire | À vérifier |
| 123 | Button | Valider | Corrigé — succès et erreur testés (admin) |
| 216 | form | Enregistrer / Seul l’administrateur peut modifier le profil de l’entreprise. | À vérifier |
| 218 | Input | Nom de l'entreprise | À vérifier |
| 222 | Input | Ville | À vérifier |
| 225 | Input | Téléphone | À vérifier |
| 229 | Input | E-mail professionnel | À vérifier |
| 232 | Input | Adresse | À vérifier |
| 234 | Input | N° de compte contribuable (NCC) | À vérifier |
| 235 | Input | Régime fiscal | À vérifier |
| 237 | Input | RCCM | À vérifier |
| 240 | Button | Enregistrer | À vérifier |
| 248 | form | Changer le mot de passe | À vérifier |
| 251 | PasswordInput | Mot de passe actuel | À vérifier |
| 255 | PasswordInput | Nouveau mot de passe | À vérifier |
| 258 | Button | Changer le mot de passe | À vérifier |
| 270 | a | Dynamique / sans libellé statique | À vérifier |
### src/pages/TermsPage.jsx

| Ligne | Type | Libellé ou repère | Statut |
| ---: | --- | --- | --- |
| 78 | Link | Offres → /offres | À vérifier |
| 79 | Link | Connexion → /connexion | À vérifier |
| 108 | Link | Consulter les offres → /offres | À vérifier |
| 109 | Link | Retour à l’accueil → / | À vérifier |

## Limites de couverture

- Un contrôle présent dans le code peut être conditionnel, répété par ligne ou masqué pour certains rôles. Son statut ne couvre pas tous les jeux de données.
- Les tests automatisés d’isolation couvrent de nombreux scénarios API et RLS ; ils ne constituent pas une validation exhaustive de chaque commande UI par rôle.
- Les erreurs réseau 401/422 volontairement provoquées par les tests négatifs sont attendues ; les erreurs JavaScript et autres erreurs console sont contrôlées dans les parcours navigateur concernés.
- Aucun paiement réel, aucun e-mail réel, aucune migration de production ni restauration réelle n’ont été exécutés.
