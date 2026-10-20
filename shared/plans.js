export const TRIAL_DAYS = 14;
export const TRIAL_DURATION_MS = TRIAL_DAYS * 86_400_000;
export const TRIAL_ROLLOUT_ISO = '2026-10-20T09:55:00.000Z';
export const TRIAL_ROLLOUT_MS = Date.parse(TRIAL_ROLLOUT_ISO);

export const PLANS = {
  essentiel: { name: 'Essentiel', price: 9900, projects: 3, users: 2, description: 'Artisans et petites entreprises : maîtrisez chaque dépense.' },
  equipe: { name: 'Équipe', price: 19900, projects: 10, users: 6, description: 'Plusieurs équipes : centralisez les justificatifs et la trésorerie.' },
  entreprise: { name: 'Entreprise', price: 39900, projects: 30, users: 20, description: 'PME BTP : gardez une vue consolidée sur votre portefeuille.' },
};

export function resolveTrialUntil(company) {
  if (company?.trial_until) return company.trial_until;
  if (company?.created_at) {
    const createdMs = new Date(company.created_at).getTime();
    if (!Number.isNaN(createdMs)) {
      const anchor = Math.max(createdMs, TRIAL_ROLLOUT_MS);
      return new Date(anchor + TRIAL_DURATION_MS).toISOString();
    }
  }
  return null;
}

export function trialDaysRemaining(trialUntil, now = Date.now()) {
  if (!trialUntil) return 0;
  const end = new Date(trialUntil).getTime();
  if (Number.isNaN(end) || end <= now) return 0;
  return Math.max(1, Math.ceil((end - now) / 86_400_000));
}

export function entitlement(company, now = Date.now()) {
  const paid = company.billing_plan && new Date(company.paid_until).getTime() > now;
  const effectiveTrialUntil = resolveTrialUntil(company);
  const trial = Boolean(effectiveTrialUntil && new Date(effectiveTrialUntil).getTime() > now);
  return {
    writable: !company.billing_suspended && (paid || trial),
    plan: PLANS[paid ? company.billing_plan : 'essentiel'] || PLANS.essentiel,
    status: company.billing_suspended ? 'suspendu' : paid ? 'actif' : trial ? 'essai' : 'lecture_seule',
    trial_days: TRIAL_DAYS,
    trial_days_remaining: trial ? trialDaysRemaining(effectiveTrialUntil, now) : 0,
  };
}
