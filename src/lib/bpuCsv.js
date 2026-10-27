// Import BPU : ne jamais modifier silencieusement un prix ou tronquer des lignes.
export const MAX_BPU_ITEMS = 200;
export const MAX_BPU_TEXT_LENGTH = 2_000_000;
const MAX_PRICE = 999_999_999_999;

function delimiterFor(text) {
  const counts = new Map([[';', 0], ['\t', 0], [',', 0]]);
  let quoted = false;
  const start = text.search(/\S/);
  for (let i = Math.max(start, 0); i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && char === '\n') break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
  }
  const [separator, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? separator : null;
}

function readRows(text, separator) {
  const rows = [];
  let fields = [], field = '', quoted = false, afterQuote = false;
  let line = 1, rowLine = 1;
  const pushField = () => { fields.push(field.trim()); field = ''; afterQuote = false; };
  const pushRow = () => {
    pushField();
    if (fields.some((value) => value !== '')) rows.push({ fields, line: rowLine });
    fields = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else { field += char; if (char === '\n') line += 1; }
    } else if (char === separator) {
      pushField();
    } else if (char === '\n') {
      pushRow(); line += 1; rowLine = line;
    } else if (char === '"' && !afterQuote && !field.trim()) {
      field = ''; quoted = true;
    } else if (char === '"' || (afterQuote && !/\s/.test(char))) {
      return { rows: [], error: `Ligne ${line} : guillemets CSV mal placés.` };
    } else if (!afterQuote) {
      field += char;
    }
  }
  if (quoted) return { rows: [], error: `Ligne ${rowLine} : guillemet CSV non refermé.` };
  pushRow();
  return { rows, error: null };
}

function amount(value) {
  const text = value.trim();
  // Espaces ordinaires ou insécables acceptés comme séparateurs de milliers.
  // Les virgules, points, signes et lettres ne sont jamais supprimés en silence.
  if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(text)) return null;
  const n = Number(text.replace(/[ \u00a0\u202f]/g, ''));
  return Number.isSafeInteger(n) && n <= MAX_PRICE ? n : null;
}

export function parseBpuCsv(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return { items: [], errors: [] };
  if (text.length > MAX_BPU_TEXT_LENGTH) return { items: [], errors: ['Le contenu dépasse la limite de 2 millions de caractères.'] };
  const separator = delimiterFor(text);
  if (!separator) return { items: [], errors: ['Séparateur introuvable : utilisez ;, une tabulation ou une virgule.'] };
  const { rows, error } = readRows(text, separator);
  if (error) return { items: [], errors: [error] };

  const items = [], errors = [];
  let itemRows = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const { fields, line } = rows[index];
    const first = (fields[0] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const third = (fields[2] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (index === 0 && /designation|libelle|ouvrage|article|poste/.test(first) && /prix|montant|vente/.test(third)) continue;
    itemRows += 1;
    if (itemRows > MAX_BPU_ITEMS) {
      errors.push(`Le bordereau dépasse ${MAX_BPU_ITEMS} postes : répartissez-le en plusieurs imports.`);
      break;
    }
    if (fields.length < 3 || fields.length > 4) {
      errors.push(`Ligne ${line} : indiquez trois ou quatre colonnes.`);
      continue;
    }
    const [label, unit, priceText, costText = ''] = fields;
    if (label.length < 2 || label.length > 160 || unit.length < 1 || unit.length > 30) {
      errors.push(`Ligne ${line} : désignation ou unité invalide (2–160 et 1–30 caractères).`);
      continue;
    }
    const unit_price = amount(priceText);
    const unit_cost = costText ? amount(costText) : 0;
    if (unit_price === null || unit_cost === null) {
      errors.push(`Ligne ${line} : prix et coût doivent être des entiers FCFA positifs ou nuls (espaces par groupes de trois, sans virgule, point ni signe).`);
      continue;
    }
    items.push({ label, unit, unit_price, unit_cost });
  }
  return { items, errors };
}
