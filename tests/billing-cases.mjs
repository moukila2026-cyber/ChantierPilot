import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import billingRoute from '../api/_routes/billing.js';
import { reconcile, validSignature, checkoutUrl } from '../api/_lib/saspay.js';
import { checkQuota } from '../api/_lib/billing.js';
import { PLANS } from '../shared/plans.js';
import { entitlement, TRIAL_ROLLOUT_MS, TRIAL_DURATION_MS } from '../shared/plans.js';
import { projectAlerts } from '../shared/alerts.js';

async function callBillingInProcess(clientObj, body) {
  const payload = JSON.stringify(body);
  const baseHeaders = clientObj.header();
  const req = Object.assign(Readable.from([Buffer.from(payload)]), {
    method: 'POST',
    url: '/api/billing',
    headers: {
      host: new URL(baseHeaders.Origin).host,
      origin: baseHeaders.Origin,
      cookie: baseHeaders.Cookie || '',
      'x-chantierpilot-client': 'web',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  let rawOut = '';
  const headers = {};
  const res = {
    get statusCode() { return status; },
    set statusCode(v) { status = v; },
    headersSent: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    writeHead(code, h = {}) { status = code; Object.entries(h).forEach(([k, v]) => { headers[k.toLowerCase()] = v; }); this.headersSent = true; },
    end(chunk = '') { this.headersSent = true; rawOut += chunk ? chunk.toString() : ''; },
  };
  await billingRoute(req, res);
  return { status, data: JSON.parse(rawOut || '{}') };
}

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
    await admin.query("UPDATE companies SET created_at = TIMESTAMPTZ '2026-10-18T10:00:00Z', trial_until = TIMESTAMPTZ '2026-10-20T12:00:00Z' WHERE id = $1", [companyIdB]);
    const upgradedBillingB = (await B.get('/api/billing')).data;
    check(
      'Facturation : un ancien espace pré-déploiement est prolongé à 2 semaines complètes depuis le déploiement (14 jours)',
      new Date(upgradedBillingB.trial_until).getTime() >= TRIAL_ROLLOUT_MS + TRIAL_DURATION_MS - 1000
        && entitlement({ trial_until: upgradedBillingB.trial_until }, TRIAL_ROLLOUT_MS + 60_000).trial_days_remaining === 14,
    );
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
    // Une deuxième session, créée avant le premier règlement, ne doit jamais
    // convertir les jours déjà payés d'une autre gamme.
    const otherOrder = crypto.randomUUID(), otherSession = crypto.randomUUID(), otherPayment = crypto.randomUUID();
    await admin.query("INSERT INTO billing_orders(id,company_id,plan,amount,session_id) VALUES($1,$2,'entreprise',39900,$3)", [otherOrder, companyId, otherSession]);
    globalThis.fetch = async (url) => new Response(JSON.stringify({ success: true, data: url.includes('checkout-sessions')
      ? { id: otherSession, status: 'PAID', transaction_status: 'SUCCESS', transaction_id: otherPayment }
      : { id: otherPayment, status: 'SUCCESS', requested_amount: '39900.00', currency: 'XOF', description: `ChantierPilot:${otherOrder}`, transaction_type: 'PAIEMENT', flow_direction: 'INBOUND' }
    }), { status: 200 });
    await assert.rejects(() => transaction(c => reconcile(c, { companyId }, otherOrder)), /autre forfait/);
    const beforeExpiry = (await admin.query('SELECT billing_plan, paid_until FROM companies WHERE id=$1', [companyId])).rows[0];
    check('SasPay : deux forfaits payés en concurrence ne convertissent pas la période active', beforeExpiry.billing_plan === 'equipe' && beforeExpiry.paid_until.getTime() === paid.access_until.getTime() && (await admin.query('SELECT status FROM billing_orders WHERE id=$1', [otherOrder])).rows[0].status === 'pending');
    await admin.query("UPDATE companies SET paid_until=now()-interval '1 second' WHERE id=$1", [companyId]);
    const later = await transaction(c => reconcile(c, { companyId }, otherOrder));
    check('SasPay : paiement différé peut être crédité après échéance', later.status === 'paid' && (await admin.query('SELECT billing_plan FROM companies WHERE id=$1', [companyId])).rows[0].billing_plan === 'entreprise');
    await admin.query("UPDATE companies SET billing_plan='equipe', paid_until=$2 WHERE id=$1", [companyId, paid.access_until]);

    // Test des plafonds de chaque offre dans de vraies transactions RLS,
    // annulées ensuite pour ne pas polluer les autres parcours de test.
    for (const [slug, plan] of Object.entries(PLANS)) {
      await admin.query("UPDATE companies SET billing_plan=$2, paid_until=now()+interval '30 days' WHERE id=$1", [companyId, slug]);
      await client.query('BEGIN');
      try {
        await client.query("SELECT set_config('app.company_id',$1,true), set_config('app.user_id',$2,true), set_config('app.role','admin',true)", [companyId,userId]);
        for (const kind of ['projects', 'users']) {
          const countSql = kind === 'projects' ? "SELECT count(*)::int n FROM projects WHERE status NOT IN ('archive','termine')" : 'SELECT count(*)::int n FROM app_users WHERE is_active';
          let n = (await client.query(countSql)).rows[0].n;
          if (n < plan[kind]) await checkQuota(client, { companyId, userId }, kind);
          while (n < plan[kind]) {
            if (kind === 'projects') await client.query("INSERT INTO projects(company_id,name,client_name,budget,start_date) VALUES($1,'Quota','Client',100,'2026-01-01')", [companyId]);
            else await client.query("INSERT INTO app_users(company_id,email,password_hash,full_name,role) VALUES($1,$2,'test','Quota test','member')", [companyId, `${crypto.randomUUID()}@quota.test`]);
            n++;
          }
          await assert.rejects(() => checkQuota(client, { companyId, userId }, kind), /Limite du forfait atteinte/);
          check(`Forfait ${slug} : limite ${kind} appliquée à ${plan[kind]}`, true);
        }
      } finally { await client.query('ROLLBACK'); }
    }
    await admin.query("UPDATE companies SET billing_plan='equipe', paid_until=$2 WHERE id=$1", [companyId, paid.access_until]);

    globalThis.fetch = originalFetch;
    check('SasPay : accès en modification rétabli après paiement', (await A.patch('/api/company', { name: session.company.name })).status === 200);
    const raw = Buffer.from('{ "event": "transaction.success" }'), timestamp = String(Math.floor(Date.now()/1000));
    const signature = crypto.createHmac('sha256','secret').update(`${timestamp}.`).update(raw).digest('hex');
    check('Webhook : signature du corps brut acceptée (y compris secret avec espace/retour ligne)', validSignature(raw,signature,timestamp,'  secret\n '));
    check('Webhook : corps modifié, ancien timestamp et secret absent refusés', !validSignature(Buffer.from('{}'),signature,timestamp,'secret') && !validSignature(raw,signature,timestamp,'secret',Date.now()+301000) && !validSignature(raw,signature,timestamp,''));
    assert.throws(()=>checkoutUrl('https://evil.example/checkout'));
    check('SasPay : redirection vers un domaine tiers rejetée', true);

    // Tests HTTP de bout en bout POST /api/billing : nettoyage des variables Vercel + diagnostics clairs + changement d'offre en attente
    process.env.DATABASE_URL = adminUrl.replace(/:\/\/([^@/]+)@/, '://chantierpilot_app@');
    process.env.SASPAY_SECRET_KEY = '  "Bearer sk_test_clean_key\n"  ';
    process.env.APP_URL = '  chantierpilote.vercel.app  \n';
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://api.saspay.me/api/v1/')) {
        assert.equal(options.headers.Authorization, 'Bearer sk_test_clean_key');
        return new Response(JSON.stringify({ success: false, error: { message: 'Invalid API key', code: 'authentication_failed' }, code: 401 }), { status: 401 });
      }
      return originalFetch(url, options);
    };
    const unauthorizedCheckout = await callBillingInProcess(B, { plan: 'essentiel' });
    check(
      'SasPay : erreur 401 amont renvoie un diagnostic français explicite (jamais un 500 aveugle) et nettoie Bearer/retours ligne',
      unauthorizedCheckout.status === 502 && /sk_test_|sk_live_/i.test(unauthorizedCheckout.data.error?.message || ''),
    );

    let createdSlugs = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://api.saspay.me/api/v1/')) {
        createdSlugs += 1;
        const body = JSON.parse(options.body);
        assert.equal(body.fee_charge_mode, 'DEDUCTED');
        return new Response(JSON.stringify({
          success: true,
          data: {
            id: crypto.randomUUID(),
            amount: body.amount,
            currency: 'XOF',
            checkout_url: `https://pay.saspay.me/checkout/test-${createdSlugs}-${body.amount}`,
          },
        }), { status: 201 });
      }
      return originalFetch(url, options);
    };
    const firstPlan = await callBillingInProcess(B, { plan: 'essentiel' });
    const switchedPlan = await callBillingInProcess(B, { plan: 'equipe' });
    check(
      'SasPay : changer de forfait avant paiement crée une nouvelle session au tarif du forfait choisi',
      firstPlan.status === 200 && switchedPlan.status === 200
        && firstPlan.data.url.includes('9900.00')
        && switchedPlan.data.url.includes('19900.00'),
    );
    globalThis.fetch = originalFetch;

    check('Forfaits : dates expirées et suspension ferment les écritures', !entitlement({trial_until: '2020-01-01'}).writable && !entitlement({billing_suspended:true,trial_until:'2099-01-01'}).writable);
    check('BTP : alertes budget, trésorerie et retard calculées', projectAlerts([{ id:'a',name:'Test',budget:100,expenses_total:101,payments_total:0,status:'en_cours',end_date:'2020-01-01' }]).length === 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SASPAY_SECRET_KEY; else process.env.SASPAY_SECRET_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalUrl;
    await client.end(); await admin.end();
  }
}
