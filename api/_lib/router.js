// Routeur unique de l'API.
//
// Pourquoi : sur Vercel, chaque fichier de api/ devient une fonction
// serverless distincte, et le plan Hobby en refuse plus de 12 par
// déploiement. Toute l'API passe donc par UNE seule fonction (api/index.js)
// qui délègue aux gestionnaires de api/_routes/ (dossier préfixé « _ » :
// jamais déployé comme fonction). Les URL publiques /api/... sont inchangées.
//
// Le même routeur sert en local (server/dev.mjs) et donc dans les tests
// d'intégration : ce qui est testé est exactement ce qui est déployé.
//
// Les imports sont STATIQUES : l'outil de bundling de Vercel ne suit pas les
// import() dynamiques à chemin variable.

import health from '../_routes/health.js';
import register from '../_routes/auth/register.js';
import login from '../_routes/auth/login.js';
import logout from '../_routes/auth/logout.js';
import password from '../_routes/auth/password.js';
import session from '../_routes/auth/session.js';
import company from '../_routes/company.js';
import dashboard from '../_routes/dashboard.js';
import projectsIndex from '../_routes/projects/index.js';
import projectById from '../_routes/projects/[id].js';
import projectReport from '../_routes/projects/[id]/report.js';
import expensesIndex from '../_routes/expenses/index.js';
import expenseById from '../_routes/expenses/[id].js';
import paymentsIndex from '../_routes/payments/index.js';
import paymentById from '../_routes/payments/[id].js';
import files from '../_routes/files.js';
import exportData from '../_routes/export.js';
import audit from '../_routes/audit.js';
import { fail, securityHeaders } from './http.js';

const ID = '(?<id>[^/]+)';

/** [méthodes autorisées, motif du chemin, gestionnaire] */
export const ROUTES = [
  [['GET'], /^\/api\/health$/, health],
  [['POST'], /^\/api\/auth\/register$/, register],
  [['POST'], /^\/api\/auth\/login$/, login],
  [['POST'], /^\/api\/auth\/logout$/, logout],
  [['POST'], /^\/api\/auth\/password$/, password],
  [['GET'], /^\/api\/auth\/session$/, session],
  [['GET', 'PATCH'], /^\/api\/company$/, company],
  [['GET'], /^\/api\/dashboard$/, dashboard],
  [['GET', 'POST'], /^\/api\/projects$/, projectsIndex],
  [['GET', 'PATCH'], new RegExp(`^/api/projects/${ID}$`), projectById],
  [['GET'], new RegExp(`^/api/projects/${ID}/report$`), projectReport],
  [['GET', 'POST'], /^\/api\/expenses$/, expensesIndex],
  [['PATCH', 'DELETE'], new RegExp(`^/api/expenses/${ID}$`), expenseById],
  [['GET', 'POST'], /^\/api\/payments$/, paymentsIndex],
  [['PATCH', 'DELETE'], new RegExp(`^/api/payments/${ID}$`), paymentById],
  [['GET'], /^\/api\/files$/, files],
  [['GET'], /^\/api\/export$/, exportData],
  [['GET'], /^\/api\/audit$/, audit],
];

/**
 * Chemin logique demandé. Sur Vercel, vercel.json réécrit /api/<route> vers
 * /api?__route=<route> : selon le contexte, req.url contient soit le chemin
 * d'origine, soit la destination réécrite — on gère les deux.
 */
export function resolvePath(rawUrl) {
  const url = new URL(rawUrl || '/', 'http://local');
  let pathname = url.pathname.replace(/\/+$/, '') || '/';
  const rewritten = url.searchParams.get('__route');
  url.searchParams.delete('__route');
  if ((pathname === '/api' || pathname === '/api/index') && rewritten) {
    pathname = `/api/${rewritten.replace(/^\/+|\/+$/g, '')}`;
  }
  return { pathname, searchParams: url.searchParams };
}

function setQuery(req, query) {
  // Sur Vercel, req.query est une propriété paresseuse : on la redéfinit
  // explicitement plutôt que de compter sur un setter.
  Object.defineProperty(req, 'query', {
    value: query, writable: true, configurable: true, enumerable: true,
  });
}

/** Trouve la route et exécute son gestionnaire. */
export async function dispatch(req, res) {
  const { pathname, searchParams } = resolvePath(req.url);
  const method = (req.method || 'GET').toUpperCase();

  let pathMatched = false;
  for (const [methods, pattern, handler] of ROUTES) {
    const match = pathname.match(pattern);
    if (!match) continue;
    pathMatched = true;
    const allowed = methods.includes(method) || (method === 'HEAD' && methods.includes('GET'));
    if (!allowed) continue;

    const query = {};
    for (const [k, v] of searchParams.entries()) query[k] = v;
    Object.assign(query, match.groups || {}); // l'identifiant du chemin prime
    setQuery(req, query);
    return handler(req, res);
  }

  securityHeaders(res);
  if (pathMatched) {
    return fail(res, 405, 'methode_non_autorisee', 'Méthode non autorisée pour cette ressource.');
  }
  return fail(res, 404, 'introuvable', 'Ressource inconnue.');
}
