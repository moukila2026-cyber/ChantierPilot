# Plan de mise en production — ChantierPilot

Objectif : un site **public, opérationnel et sûr**, prêt à accueillir de vrais clients en
Côte d'Ivoire, sans négliger la sécurité, la conformité ni le budget.
Partie technique détaillée : [VERCEL_PAS_A_PAS.md](VERCEL_PAS_A_PAS.md).

---

## 1. Où en est le projet (18 octobre 2026)

| Statut | Contenu |
| --- | --- |
| **En production** | Rien. Aucun projet Vercel ni Neon n'existe encore |
| **Fusionné dans `main`** | V1 et V1.1 : application, sécurité (RLS, garde anti-superuser, sessions, anti-CSRF, anti-force brute), pagination, PDF (logo, montants en lettres), exports, CGU provisoires, pied de page SHOPIN30 + `+225 05 01 30 33 43` |
| **Prêt dans la Pull Request V1.2 (à fusionner)** | Correctifs bloquants : migration qui échouait sur Neon, API en une seule fonction (limite Vercel), enregistrement des coordonnées de l'entreprise (cassé dans `main`), cookies sécurisés sur Vercel, coupures de connexion Neon gérées, guides corrigés, nouveaux tests |
| **À configurer par vous** | Comptes Neon et Vercel, bases et variables, préproduction, domaine, sauvegardes |
| **À compléter avant le premier client** | Identité légale de l'éditeur, politique de confidentialité, revue juridique des CGU, formalités ARTCI |

> Les CGU actuelles sont **provisoires** et ne sont **pas** juridiquement finalisées
> (l'avertissement affiché dans l'application doit rester tant que la phase 4 n'est pas faite).

---

## 2. Décisions à prendre (avec recommandation)

| Sujet | Recommandation | Pourquoi |
| --- | --- | --- |
| Offre Vercel | **Pro** (environ 20 $/mois par membre) dès qu'il y a une finalité commerciale | Les conditions Vercel réservent Hobby à un usage personnel non commercial. Le code tient désormais dans la limite technique de Hobby, mais la limite contractuelle demeure |
| Offre Neon | **Free** pour la préproduction, **Launch** (à l'usage) pour la production avant le premier client | Free = 6 h d'historique de restauration seulement |
| Région | Neon **AWS Europe Central 1 (Frankfurt)** + Vercel `fra1` | Plus proche d'Abidjan parmi les régions disponibles, base et fonctions au même endroit |
| Dépôt GitHub | Le passer en **privé** avant la commercialisation | Il est public alors que le README annonce « projet privé ». Il ne contient aucun secret, mais le code et la stratégie restent exposés |
| Protection de `main` | Activer une **règle de branche** : PR obligatoire et CI verte | Empêche tout envoi direct en production par erreur |
| Domaine | Un sous-domaine dédié, par ex. `app.<votre-domaine>.ci` | Image professionnelle ; HTTPS et HSTS automatiques |

---

## 3. Budget de démarrage (ordre de grandeur, à confirmer sur les sites officiels)

| Poste | Coût indicatif |
| --- | --- |
| Vercel Pro | ~20 $/mois (≈ 11 000 à 12 500 FCFA selon le taux) |
| Neon Launch | facturation à l'usage : faible au démarrage grâce à la mise en veille ; à surveiller dans *Billing* |
| Nom de domaine | variable selon l'extension et le registraire |
| Juriste (CGU, confidentialité, contrats) et formalités ARTCI | à demander en devis ; **indispensable avant les vrais clients** |
| Gestionnaire de mots de passe | gratuit possible (Bitwarden, KeePassXC) |

---

## 4. Le plan, phase par phase

### Phase 0 — Code prêt (avant toute configuration)

- [ ] Relire puis fusionner la **Pull Request V1.2**, une fois la CI verte.
- [ ] Fournir ou restaurer `docs/REPRISE_SESSION.md`, toujours absent du dépôt.
- [ ] Sécuriser les comptes : **double authentification (2FA)** sur GitHub, Vercel et Neon, avec une adresse e-mail professionnelle.

### Phase 1 — Infrastructure (≈ 1 h)

- [ ] Neon : projet en région Frankfurt, branche `preprod` (guide, étape 2).
- [ ] Deux mots de passe applicatifs générés dans le gestionnaire (étape 3).
- [ ] Migration de `preprod`, puis de la production, depuis votre poste (étape 4).
- [ ] Vercel : import du dépôt, accès GitHub limité au seul dépôt (étape 5).
- [ ] Variables : `DATABASE_URL` uniquement, valeur Production ≠ valeur Preview, toutes deux « Sensitive » (étape 6).
- [ ] Node.js 22.x, protection des prévisualisations active.

### Phase 2 — Préproduction (≈ 1 h, données fictives uniquement)

- [ ] `/api/health` → `"database":"ok"`, `"driver":"neon"`.
- [ ] Les 12 vérifications de l'étape 8 : inscription, chantier, dépense, encaissement « Déclaré » puis « Prouvé » avec justificatif, PDF, exports, **cloisonnement A/B**, pied de page, mobile, verrouillage, cookie sécurisé.
- [ ] Sauvegarde : requête `rolbypassrls` exécutée, puis test de dump et de restauration sur `preprod` ([SAUVEGARDES.md](SAUVEGARDES.md)).

### Phase 3 — Production technique

- [ ] Fusion dans `main` → déploiement de production → `/api/health` OK.
- [ ] Domaine personnalisé et HTTPS (étape 9).
- [ ] Neon production en **Launch**, historique réglé à 7 jours, instantané pris.
- [ ] Aucune URL administrateur dans Vercel (vérification visuelle de la liste des variables).

> À ce stade, le site est **en ligne techniquement**. Il ne doit pas encore recevoir de données
> de vrais clients tant que la phase 4 n'est pas terminée.

### Phase 4 — Juridique et conformité (à lancer dès maintenant : délais externes)

À faire valider par un juriste. Ce qui suit est une liste de travail, pas un avis juridique.

- [ ] **Identité de l'éditeur** dans les CGU et le pied de page légal : raison sociale, forme
      juridique, capital, siège, **RCCM**, **NCC**, responsable de publication, e-mail et téléphone de contact.
- [ ] **Politique de confidentialité** dédiée, avec sa propre page. Elle doit préciser :
  - les données traitées (comptes, coordonnées clients et fournisseurs, justificatifs) ;
  - les finalités, les durées de conservation et la sécurité ;
  - les hébergeurs et leur localisation (Vercel, Neon — Francfort) ;
  - les droits des personnes et le contact.
- [ ] **ARTCI** (loi n° 2013-450 du 19 juin 2013) :
  - déclaration préalable du traitement ;
  - **autorisation préalable du transfert de données hors CEDEAO** (hébergement à Francfort ; articles 7 et 26). L'ARTCI se prononce en principe sous un mois.
- [ ] **Contrat client** (ou annexe aux CGU) précisant qui est responsable des données saisies
      par chaque entreprise et le rôle de ChantierPilot (sous-traitant).
- [ ] Revue des **CGU** par le juriste, puis retrait de l'avertissement « À valider avant
      commercialisation » **seulement** après validation.

### Phase 5 — Exploitation et sécurité continue

| Fréquence | Action |
| --- | --- |
| À chaque évolution | PR → CI verte (`npm run build`, `npm run test:all`) → test sur prévisualisation → fusion |
| Chaque semaine | Vérifier les logs Vercel (pics de 401, 429, 5xx), l'usage Neon et la facturation |
| Chaque mois | `npm audit` et mises à jour de dépendances via PR ; test de restauration d'une sauvegarde |
| Chaque trimestre ou départ d'une personne | Rotation des mots de passe de base, revue des accès GitHub, Vercel et Neon |
| En cas d'incident | Couper l'accès (redéployer une version saine ou mettre en pause), changer les mots de passe concernés, restaurer, documenter, informer les clients touchés |

### Phase 6 — Premier client (offre Pilote fondateur)

- [ ] Phases 1 à 4 terminées.
- [ ] Compte créé avec le client ; mot de passe choisi par lui, ou transmis par un canal séparé puis changé.
- [ ] Coordonnées de l'entreprise renseignées dans *Paramètres* (elles figurent sur les PDF).
- [ ] Import éventuel de ses données, puis contrôle des totaux avec lui ([SAUVEGARDES.md](SAUVEGARDES.md), §4).
- [ ] Formation courte : un encaissement n'est « Prouvé » qu'avec un justificatif joint.

---

## 5. Règles permanentes

- Aucun secret dans un chat, un e-mail, WhatsApp ou Git. Les secrets ne vont que dans Neon, Vercel, le gestionnaire de mots de passe ou le terminal de migration.
- L'application ne se connecte **qu'avec** `chantierpilot_app` (ni superuser, ni BYPASSRLS).
- Jamais de `NO FORCE ROW LEVEL SECURITY`, même pour une sauvegarde.
- Un encaissement n'est « Prouvé » qu'avec un justificatif joint.
- Interface en français, montants en FCFA entiers, pied de page SHOPIN30 + téléphone sur toutes les pages.
- Hors périmètre : lotissement, comptabilité complète, paiement automatique.

---

## 6. Limites connues

- Base Neon en veille après 5 minutes sans activité : la première requête suivante est un peu plus lente. Les coupures de connexion sont gérées.
- Justificatifs stockés en base (2 Mo max) : un stockage objet deviendra nécessaire avec le volume.
- La sauvegarde `pg_dump` complète dépend des droits du rôle propriétaire Neon : à vérifier en phase 2.
- La limitation de débit est propre à chaque instance ; le verrouillage de compte est global, en base.
