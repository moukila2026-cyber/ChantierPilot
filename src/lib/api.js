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
    throw new ApiError(res.status, err.code || 'erreur', err.message || 'Une erreur est survenue.', err.fields);
  }
  return data;
}

export function downloadUrl(path) {
  return path;
}
