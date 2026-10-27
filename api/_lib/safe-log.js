// Les erreurs de pilotes, de réseau ou de fournisseurs peuvent contenir des
// adresses, identifiants, données client ou chaînes de connexion. Les journaux
// techniques ne doivent jamais recopier message, détail, pile ou objet brut.
const SCOPES = new Set(['api', 'api:billing', 'audit', 'db', 'dev-api']);
const SAFE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE',
  '08000', '08001', '08003', '08006', '53300', '57P01', '57P02', '57P03',
]);

/** Journalise un contexte et, au besoin, un code technique issu d'une liste fermée. */
export function logTechnicalError(scope, error, { level = 'error' } = {}) {
  const safeScope = SCOPES.has(scope) ? scope : 'service';
  let code;
  try {
    const candidate = error?.code;
    if (typeof candidate === 'string' && SAFE_CODES.has(candidate)) code = candidate;
  } catch { /* un objet d'erreur peut contenir des accesseurs non fiables */ }
  const message = `[${safeScope}] Incident technique${code ? ` (${code})` : ''}.`;
  if (level === 'warn') console.warn(message);
  else console.error(message);
}
