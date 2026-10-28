import crypto from 'node:crypto';
import { billingError } from './billing.js';

export function secretKey() {
  const raw = String(process.env.SASPAY_SECRET_KEY || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  return raw;
}

export function webhookSecret() {
  return String(process.env.SASPAY_WEBHOOK_SECRET || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

export function normalizeAppOrigin(rawValue, fallbackOrigin = '') {
  const raw = String(rawValue || fallbackOrigin || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return '';
  }
}

export function configured() {
  return Boolean(secretKey() && normalizeAppOrigin(process.env.APP_URL));
}

function extractSaspayFailure(status, json) {
  const code = String(json?.error?.code || json?.code || '').trim();
  let detail = '';

  if (typeof json?.error === 'string') {
    detail = json.error.trim();
  } else if (json?.error && typeof json.error === 'object') {
    if (typeof json.error.message === 'string' && json.error.message.trim()) {
      detail = json.error.message.trim();
    } else {
      const fieldMessages = Object.entries(json.error)
        .filter(([k]) => k !== 'code')
        .flatMap(([field, val]) => {
          if (Array.isArray(val) && val.length) return [`${field} : ${val.join(', ')}`];
          if (typeof val === 'string' && val.trim()) return [`${field} : ${val.trim()}`];
          return [];
        });
      if (fieldMessages.length) detail = fieldMessages.slice(0, 3).join(' · ');
    }
  }

  if (!detail && typeof json?.message === 'string') detail = json.message.trim();
  if (!detail && typeof json?.detail === 'string') detail = json.detail.trim();
  if (!detail && json && typeof json === 'object' && !('success' in json)) {
    const fieldMessages = Object.entries(json)
      .flatMap(([field, val]) => {
        if (Array.isArray(val) && val.length) return [`${field} : ${val.join(', ')}`];
        if (typeof val === 'string' && val.trim() && field !== 'code') return [`${field} : ${val.trim()}`];
        return [];
      });
    if (fieldMessages.length) detail = fieldMessages.slice(0, 3).join(' · ');
  }

  // Never echo any key material back into user messages
  detail = detail.replace(/sk_(test|live)_[A-Za-z0-9_-]+/gi, '[clé masquée]').slice(0, 220);

  if (status === 401) {
    return billingError(
      'Clé secrète SasPay refusée (401) : vérifiez que SASPAY_SECRET_KEY contient bien la clé complète commençant par sk_test_ ou sk_live_ générée dans SasPay → Développeurs → Clés API.',
      502,
    );
  }
  if (status === 403 || code === 'api_key_scope_forbidden') {
    return billingError(
      code === 'api_key_scope_forbidden'
        ? 'La clé API SasPay n’a pas la permission d’encaissement (scope PAYIN ou BOTH requis dans SasPay → Clés API).'
        : `Accès SasPay refusé (403)${detail ? ` : ${detail}` : ' — vérifiez que votre compte marchand SasPay est actif (KYC vérifié) et que la clé API autorise PAYIN.'}`,
      502,
    );
  }
  if (status === 429) {
    return billingError('Trop de requêtes vers SasPay. Patientez quelques secondes avant de réessayer.', 429);
  }
  if (status === 400 || status === 422) {
    return billingError(
      detail
        ? `SasPay a refusé les paramètres du paiement : ${detail}`
        : 'SasPay a refusé la demande de paiement (paramètres invalides).',
      422,
    );
  }
  return billingError(
    detail
      ? `SasPay n’a pas pu ouvrir le paiement (${status || 'erreur'}) : ${detail}`
      : 'SasPay n’a pas pu traiter la demande. Réessayez dans quelques instants.',
    502,
  );
}

export async function saspay(path, body) {
  const key = secretKey();
  if (!key || !normalizeAppOrigin(process.env.APP_URL)) {
    throw billingError('SasPay non configuré : contactez le support. Aucun paiement simulé.', 503);
  }
  if (!/^[\x21-\x7E]+$/.test(key)) {
    throw billingError(
      'Format de clé SASPAY_SECRET_KEY invalide (caractère caché ou espace détecté). Recopiez la clé sk_test_… / sk_live_… dans les variables d’environnement.',
      503,
    );
  }
  let response;
  try {
    response = await fetch(`https://api.saspay.me/api/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw billingError('SasPay est injoignable. Vérifiez votre connexion ou réessayez dans un instant.', 503);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.success === false) {
    throw extractSaspayFailure(response.status, json);
  }
  return json.data ?? json;
}

/** Vérification lecture seule de la connectivité SasPay (aucune donnée sensible exposée). */
export async function probeSaspay() {
  const key = secretKey();
  const appOrigin = normalizeAppOrigin(process.env.APP_URL);
  if (!key || !appOrigin) {
    return {
      configured: false,
      mode: 'non_configure',
      status: 'manquant',
      http_status: null,
      message: !key ? 'SASPAY_SECRET_KEY manquant' : 'APP_URL manquant ou invalide',
    };
  }
  const mode = key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : 'prefixe_inhabituel';
  if (!/^[\x21-\x7E]+$/.test(key)) {
    return {
      configured: true,
      mode,
      status: 'cle_invalide',
      http_status: null,
      message: 'Caractères non-ASCII détectés dans SASPAY_SECRET_KEY.',
    };
  }
  try {
    const res = await fetch('https://api.saspay.me/api/v1/pricing/my-rates/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.success !== false) {
      return { configured: true, mode, status: 'ok', http_status: res.status, message: 'Connexion SasPay opérationnelle.' };
    }
    const err = extractSaspayFailure(res.status, json);
    return {
      configured: true,
      mode,
      status: res.status === 401 ? 'cle_invalide' : res.status === 403 ? 'acces_refuse' : 'erreur',
      http_status: res.status,
      error_code: String(json?.error?.code || json?.code || '') || null,
      message: err.message,
    };
  } catch {
    return { configured: true, mode, status: 'injoignable', http_status: null, message: 'API SasPay injoignable.' };
  }
}

export function validSignature(raw, signature, timestamp, secret, now = Date.now()) {
  const cleanSecret = String(secret || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
  const cleanSig = String(signature || '').trim();
  const cleanTs = String(timestamp || '').trim();
  if (!cleanSecret || !Buffer.isBuffer(raw) || !/^\d{10}$/.test(cleanTs) || !/^[0-9a-f]{64}$/.test(cleanSig)) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(cleanTs)) > 300) return false;
  const expected = crypto.createHmac('sha256', cleanSecret).update(`${cleanTs}.`).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanSig));
}

export function checkoutUrl(value) {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === 'pay.saspay.me' || url.hostname.endsWith('.saspay.me');
    if (url.protocol === 'https:' && allowedHost && !url.username && !url.password) return url.href;
  } catch { /* invalid */ }
  throw billingError('Adresse de paiement SasPay invalide.', 502);
}

// Réconciliation : seules les preuves relues chez SasPay activent un forfait.
export async function reconcile(client, ctx, orderId) {
  const company = (await client.query(
    'SELECT id, billing_plan, paid_until > now() AS paid_active FROM companies WHERE id=$1 FOR UPDATE',
    [ctx.companyId],
  )).rows[0];
  const order = (await client.query('SELECT * FROM billing_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!order || order.status === 'paid' || !order.session_id) return order;
  const session = await saspay(`/checkout-sessions/${encodeURIComponent(order.session_id)}/status/`);
  if (session.id !== order.session_id) throw billingError('Session de paiement incohérente.', 502);
  if (['EXPIRED', 'CANCELLED', 'FAILED'].includes(session.status)) {
    await client.query('UPDATE billing_orders SET status=$2 WHERE id=$1', [order.id, session.status === 'EXPIRED' ? 'expired' : 'failed']);
    return { ...order, status: 'failed' };
  }
  if (session.status !== 'PAID' || session.transaction_status !== 'SUCCESS' || !session.transaction_id) return order;
  const payment = await saspay(`/payments/${encodeURIComponent(session.transaction_id)}/verify/`);
  if (
    payment.id !== session.transaction_id ||
    payment.status !== 'SUCCESS' ||
    payment.currency !== 'XOF' ||
    Number(payment.requested_amount) !== order.amount ||
    payment.description !== `ChantierPilot:${order.id}` ||
    payment.transaction_type !== 'PAIEMENT' ||
    payment.flow_direction !== 'INBOUND'
  ) {
    throw billingError('Le paiement ne correspond pas à la commande. Contactez le support.', 422);
  }
  // Plusieurs sessions de gammes différentes peuvent avoir été ouvertes avant le
  // premier règlement. Ne jamais convertir les jours déjà payés vers une autre
  // gamme : la commande reste vérifiable après l'échéance ou par le support.
  if (company?.paid_active && company.billing_plan !== order.plan) {
    throw billingError('Paiement confirmé par SasPay, mais un autre forfait est encore actif. Contactez le support ou vérifiez à nouveau cette commande après son échéance ; aucun jour payé n’a été modifié.', 409);
  }
  const creditedCompany = (await client.query(
    `UPDATE companies SET billing_plan=$1,
     paid_until=GREATEST(COALESCE(paid_until,now()),now()) + interval '30 days'
     WHERE id=$2 RETURNING paid_until`,
    [order.plan, ctx.companyId],
  )).rows[0];
  return (await client.query(
    `UPDATE billing_orders SET status='paid', transaction_id=$2,
     credited_at=now(), access_until=$3 WHERE id=$1 RETURNING *`,
    [order.id, payment.id, creditedCompany.paid_until],
  )).rows[0];
}
