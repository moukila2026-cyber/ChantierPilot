# Authentification — modèle actuel & option Neon Auth

## Modèle V1 (actif, testé)

ChantierPilot gère l'authentification **dans sa propre base PostgreSQL** (schéma
`public.app_users` + `public.sessions`) :

- email + mot de passe (scrypt), sessions opaques côté serveur, cookies `HttpOnly` ;
- cloisonné par entreprise, protégé par RLS comme les autres tables ;
- verrouillage anti-force brute persistant, journal d'audit.

Ce modèle est **réel et vérifié** par les suites de tests (`npm run test`,
`npm run db:test-rls`) : il est le chemin d'authentification de référence de la V1.

## Option Neon Auth (Managed Better Auth)

Neon propose une authentification managée ([docs Neon Auth](https://neon.com/docs/auth/about))
qui synchronise les comptes dans votre base (schéma `neon_auth`, table
`users_sync`) et expose des sessions JWT (JWKS). Pour brancher ChantierPilot
dessus, sans changer le modèle RLS :

1. **Activez Neon Auth** sur votre projet Neon (console Neon → Auth). Notez
   `NEON_AUTH_BASE_URL` et l'URL JWKS.
2. **Associez les comptes** : ajoutez une colonne `auth_subject` (déjà présente
   sur `app_users`) et renseignez-la avec l'`id` utilisateur Neon Auth à la
   création du compte. Un utilisateur Neon Auth = un `app_users` appartenant à
   une entreprise (la table de liaison existe déjà : `app_users.company_id`).
3. **Validez le jeton côté serveur** dans `api/_lib/auth.js`
   (remplacez `getSessionContext`) :

```js
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));

export async function getSessionContext(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin,
    });
    // payload.sub = identifiant Neon Auth → retrouver app_users.auth_subject
    // puis le même contexte { companyId, userId, role } qu'aujourd'hui.
  } catch {
    return null;
  }
}
```

4. **Gardez tout le reste** : `withTenant`, les politiques RLS, la garde
   anti-superuser, les validations. Le RLS s'appuie sur `app.company_id`, posé
   par le serveur après l'identification — indépendant du fournisseur d'auth.

## Pourquoi ce n'est pas activité par défaut

La règle du projet est de **ne présenter comme réelle que ce qui est exécuté et
testé**. Le chemin Neon Auth exige un projet Neon Auth provisionné (impossible
dans l'environnement de démonstration) : il est donc livré ici comme greffon
documenté, pas comme fonctionnalité prétendument active. Le chemin V1 (scrypt +
sessions) est intégralement testé.

## Feuille de route recommandée

1. V1 : auth locale (actuelle) — suffisante pour les premiers clients.
2. Besoin de SSO / OTP / e-mail de vérification → activer Neon Auth avec le
   greffon ci-dessus, garder les mêmes tables de métier.
3. Migration des comptes existants : mapper `app_users.email` → `neon_auth.users_sync`,
   renseigner `auth_subject`, basculer `auth_provider` à `'neon_auth'`.
