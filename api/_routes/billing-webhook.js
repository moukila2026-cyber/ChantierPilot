import { bootQuery, withTenant } from '../_lib/db.js';
import { sendJson, fail } from '../_lib/http.js';
import { validSignature, saspay, reconcile, webhookSecret } from '../_lib/saspay.js';

export default async function handler(req, res) {
  const secret = webhookSecret();
  if (!secret) return fail(res, 503, 'configuration_absente', 'Webhook non configuré.');
  if (!validSignature(req.rawBody, req.headers['x-webhook-signature'], req.headers['x-webhook-timestamp'], secret)) {
    return fail(res, 400, 'signature_invalide', 'Signature invalide.');
  }
  let event;
  try { event = JSON.parse(req.rawBody.toString()); } catch { return fail(res, 400, 'json_invalide', 'JSON invalide.'); }
  if (event.event !== 'transaction.success') return sendJson(res, 200, { received: true });
  if (!/^[0-9a-f-]{36}$/i.test(event.data?.id || '')) return fail(res, 400, 'transaction_invalide', 'Transaction invalide.');
  const payment = await saspay(`/payments/${encodeURIComponent(event.data.id)}/verify/`);
  const match = /^ChantierPilot:([0-9a-f-]{36})$/i.exec(payment.description || '');
  if (match) {
    const companyId = (await bootQuery('SELECT api_billing_company($1) AS id', [match[1]])).rows[0]?.id;
    if (companyId) await withTenant({ companyId, role: 'admin' }, client => reconcile(client, { companyId }, match[1]));
  }
  return sendJson(res, 200, { received: true });
}
