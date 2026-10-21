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
  planifie: 'bg-[#f5f2eb] text-[#3f3932] ring-[#dfd8c8]',
  en_cours: 'bg-[#fdf8ec] text-[#854d0e] ring-[#e6ce96]',
  en_pause: 'bg-orange-100 text-orange-800 ring-orange-200',
  termine: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  archive: 'bg-[#eae4d7] text-[#574f45] ring-[#d5cdbd]',
};

export const PROOF_LEVEL = {
  justificatif: {
    label: 'Pièce jointe',
    hint: 'Un reçu, une photo ou un PDF est joint à l’opération.',
    style: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
  reference: {
    label: 'Référence seule',
    hint: 'Déclaration avec référence écrite, sans pièce jointe.',
    style: 'bg-[#fdf8ec] text-[#854d0e] ring-[#e6ce96]',
  },
  aucun: {
    label: 'Non justifié',
    hint: 'Aucune pièce jointe.',
    style: 'bg-[#eae4d7] text-[#574f45] ring-[#d5cdbd]',
  },
};
