import crypto from 'node:crypto';
import { withTenant } from '../_lib/db.js';
import { handle, readJsonBody, sendJson, fail, rateLimit } from '../_lib/http.js';
import { requireAuth, run } from '../_lib/pipeline.js';
import { PLANS, entitlement, companyBilling, billingError, resolveTrialUntil } from '../_lib/billing.js';
import { saspay, configured, checkoutUrl, reconcile, secretKey, normalizeAppOrigin } from '../_lib/saspay.js';

export default async function handler(req, res) {
  return handle(req, res, () => run(res, async () => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;
    if (req.method === 'GET') {
      return sendJson(res, 200, await withTenant(ctx, async client => {
        const c = await companyBilling(client, ctx);
        const usage = (await client.query(`SELECT
          (SELECT count(*)::int FROM projects WHERE status NOT IN ('archive','termine')) AS projects,
          (SELECT count(*)::int FROM app_users WHERE is_active) AS users`)).rows[0];
        let orders = [];
        await client.query('SAVEPOINT sp_billing_orders');
        try {
          orders = (await client.query('SELECT id,plan,amount,status,created_at,access_until,checkout_url FROM billing_orders ORDER BY created_at DESC LIMIT 20')).rows;
          await client.query('RELEASE SAVEPOINT sp_billing_orders');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT sp_billing_orders').catch(() => {});
          if (err.code !== '42P01') throw err;
        }
        let operator = false;
        await client.query('SAVEPOINT sp_billing_operator');
        try {
          operator = (await client.query('SELECT api_is_operator() AS allowed')).rows[0].allowed;
          await client.query('RELEASE SAVEPOINT sp_billing_operator');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT sp_billing_operator').catch(() => {});
          if (err.code !== '42883' && err.code !== '42P01') throw err;
        }
        const effectiveTrialUntil = resolveTrialUntil(c);
        return {
          operator,
          ...entitlement(c),
          trial_until: effectiveTrialUntil,
          paid_until: c.paid_until || null,
          usage,
          orders,
          configured: configured(),
          test_mode: secretKey().startsWith('sk_test_'),
        };
      }));
    }
    if (ctx.role !== 'admin') return fail(res, 403, 'droits_insuffisants', 'Seul l’administrateur peut payer ou vérifier un abonnement.');
    if (!rateLimit(req, `billing-${ctx.companyId}`, 30, 60000).ok) return fail(res, 429, 'trop_de_tentatives', 'Patientez une minute.');
    const body = await readJsonBody(req);
    if (body.action === 'verify') {
      if (!/^[0-9a-f-]{36}$/i.test(body.order_id || '')) return fail(res, 422, 'commande_invalide', 'Commande invalide.');
      const order = await withTenant(ctx, client => reconcile(client, ctx, body.order_id));
      if (!order) return fail(res, 404, 'introuvable', 'Commande introuvable.');
      return sendJson(res, 200, { status: order.status });
    }
    if (!PLANS[body.plan]) throw billingError('Offre inconnue.', 422);
    if (!configured()) throw billingError('Paiement SasPay non configuré. Contactez le support.', 503);
    const appOrigin = normalizeAppOrigin(process.env.APP_URL);
    const result = await withTenant(ctx, async client => {
      const c = await companyBilling(client, ctx, true);
      if (c.billing_suspended) throw billingError('Espace suspendu : contactez le support.', 403);
      if (new Date(c.paid_until).getTime() > Date.now() && c.billing_plan !== body.plan) {
        throw billingError('Le changement de gamme est possible à l’expiration de la période payée. Aucun prorata appliqué.', 409);
      }
      const pending = (await client.query(
        "SELECT * FROM billing_orders WHERE status='pending' AND plan=$1 AND created_at > now()-interval '1 day' ORDER BY created_at DESC LIMIT 1",
        [body.plan],
      )).rows[0];
      if (pending?.checkout_url) return { url: pending.checkout_url, order_id: pending.id, reused: true };
      const order = pending || (await client.query(
        'INSERT INTO billing_orders (id,company_id,plan,amount) VALUES ($1,$2,$3,$4) RETURNING *',
        [crypto.randomUUID(), ctx.companyId, body.plan, PLANS[body.plan].price],
      )).rows[0];
      const session = await saspay('/checkout-sessions/', {
        amount: `${order.amount}.00`,
        currency: 'XOF',
        country: 'CI',
        description: `ChantierPilot:${order.id}`,
        customer_email: String(ctx.email || '').trim(),
        customer_name: String(ctx.fullName || c.name || 'Client ChantierPilot').trim(),
        return_url: `${appOrigin}/offres?commande=${order.id}`,
        fee_charge_mode: 'DEDUCTED',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      if (!session.id || Number(session.amount) !== order.amount || session.currency !== 'XOF') {
        throw billingError('Réponse SasPay incohérente.', 502);
      }
      const url = checkoutUrl(session.checkout_url);
      await client.query('UPDATE billing_orders SET session_id=$2,checkout_url=$3 WHERE id=$1', [order.id, session.id, url]);
      return { url, order_id: order.id };
    });
    return sendJson(res, 200, result);
  }));
}
