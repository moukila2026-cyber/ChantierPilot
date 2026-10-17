// Libellés métier (miroir de api/_lib/validate.js — volontairement dupliqués
// pour garder le frontend et le backend indépendants).

export const CATEGORIES = [
  ['materiaux', 'Matériaux'],
  ['main_oeuvre', 'Main d\'œuvre'],
  ['transport', 'Transport'],
  ['location_materiel', 'Location de matériel'],
  ['sous_traitance', 'Sous-traitance'],
  ['frais_divers', 'Frais divers'],
  ['autre', 'Autre'],
];

export const STATUSES = [
  ['planifie', 'Planifié'],
  ['en_cours', 'En cours'],
  ['en_pause', 'En pause'],
  ['termine', 'Terminé'],
  ['archive', 'Archivé'],
];

export const PAYMENT_METHODS = [
  ['especes', 'Espèces'],
  ['mobile_money', 'Mobile Money'],
  ['virement_bancaire', 'Virement bancaire'],
  ['cheque', 'Chèque'],
  ['autre', 'Autre'],
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
export const STATUS_LABELS = Object.fromEntries(STATUSES);
export const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS);

export const STATUS_STYLES = {
  planifie: 'bg-slate-100 text-slate-700 ring-slate-200',
  en_cours: 'bg-amber-100 text-amber-800 ring-amber-200',
  en_pause: 'bg-orange-100 text-orange-800 ring-orange-200',
  termine: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  archive: 'bg-slate-200 text-slate-500 ring-slate-300',
};
