import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { reconcile, validSignature, checkoutUrl } from '../api/_lib/saspay.js';
import { entitlement } from '../shared/plans.js';
import { projectAlerts } from '../shared/alerts.js';

export async function billingCases({ A, B, adminUrl, check }) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const session = (await A.get('/api/auth/session')).data;
  const companyId = session.company.id, userId = session.user.id;
  const project = { name: 'Test quota', client_name: 'Client test', budget: 1000, start_date: '2026-01-01', status: 'en_cours' };
  const client = new pg.Client({ connectionString: adminUrl.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@') });
  await client.connect();
  async function transaction(fn) {
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('app.company_id',$1,true), set_config('app.user_id',$2,true), set_config('app.role','admin',true)", [companyId,userId]);
      const result = await fn(client);
      await client.query('COMMIT'); return result;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
  }
  const sessionB = (await B.get('/api/auth/session')).data;
  const companyIdB = sessionB.company.id;
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SASPAY_SECRET_KEY, originalUrl = process.env.APP_URL;
  try {
    const initialBilling = (await A.get('/api/billing')).data;
    check('Facturation : essai gratuit de 2 semaines (14 jours complets) et quotas affichés', initialBilling.status === 'essai' && initialBilling.trial_days === 14 && initialBilling.trial_days_remaining === 14);
    await admin.query("UPDATE companies SET created_at = TIMESTAMPTZ '2026-10-18T10:00:00Z', trial_until = now() + interval '1 day' WHERE id = $1", [companyIdB]);
    const upgradedBillingB = (await B.get('/api/billing')).data;
    check('Facturation : un ancien espace avec 1-2 jours restants est prolongé à 2 semaines complètes (14 jours)', upgradedBillingB.status === 'essai' && upgradedBillingB.trial_days_remaining >= 14);
    check('Console : un administrateur client n’est pas opérateur', (await A.get('/api/operator')).status === 403);
    await admin.query('INSERT INTO platform_operators(user_id) VALUES ($1)', [userId]);
    check('Console : opérateur désigné peut lister les entreprises', (await A.get('/api/operator')).data.companies.length >= 2);
    check('Console : suspension exige un motif', (await A.patch('/api/operator', { company_id: companyId, suspended: true, reason: '' })).status === 422);
    await A.patch('/api/operator', { company_id: companyId, suspended: true, reason: 'Contrôle de sécurité' });
    check('Console : suspension bloque immédiatement les écritures', (await A.post('/api/projects', project)).status === 402);
    await A.patch('/api/operator', { company_id: companyId, suspended: false, reason: 'Contrôle terminé' });
    check('Console : suspension journalisée', (await admin.query('SELECT count(*)::int AS n FROM platform_actions')).rows[0].n === 2);
    check('Console : autre entreprise toujours interdite', (await B.get('/api/operator')).status === 403);
    const p2 = await A.post('/api/projects', project);
    const p3 = await A.post('/api/projects', { ...project, name: 'Troisième chantier' });
    check('Quotas : trois chantiers ouverts autorisés', p2.status === 201 && p3.status === 201);
    check('Quotas : quatrième chantier refusé côté serveur', (await A.post('/api/projects', project)).status === 402);
    check('Quotas : troisième utilisateur actif refusé', (await A.post('/api/team', { full_name: 'Agent quota', email: 'quota@test.ci', password: 'QuotaPassword2026!' })).status === 402);
    await A.patch(`/api/projects/${p2.data.project.id}`, { status: 'archive' });
    await A.post('/api/projects', { ...project, name: 'Place libérée' });
    check('Quotas : réouverture ne contourne pas la limite', (await A.patch(`/api/projects/${p2.data.project.id}`, { status: 'en_cours' })).status === 402);
    // Deux requêtes concurrentes se disputent la dernière place.
    await A.patch(`/api/projects/${p3.data.project.id}`, { status: 'archive' });
    const racing = await Promise.all([A.post('/api/projects', project), A.post('/api/projects', project)]);
    check('Quotas : les créations concurrentes sont sérialisées', racing.map(r=>r.status).sort().join(',') === '201,402');
    await admin.query("UPDATE companies SET trial_until=now()-interval '1 day' WHERE id=$1", [companyId]);
    check('Expiration : dépenses et modifications refusées', (await A.patch('/api/company', { name: 'Interdit' })).status === 402);
    check('Expiration : query string ne contourne pas le contrôle', (await A.patch('/api/company?bypass=/billing', { name: 'Interdit' })).status === 402);
    check('Expiration : lecture et export restent autorisés', (await A.get('/api/dashboard')).status === 200 && (await A.get('/api/export?scope=all&format=json')).status === 200);
    check('Expiration : facturation reste accessible', (await A.get('/api/billing')).data.status === 'lecture_seule');
    check('Paiement : commande étrangère inaccessible', (await B.post('/api/billing', { action: 'verify', order_id: crypto.randomUUID() })).status === 404);

    // Tests du contrat SasPay avec transport simulé, vraie base et vrai RLS.
    process.env.SASPAY_SECRET_KEY = 'sk_test_fixture'; process.env.APP_URL = 'https://chantier.example';
    const orderId = crypto.randomUUID(), sessionId = crypto.randomUUID(), paymentId = crypto.randomUUID();
    await admin.query('INSERT INTO billing_orders(id,company_id,plan,amount,session_id) VALUES($1,$2,\'equipe\',19900,$3)', [orderId,companyId,sessionId]);
    let amount = '19899.00', paymentStatus = 'SUCCESS';
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer sk_test_fixture');
      assert.ok(url.startsWith('https://api.saspay.me/api/v1/'));
      return new Response(JSON.stringify({ success: true, data: url.includes('checkout-sessions') ? {
        id: sessionId, status: 'PAID', transaction_status: 'SUCCESS', transaction_id: paymentId,
      } : { id: paymentId, status: paymentStatus, requested_amount: amount, currency: 'XOF', description: `ChantierPilot:${orderId}`, transaction_type: 'PAIEMENT', flow_direction: 'INBOUND' } }), { status: 200 });
    };
    await assert.rejects(() => transaction(c => reconcile(c, { companyId }, orderId)), /ne correspond pas/);
    check('SasPay : montant incorrect ne crédite aucun accès', !(await admin.query('SELECT paid_until FROM companies WHERE id=$1',[companyId])).rows[0].paid_until);
    amount = '19900.00'; paymentStatus = 'FAILED';
    await assert.rejects(() => transaction(c => reconcile(c, { companyId }, orderId)), /ne correspond pas/);
    check('SasPay : échec de vérification refusé', true);
    paymentStatus = 'SUCCESS';
    const paid = await transaction(c => reconcile(c, { companyId }, orderId));
    const replayed = await transaction(c => reconcile(c, { companyId }, orderId));
    check('SasPay : paiement confirmé active le bon forfait', paid.status === 'paid' && (await admin.query('SELECT billing_plan FROM companies WHERE id=$1',[companyId])).rows[0].billing_plan === 'equipe');
    check('SasPay : replay ne prolonge pas l’abonnement', paid.access_until.getTime() === replayed.access_until.getTime());
    globalThis.fetch = originalFetch;
    check('SasPay : accès en modification rétabli après paiement', (await A.patch('/api/company', { name: session.company.name })).status === 200);
    const raw = Buffer.from('{ "event": "transaction.success" }'), timestamp = String(Math.floor(Date.now()/1000));
    const signature = crypto.createHmac('sha256','secret').update(`${timestamp}.`).update(raw).digest('hex');
    check('Webhook : signature du corps brut acceptée', validSignature(raw,signature,timestamp,'secret'));
    check('Webhook : corps modifié, ancien timestamp et secret absent refusés', !validSignature(Buffer.from('{}'),signature,timestamp,'secret') && !validSignature(raw,signature,timestamp,'secret',Date.now()+301000) && !validSignature(raw,signature,timestamp,''));
    assert.throws(()=>checkoutUrl('https://evil.example/checkout'));
    check('SasPay : redirection vers un domaine tiers rejetée', true);
    check('Forfaits : dates expirées et suspension ferment les écritures', !entitlement({trial_until: '2020-01-01'}).writable && !entitlement({billing_suspended:true,trial_until:'2099-01-01'}).writable);
    check('BTP : alertes budget, trésorerie et retard calculées', projectAlerts([{ id:'a',name:'Test',budget:100,expenses_total:101,payments_total:0,status:'en_cours',end_date:'2020-01-01' }]).length === 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SASPAY_SECRET_KEY; else process.env.SASPAY_SECRET_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalUrl;
    await client.end(); await admin.end();
  }
}
