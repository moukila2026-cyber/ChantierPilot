// Transforme le CSS généré par Tailwind CSS v4 en CSS3 universel compatible
// tous navigateurs desktop & mobiles (y compris Safari/iOS anciens, Android WebView,
// Chrome/Edge anciens) :
//   1. Remplace les variables initialisées via @property par une règle universelle *,::before,::after
//   2. Aplatit tous les blocs @layer dans l'ordre exact de cascade CSS
//   3. Supprime les surcharges progressives @supports (color: color-mix(...))
//   4. Convertit mathématiquement toutes les couleurs oklch(...) et oklab(...) en #hex / rgba(...)
//   5. Passe par esbuild CSS target safari13 / chrome79 (convertit inset, logical props, #rrggbbaa, etc.)

import * as esbuild from 'esbuild';

function clampByte(x) {
  return Math.max(0, Math.min(255, Math.round(x * 255)));
}

function linearToSrgb(c) {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * (v ** (1 / 2.4)) - 0.055;
}

function oklabToRgba(L, a, b, alpha = 1) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const r = clampByte(linearToSrgb(rLin));
  const g = clampByte(linearToSrgb(gLin));
  const bl = clampByte(linearToSrgb(bLin));

  if (alpha < 0.999) {
    const aClean = Number(Math.max(0, Math.min(1, alpha)).toFixed(3));
    return `rgba(${r},${g},${bl},${aClean})`;
  }
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function parsePercentOrNumber(tok, scale = 1) {
  const s = tok.trim();
  if (s.endsWith('%')) return (parseFloat(s) / 100) * scale;
  return parseFloat(s);
}

function parseAngleRad(tok) {
  const s = tok.trim().toLowerCase();
  if (s.endsWith('rad')) return parseFloat(s);
  if (s.endsWith('turn')) return parseFloat(s) * 2 * Math.PI;
  if (s.endsWith('grad')) return (parseFloat(s) * Math.PI) / 200;
  return (parseFloat(s) * Math.PI) / 180;
}

export function convertOklchAndOklab(css) {
  let out = css.replace(/oklch\(\s*([^)]+)\)/gi, (_, body) => {
    const [coords, alphaPart] = body.split('/');
    const parts = coords.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return '#141210';
    const L = parsePercentOrNumber(parts[0], 1);
    const C = parsePercentOrNumber(parts[1], 0.4);
    const h = parseAngleRad(parts[2]);
    const alpha = alphaPart !== undefined ? parsePercentOrNumber(alphaPart, 1) : 1;
    return oklabToRgba(L, C * Math.cos(h), C * Math.sin(h), alpha);
  });

  out = out.replace(/oklab\(\s*([^)]+)\)/gi, (_, body) => {
    const [coords, alphaPart] = body.split('/');
    const parts = coords.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return '#141210';
    const L = parsePercentOrNumber(parts[0], 1);
    const a = parsePercentOrNumber(parts[1], 0.4);
    const b = parsePercentOrNumber(parts[2], 0.4);
    const alpha = alphaPart !== undefined ? parsePercentOrNumber(alphaPart, 1) : 1;
    return oklabToRgba(L, a, b, alpha);
  });

  return out;
}

// Extrait un bloc équilibré { ... } à partir de l'accolade ouvrante à `openIdx`.
function findMatchingBrace(src, openIdx) {
  let depth = 0;
  let quote = '';
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const endComment = src.indexOf('*/', i + 2);
      i = endComment === -1 ? src.length : endComment + 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length - 1;
}

function stripAtBlocks(css, predicate) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '@') {
      const semi = css.indexOf(';', i);
      const brace = css.indexOf('{', i);
      if (semi !== -1 && (brace === -1 || semi < brace)) {
        const stmt = css.slice(i, semi + 1);
        const replacement = predicate(stmt, null);
        if (replacement === false) out += stmt;
        else if (typeof replacement === 'string') out += replacement;
        i = semi + 1;
        continue;
      }
      if (brace !== -1) {
        const header = css.slice(i, brace).trim();
        const close = findMatchingBrace(css, brace);
        const inner = css.slice(brace + 1, close);
        const replacement = predicate(header, inner);
        if (replacement === false) {
          out += `${header}{${stripAtBlocks(inner, predicate)}}`;
        } else if (typeof replacement === 'string') {
          out += replacement;
        }
        i = close + 1;
        continue;
      }
    }
    out += css[i++];
  }
  return out;
}

export async function flattenToUniversalCss(rawCss) {
  const propertyDefaults = [];

  // 1. Collecte les @property --tw-* initial-value puis retire @property
  let step1 = stripAtBlocks(rawCss, (header, inner) => {
    if (header.startsWith('@property ')) {
      if (inner !== null) {
        const name = header.slice('@property'.length).trim();
        const initMatch = inner.match(/initial-value\s*:\s*([^;]+)/i);
        if (name.startsWith('--') && initMatch) {
          propertyDefaults.push(`${name}:${initMatch[1].trim()}`);
        }
      }
      return '';
    }
    return false;
  });

  // 2. Retire @supports contenant color-mix / lab / -webkit-hyphens (le fallback universel est fourni via propertyDefaults)
  step1 = stripAtBlocks(step1, (header) => {
    if (
      header.startsWith('@supports')
      && (header.includes('color-mix') || header.includes('margin-trim') || header.includes('moz-orient'))
    ) {
      return '';
    }
    return false;
  });

  // 3. Déplie tous les @layer <nom> { ... } en conservant exactement leur ordre d'apparition
  let unlayered = step1;
  while (unlayered.includes('@layer')) {
    unlayered = stripAtBlocks(unlayered, (header, inner) => {
      if (header.startsWith('@layer')) {
        return inner === null ? '' : inner;
      }
      return false;
    });
  }

  // 4. Préfixe les valeurs initiales universelles des custom properties Tailwind
  const initBlock = propertyDefaults.length > 0
    ? `*,::before,::after,::backdrop{${propertyDefaults.join(';')}}`
    : '';

  // 5. Convertit toutes les couleurs oklch() / oklab() en #hex / rgba()
  let clean = convertOklchAndOklab(`${initBlock}\n${unlayered}`);
  // Nettoyage de sûreté si un color-mix résiduel subsistait (ex. placeholder)
  clean = clean.replace(/color-mix\([^)]*\)/gi, 'rgba(120,113,108,0.65)');

  // 6. Passe finale esbuild synchrone (aucun démon résident ; cible navigateurs larges : convertit inset, padding-inline, #rrggbbaa, etc.)
  const result = esbuild.transformSync(clean, {
    loader: 'css',
    target: ['chrome79', 'safari13', 'ios13', 'firefox72'],
    minify: true,
  });

  return result.code;
}
