# ChantierPilot — note de reprise

Dernière mise à jour : 19 octobre 2026.

## Comptes agents (rôle `member`) — matrice B

L'administrateur d'une entreprise peut créer, désactiver/réactiver et réinitialiser le mot de passe des comptes agents depuis **Paramètres → Équipe** (`/api/team`, réservé aux administrateurs, contrôle côté serveur, journalisation, sessions révocables — voir `docs/SECURITE.md` §2 bis). Un agent voit les données de son entreprise, saisit dépenses et encaissements et joint des justificatifs ; il ne peut ni supprimer, ni gérer les chantiers, les réglages, les exports, le journal ou les comptes. Aucun compte n'est créé manuellement en base. Les agents utilisent l'application sur téléphone via Internet ; il n'y a pas de mode hors ligne.

## État du dépôt

- Dépôt : `moukila2026-cyber/ChantierPilot`.
- La branche de travail Arena de la session en cours est indiquée dans la session Arena (ne pas travailler sur `main`) ; la livraison V1.3 passait par `arena/9d2da74b-chantierpilot` ; les changements doivent être livrés par PR, jamais directement sur `main`.
- La base de cette livraison est `f480bc1` (fusion de la PR #3).
- Les PR #1 (V1), #2 (V1.1) et #3 (V1.2 — déploiement Vercel + Neon) sont fusionnées.
- La page d’accueil publique et le logo ChantierPilot sont livrés dans la V1.3. Pour les visiteurs, `/` affiche l’accueil ; après authentification, `/` conserve le tableau de bord.
- Les tests de cette version ont réussi : RLS 22/22, migration 5/5, unitaires 14/14, interface 43/43 et intégration 59/59 ; `npm run build` réussit également.

## Production : état et reste à faire

**Aucun service n’est confirmé comme déployé en production.** La fusion de code ne crée pas les ressources chez Vercel ou Neon. À configurer et vérifier avec le propriétaire du projet :

1. Créer/configurer le projet Vercel lié à `moukila2026-cyber/ChantierPilot`, avec `npm run build`, sortie `dist`, Node.js 22.x et région `fra1`.
2. Créer/configurer Neon à Francfort avec `main` pour la production et `preprod` pour les aperçus.
3. Initialiser le schéma sur le poste du propriétaire avec `node db/migrate.mjs` et l’URL administrateur/propriétaire directe, réservée à cette migration.
4. Dans Vercel, définir `DATABASE_URL` avec uniquement l’URL pooled du rôle limité `chantierpilot_app` : base de production pour Production, base de préproduction pour Preview. Jamais de superuser, de rôle `BYPASSRLS` ou d’URL administrateur dans les variables de l’application.
5. Déployer puis vérifier `/api/health`, réaliser la recette avec des données fictives et contrôler l’isolation entre entreprises.
6. Configurer les sauvegardes, contrôler les rôles PostgreSQL avec la requête décrite dans `docs/SAUVEGARDES.md`, puis ajouter un domaine personnalisé si nécessaire.

Ne jamais demander ou coller de mot de passe, jeton, clé ou URL de base de données dans le chat. Les secrets doivent être saisis directement dans Neon ou dans les paramètres Vercel adaptés.

## Contrôles avant le premier vrai client

- Les illustrations de la page d’accueil sont générées par IA ; elles ne sont pas des photographies de chantiers clients et devront être remplacées par des images réelles autorisées avant de les présenter comme telles.
- L’identité légale de l’éditeur, la politique de confidentialité et les CGU doivent être complétées, vérifiées et validées ; les CGU présentes ne sont pas juridiquement finalisées.
- Faire la revue des démarches ARTCI sous la Loi ivoirienne 2013-450, notamment la déclaration préalable et l’autorisation de transfert hors CEDEAO, l’hébergement envisagé étant à Francfort.
- Vérifier le statut des paiements, de la sauvegarde et des accès avant d’intégrer des données réelles.

## Règles produit

- Interface en français ; montants en FCFA entiers ; pied de page « Conçu par SHOPIN30 » et `+225 05 01 30 33 43` avec lien `tel:+2250501303343` sur toutes les pages.
- Un encaissement n’est présenté comme « prouvé » que si un justificatif est joint ; une référence seule ne prouve pas le paiement.
- Ne pas développer de lotissement, de comptabilité complète ni de paiement automatique.
- Ne pas publier de faux témoignages, statistiques commerciales inventées ou certifications non vérifiées.
- Relancer `npm run build` et `npm run test:all` avant toute livraison de code.

## Documentation de déploiement

Avant de guider la mise en production, lire intégralement `docs/VERCEL_PAS_A_PAS.md`, `docs/PLAN_MISE_EN_PRODUCTION.md`, `docs/DEPLOIEMENT.md`, `docs/SAUVEGARDES.md` et `docs/SECURITE.md`. Si le connecteur Vercel Arena n’est pas disponible, suivre les déploiements et journaux depuis l’interface Vercel.
