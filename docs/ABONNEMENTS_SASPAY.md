# Abonnements, quotas et SasPay

## Offre commerciale retenue

| Forfait | Prix / 30 jours | Chantiers ouverts | Utilisateurs actifs |
| --- | ---: | ---: | ---: |
| Essentiel | 9 900 FCFA | 3 | 2 |
| Équipe | 19 900 FCFA | 10 | 6 |
| Entreprise | 39 900 FCFA | 30 | 20 |

Le dirigeant compte comme utilisateur. Les chantiers terminés/archivés ne consomment pas le quota. Les fonctions essentielles sont communes : dépenses et justificatifs, encaissements déclarés, alertes de gestion, PDF et exports. Import/formation/accompagnement sont facultatifs, sur devis, sans frais d’installation imposés.

**Important :** inscription libre ≠ accès gratuit illimité. Essai Essentiel de 14 jours, calculé côté base. Les espaces existants obtiennent également 14 jours à la première migration. Une relance de migration ne réinitialise pas cet essai. Après expiration/suspension, les écritures renvoient HTTP 402 ; lecture, rapports et exports restent accessibles selon les permissions habituelles. Une suspension ne stoppe pas une période déjà payée, elle bloque uniquement les modifications. La réactivation n’accorde aucun jour gratuit.

## Ce qui est réellement automatisé

- Création serveur d’un checkout SasPay au tarif de `shared/plans.js`, sans montant libre envoyé par le navigateur.
- Réutilisation d’une session en attente récente pour éviter les doubles clics ; pas de faux paiement local.
- Retour sur `/offres?commande=...` avec revérification serveur ; retour navigateur seul jamais utilisé comme preuve.
- Webhook signé : HMAC-SHA256 de `timestamp.corps_brut`, comparaison constante et tolérance de 300 secondes.
- Lecture du paiement et de la session auprès de SasPay : identité, sens entrant, type paiement, montant, devise, description unique et statut contrôlés.
- Crédit de 30 jours à partir du maximum entre maintenant et la dernière échéance payée. Transaction et verrou entreprise/commande ; une commande déjà créditée ne peut pas l’être une deuxième fois. L’identifiant de transaction est unique.
- Quotas vérifiés en transaction avec verrou entreprise, y compris réouverture de chantier et réactivation d’un agent.
- Expiration évaluée à chaque requête d’écriture : aucun cron requis pour passer en lecture seule.
- Bandeau dans l’application pendant l’essai, après expiration et à moins de 7 jours de l’échéance.

**Pas encore de débit récurrent sans intervention.** La documentation API publique consultée décrit checkout/softpay, mais pas de mandat, token de carte ou endpoint de prélèvement d’abonnement. Les « subscriptions » documentées dans Webhooks sont des abonnements à des événements, pas des prélèvements financiers. Le client valide chaque renouvellement sur SasPay. Aucune donnée bancaire n’est collectée par ChantierPilot. Ne pas vendre un prélèvement mensuel autonome avant confirmation et documentation de cette capacité par SasPay.

Un changement de gamme nécessite l’expiration de la période payée. Pas de prorata ni de remboursement automatique. Les remboursements/litiges et changements de gamme urgents se traitent avec le support. Un renouvellement au même forfait ajoute 30 jours, sans perdre les jours restants. Aucun e-mail/SMS de relance n’est actuellement envoyé : les rappels sont affichés dans l’application.

## Mise en service

1. Sauvegarder la base, puis exécuter `npm run migrate` avec `DATABASE_URL_ADMIN` et `APP_DB_PASSWORD`, comme dans le guide d’installation. Le rôle applicatif reste limité, sans BYPASSRLS.
2. Dans l’environnement **serveur**, configurer :
   - `APP_URL` : origine publique canonique HTTPS de l’application ;
   - `SASPAY_SECRET_KEY` : clé `sk_test_...` pour les essais, puis `sk_live_...` pour encaisser ; scope Payin/All ;
   - `SASPAY_WEBHOOK_SECRET` : secret de signature du webhook créé à l’étape suivante.
   Ne jamais utiliser un préfixe `VITE_` pour ces secrets, ni les enregistrer dans Git.
3. Dans **app.saspay.me**, créer un webhook `transaction.success` vers :
   `https://votre-domaine/api/billing/webhook`. Conserver le secret dès sa création. Le webhook n’utilise pas de session ChantierPilot ; sa signature est obligatoire.
4. Configurer les frais du compte SasPay en **DEDUCTED** si le prix affiché doit être exactement le montant débité. L’application demande `DEDUCTED`, mais SasPay peut ignorer ce champ si l’autorisation de surcharge du mode de frais n’est pas activée sur le compte. Vérifier le montant final au checkout. Le texte de l’interface prévient des frais éventuels.
5. Confirmer avec SasPay le KYC marchand, les réseaux effectivement disponibles en Côte d’Ivoire et leurs frais. Ne pas afficher de réseaux garantis sans ce contrôle.
6. Tester le parcours complet avec les accès de test : création d’espace, paiement, retour, webhook, rejeu, échec et renouvellement. Le mode test est explicitement affiché dans Offres.
7. Passer aux clés et webhook de production. Effectuer une petite transaction réelle contrôlée et vérifier l’historique, les fonds reçus et l’échéance.

Sans ces variables, les forfaits restent visibles mais le paiement est indisponible. Aucun accès payant n’est simulé. Les tests automatisés utilisent un transport SasPay simulé et une vraie base PostgreSQL ; ils **ne remplacent pas un test marchand réel**.

Si le webhook est perdu, l’administrateur peut cliquer **Vérifier** dans l’historique des paiements. La vérification au retour joue le même rôle. Il n’y a pas de tâche de rapprochement périodique : surveiller les livraisons dans SasPay. Le format d’événement ne garantit pas de métadonnée de session ; le webhook relit la transaction, retrouve la commande par la description `ChantierPilot:<uuid>`, puis vérifie aussi le lien session→transaction. Un événement sans commande connue est ignoré, pas attribué par e-mail.

## Console SHOPIN30

URL : `/shopin30`. Le lien apparaît dans le menu **uniquement pour un opérateur désigné**. Être administrateur d’une entreprise cliente ne donne aucun droit opérateur.

Après création du compte utilisateur normal, un administrateur de base désigne l’opérateur depuis sa connexion de migration. Remplacer l’adresse ci-dessous par celle du compte vérifié ; ne jamais permettre l’auto-inscription à ce rôle :

```sql
BEGIN;
SET LOCAL ROLE chantierpilot_definer;
INSERT INTO public.platform_operators(user_id)
SELECT id FROM public.app_users WHERE email = 'adresse-operateur-verifiee@votre-domaine.ci'
ON CONFLICT DO NOTHING;
COMMIT;
```

Contrôler que la commande a inséré le bon compte. Pour révoquer un opérateur :

```sql
BEGIN;
SET LOCAL ROLE chantierpilot_definer;
DELETE FROM public.platform_operators
WHERE user_id IN (SELECT id FROM public.app_users WHERE email = 'adresse-operateur-verifiee@votre-domaine.ci');
COMMIT;
```

La console liste les 500 espaces les plus récents (nom, forfait, échéances, suspension). Suspension/réactivation exige une confirmation et un motif. Les actions sont conservées dans `platform_actions`. Les opérateurs ne voient pas les dépenses ou les pièces des autres entreprises. Les fonctions SQL dédiées revérifient l’habilitation ; le rôle applicatif ne peut ni lire ni alimenter `platform_operators` directement. Une suspension empêche de créer un nouveau checkout, mais une commande déjà payée reste créditée sans lever la suspension.

## Sources du contrat d’intégration

- https://docs.saspay.me/api-reference/payments/checkout-create (pas d’Idempotency-Key sur checkout)
- https://docs.saspay.me/api-reference/payments/checkout-status
- https://docs.saspay.me/api-reference/payments/verify
- https://docs.saspay.me/api-reference/webhooks
- https://docs.saspay.me/api-reference/introduction
