// Client HTTP : parle aux fonctions serverless (jamais directement à la base).
// Les erreurs serveur arrivent normalisées : { code, message, fields }.

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-chantierpilot-client': 'web',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'reseau', 'Connexion impossible. Vérifiez votre connexion internet et réessayez.');
  }

  let data = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const err = data.error || {};
    // Les endpoints publics de session/connexion retournent légitimement 401.
    // Tout autre 401 signifie que la session active a expiré ou a été révoquée.
    const publicAuthEndpoint = /^\/api\/auth\/(session|login|register)(?:\?|$)/.test(path);
    if (res.status === 401 && err.code === 'non_authentifie' && !publicAuthEndpoint && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('chantierpilot:unauthorized'));
    }
    throw new ApiError(res.status, err.code || 'erreur', err.message || 'Une erreur est survenue.', err.fields);
  }
  return data;
}

export function downloadUrl(path) {
  return path;
}
