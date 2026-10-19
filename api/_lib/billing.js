import { PLANS, entitlement } from '../../shared/plans.js';
export { PLANS, entitlement };
export function billingError(message, status = 402) {
  return Object.assign(new Error(message), { status, code: 'abonnement_requis' });
}
export async function companyBilling(client, ctx, lock = false) {
  return (await client.query(`SELECT * FROM companies WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [ctx.companyId])).rows[0];
}
export async function checkQuota(client, ctx, kind) {
  const company = await companyBilling(client, ctx, true);
  const access = entitlement(company);
  if (!access.writable) throw billingError('Espace en lecture seule. Renouvelez votre abonnement dans Offres & tarifs.');
  const query = kind === 'projects' ? "SELECT count(*)::int AS n FROM projects WHERE status NOT IN ('archive','termine')" : 'SELECT count(*)::int AS n FROM app_users WHERE is_active';
  const n = (await client.query(query)).rows[0].n;
  if (n >= access.plan[kind]) throw billingError(`Limite du forfait atteinte (${access.plan[kind]} ${kind === 'projects' ? 'chantiers ouverts' : 'utilisateurs actifs'}). Archivez, désactivez ou choisissez une offre supérieure.`);
}
