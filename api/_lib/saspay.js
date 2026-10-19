import crypto from 'node:crypto';
import { billingError } from './billing.js';
export function configured() { return !!(process.env.SASPAY_SECRET_KEY && process.env.APP_URL); }
export async function saspay(path, body) {
  if (!configured()) throw billingError('SasPay non configuré : contactez le support. Aucun paiement simulé.', 503);
  let response;
  try {
    response = await fetch(`https://api.saspay.me/api/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${process.env.SASPAY_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw billingError('SasPay est injoignable. Vérifiez le paiement avant de réessayer.', 503); }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.success === false) throw billingError('SasPay n’a pas pu traiter la demande. Réessayez ultérieurement.', 502);
  return json.data ?? json;
}
export function validSignature(raw, signature, timestamp, secret, now = Date.now()) {
  if (!secret || !Buffer.isBuffer(raw) || !/^\d{10}$/.test(timestamp || '') || !/^[0-9a-f]{64}$/.test(signature || '')) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
export function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'pay.saspay.me' && !url.username && !url.password) return url.href;
  } catch { /* invalid */ }
  throw billingError('Adresse de paiement SasPay invalide.', 502);
}
// Réconciliation : seules les preuves relues chez SasPay activent un forfait.
export async function reconcile(client, ctx, orderId) {
  await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [ctx.companyId]);
  const order = (await client.query('SELECT * FROM billing_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!order || order.status === 'paid' || !order.session_id) return order;
  const session = await saspay(`/checkout-sessions/${encodeURIComponent(order.session_id)}/status/`);
  if (session.id !== order.session_id) throw billingError('Session de paiement incohérente.', 502);
  if (['EXPIRED','CANCELLED','FAILED'].includes(session.status)) {
    await client.query("UPDATE billing_orders SET status=$2 WHERE id=$1", [order.id, session.status === 'EXPIRED' ? 'expired' : 'failed']);
    return { ...order, status: 'failed' };
  }
  if (session.status !== 'PAID' || session.transaction_status !== 'SUCCESS' || !session.transaction_id) return order;
  const payment = await saspay(`/payments/${encodeURIComponent(session.transaction_id)}/verify/`);
  if (payment.id !== session.transaction_id || payment.status !== 'SUCCESS' || payment.currency !== 'XOF' ||
      Number(payment.requested_amount) !== order.amount || payment.description !== `ChantierPilot:${order.id}` ||
      payment.transaction_type !== 'PAIEMENT' || payment.flow_direction !== 'INBOUND') {
    throw billingError('Le paiement ne correspond pas à la commande. Contactez le support.', 422);
  }
  // Un forfait actif ne peut pas changer de gamme en cours de période (pas de prorata caché).
  // Le choix de gamme est bloqué à la création ; chaque paiement reste honoré en cas de course.
  const company = (await client.query(`UPDATE companies SET billing_plan=$1,
    paid_until=GREATEST(COALESCE(paid_until,now()),now()) + interval '30 days'
    WHERE id=$2 RETURNING paid_until`, [order.plan, ctx.companyId])).rows[0];
  return (await client.query(`UPDATE billing_orders SET status='paid', transaction_id=$2,
    credited_at=now(), access_until=$3 WHERE id=$1 RETURNING *`, [order.id, payment.id, company.paid_until])).rows[0];
}
