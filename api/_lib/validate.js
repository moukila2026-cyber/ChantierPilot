// Validation stricte des entrées (zod) — doublée des contraintes SQL.
// Les montants sont des entiers FCFA : pas de décimale, bornes réalistes.

import { z } from 'zod';

export const AMOUNT_MIN = 1;
export const AMOUNT_MAX = 999999999999;

const amountSchema = z.union([
  z.number().int('Le montant doit être un nombre entier (FCFA sans décimale).'),
  z.string().regex(/^\d{1,15}$/, 'Le montant doit être un entier en FCFA.'),
]).transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((v) => Number.isSafeInteger(v) && v >= AMOUNT_MIN && v <= AMOUNT_MAX,
    `Le montant doit être compris entre ${AMOUNT_MIN} et ${AMOUNT_MAX.toLocaleString('fr-FR')} FCFA.`);

const budgetSchema = z.union([
  z.number().int(),
  z.string().regex(/^\d{1,15}$/),
]).transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((v) => Number.isSafeInteger(v) && v >= 0 && v <= AMOUNT_MAX,
    `Le budget doit être un entier entre 0 et ${AMOUNT_MAX.toLocaleString('fr-FR')} FCFA.`);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine((d) => {
    const dt = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(dt.getTime()) && dt.getUTCFullYear() >= 2000 && dt.getUTCFullYear() <= 2100;
  }, 'La date doit être comprise entre 2000 et 2100.');

const trimmed = (min, max, label) =>
  z.string().transform((s) => s.trim()).refine((s) => s.length >= min && s.length <= max,
    `${label} doit contenir entre ${min} et ${max} caractères.`);

const optionalText = (max) =>
  z.string().max(max, `Maximum ${max} caractères.`).transform((s) => s.trim()).default('');

export const CATEGORIES = ['materiaux', 'main_oeuvre', 'transport', 'location_materiel', 'sous_traitance', 'frais_divers', 'autre'];
export const STATUSES = ['planifie', 'en_cours', 'en_pause', 'termine', 'archive'];
export const PAYMENT_METHODS = ['especes', 'mobile_money', 'virement_bancaire', 'cheque', 'autre'];

export const CATEGORY_LABELS = {
  materiaux: 'Matériaux',
  main_oeuvre: 'Main d\'œuvre',
  transport: 'Transport',
  location_materiel: 'Location de matériel',
  sous_traitance: 'Sous-traitance',
  frais_divers: 'Frais divers',
  autre: 'Autre',
};

export const STATUS_LABELS = {
  planifie: 'Planifié',
  en_cours: 'En cours',
  en_pause: 'En pause',
  termine: 'Terminé',
  archive: 'Archivé',
};

export const PAYMENT_METHOD_LABELS = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  virement_bancaire: 'Virement bancaire',
  cheque: 'Chèque',
  autre: 'Autre',
};

// Pièces jointes : type vérifié par contenu (magic bytes) côté serveur.
export const fileSchema = z.object({
  filename: z.string().min(1).max(180),
  mime: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  data: z.string().min(8).max(2_800_000), // base64 ≈ 2 Mo max
}).strict();

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Identifiant invalide.');

export const registerSchema = z.object({
  company: z.object({
    name: trimmed(2, 120, 'Le nom de l\'entreprise'),
    rccm: optionalText(60),
    phone: optionalText(30),
    email: z.union([z.literal(''), z.string().email('Adresse e-mail invalide.')]).default(''),
    address: optionalText(240),
    city: trimmed(2, 80, 'La ville').default('Daloa'),
  }).strict(),
  user: z.object({
    full_name: trimmed(2, 120, 'Le nom complet'),
    email: z.string().email('Adresse e-mail invalide.').transform((s) => s.toLowerCase().trim()),
    password: z.string().min(10, 'Le mot de passe doit contenir au moins 10 caractères.')
      .max(200, 'Le mot de passe est trop long.')
      .refine((s) => /[a-zà-ÿ]/i.test(s) && /\d/.test(s), 'Le mot de passe doit contenir au moins une lettre et un chiffre.'),
  }).strict(),
}).strict();

const passwordRule = z.string().min(10, 'Le mot de passe doit contenir au moins 10 caract\u00e8res.')
  .max(200, 'Le mot de passe est trop long.')
  .refine((s) => /[a-z\u00e0-\u00ff]/i.test(s) && /\d/.test(s), 'Le mot de passe doit contenir au moins une lettre et un chiffre.');

export const teamCreateSchema = z.object({
  full_name: trimmed(2, 120, 'Le nom complet'),
  email: z.string().email('Adresse e-mail invalide.').transform((s) => s.toLowerCase().trim()),
  password: passwordRule,
}).strict();

export const teamUpdateSchema = z.object({
  full_name: trimmed(2, 120, 'Le nom complet').optional(),
  is_active: z.boolean().optional(),
  password: passwordRule.optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Aucune modification fournie.' });

export const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide.').transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1, 'Mot de passe requis.').max(200),
}).strict();

export const companyUpdateSchema = z.object({
  name: trimmed(2, 120, 'Le nom de l\'entreprise').optional(),
  rccm: optionalText(60).optional(),
  phone: optionalText(30).optional(),
  email: z.union([z.literal(''), z.string().email('Adresse e-mail invalide.')]).optional(),
  address: optionalText(240).optional(),
  city: trimmed(2, 80, 'La ville').optional(),
}).strict();

export const projectCreateSchema = z.object({
  name: trimmed(2, 160, 'Le nom du chantier'),
  client_name: trimmed(2, 160, 'Le nom du client'),
  location: optionalText(200),
  budget: budgetSchema,
  start_date: dateSchema,
  end_date: dateSchema.nullable().optional().default(null),
  status: z.enum(STATUSES).default('en_cours'),
  notes: optionalText(2000),
}).strict().refine((d) => !d.end_date || d.end_date >= d.start_date, {
  message: 'La date de fin doit être postérieure à la date de début.',
  path: ['end_date'],
}).refine((d) => d.status !== 'archive', {
  message: 'Un nouveau chantier ne peut pas être créé archivé.',
  path: ['status'],
});

export const projectUpdateSchema = z.object({
  name: trimmed(2, 160, 'Le nom du chantier').optional(),
  client_name: trimmed(2, 160, 'Le nom du client').optional(),
  location: optionalText(200).optional(),
  budget: budgetSchema.optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.nullable().optional(),
  status: z.enum(STATUSES).optional(),
  notes: optionalText(2000).optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Aucune modification fournie.' });

export const expenseSchema = z.object({
  project_id: uuid,
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Catégorie invalide.' }) }),
  amount: amountSchema,
  expense_date: dateSchema,
  supplier: optionalText(160),
  description: optionalText(500),
  receipt: fileSchema.nullable().optional().default(null),
}).strict();

export const expenseUpdateSchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  amount: amountSchema.optional(),
  expense_date: dateSchema.optional(),
  supplier: optionalText(160).optional(),
  description: optionalText(500).optional(),
  receipt: fileSchema.nullable().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Aucune modification fournie.' });

export const paymentSchema = z.object({
  project_id: uuid,
  client_name: trimmed(2, 160, 'Le nom du client'),
  amount: amountSchema,
  payment_date: dateSchema,
  reference: trimmed(2, 120, 'La référence (n° de reçu, réf. de virement…)'),
  payment_method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'Mode de paiement invalide.' }) }),
  memo: optionalText(500),
  proof: fileSchema.nullable().optional().default(null),
}).strict();

export const paymentUpdateSchema = z.object({
  client_name: trimmed(2, 160, 'Le nom du client').optional(),
  amount: amountSchema.optional(),
  payment_date: dateSchema.optional(),
  reference: trimmed(2, 120, 'La référence').optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  memo: optionalText(500).optional(),
  proof: fileSchema.nullable().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, { message: 'Aucune modification fournie.' });

/** Transforme les erreurs zod en { code, message, fields }. */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0] || 'Données invalides.';
  const err = new Error(first);
  err.status = 422;
  err.code = 'validation';
  err.fields = fields;
  throw err;
}

/** Vérifie le contenu réel du fichier (magic bytes) au-delà du MIME annoncé. */
export function sniffFile(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}
