import {
  PLANS,
  TRIAL_DAYS,
  TRIAL_DURATION_MS,
  TRIAL_ROLLOUT_ISO,
  TRIAL_ROLLOUT_MS,
  entitlement,
  resolveTrialUntil,
  trialDaysRemaining,
} from '../../shared/plans.js';

export { PLANS, TRIAL_DAYS, entitlement, resolveTrialUntil, trialDaysRemaining };

export function billingError(message, status = 402) {
  return Object.assign(new Error(message), { status, code: 'abonnement_requis' });
}

export async function companyBilling(client, ctx, lock = false) {
  let row = (await client.query(`SELECT * FROM companies WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [ctx.companyId])).rows[0];
  if (!row) return row;

  // Mise à niveau automatique et idempotente des espaces créés avant le passage garanti
  // à 2 semaines (14 jours pleins) afin qu'aucun ancien espace n'hérite d'un essai de 1-2 jours.
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
  const minTrialEndMs = TRIAL_ROLLOUT_MS + TRIAL_DURATION_MS;
  const currentTrialMs = row.trial_until ? new Date(row.trial_until).getTime() : NaN;

  if (
    !row.billing_suspended
    && !Number.isNaN(createdMs)
    && createdMs < TRIAL_ROLLOUT_MS
    && Object.prototype.hasOwnProperty.call(row, 'trial_until')
    && (Number.isNaN(currentTrialMs) || currentTrialMs < minTrialEndMs)
  ) {
    await client.query('SAVEPOINT cp_trial_upgrade');
    try {
      const targetIso = new Date(Math.max(createdMs, TRIAL_ROLLOUT_MS) + TRIAL_DURATION_MS).toISOString();
      const updated = await client.query(
        'UPDATE companies SET trial_until = GREATEST(COALESCE(trial_until, $2::timestamptz), $2::timestamptz) WHERE id = $1 RETURNING *',
        [ctx.companyId, targetIso],
      );
      await client.query('RELEASE SAVEPOINT cp_trial_upgrade');
      if (updated.rows[0]) row = updated.rows[0];
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT cp_trial_upgrade').catch(() => {});
    }
  }

  return row;
}

export async function checkQuota(client, ctx, kind) {
  const company = await companyBilling(client, ctx, true);
  const access = entitlement(company);
  if (!access.writable) throw billingError('Espace en lecture seule. Renouvelez votre abonnement dans Offres & tarifs.');
  const query = kind === 'projects'
    ? "SELECT count(*)::int AS n FROM projects WHERE status NOT IN ('archive','termine')"
    : 'SELECT count(*)::int AS n FROM app_users WHERE is_active';
  const n = (await client.query(query)).rows[0].n;
  if (n >= access.plan[kind]) {
    throw billingError(`Limite du forfait atteinte (${access.plan[kind]} ${kind === 'projects' ? 'chantiers ouverts' : 'utilisateurs actifs'}). Archivez, désactivez ou choisissez une offre supérieure.`);
  }
}
