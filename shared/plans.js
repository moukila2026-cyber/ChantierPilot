export const PLANS = {
  essentiel: { name: 'Essentiel', price: 9900, projects: 3, users: 2, description: 'Artisans et petites entreprises : maîtrisez chaque dépense.' },
  equipe: { name: 'Équipe', price: 19900, projects: 10, users: 6, description: 'Plusieurs équipes : centralisez les justificatifs et la trésorerie.' },
  entreprise: { name: 'Entreprise', price: 39900, projects: 30, users: 20, description: 'PME BTP : gardez une vue consolidée sur votre portefeuille.' },
};
export function entitlement(company, now = Date.now()) {
  const paid = company.billing_plan && new Date(company.paid_until).getTime() > now;
  const trial = new Date(company.trial_until).getTime() > now;
  return { writable: !company.billing_suspended && (paid || trial), plan: PLANS[paid ? company.billing_plan : 'essentiel'] || PLANS.essentiel, status: company.billing_suspended ? 'suspendu' : paid ? 'actif' : trial ? 'essai' : 'lecture_seule' };
}
