const SMALL = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
];

function underTwenty(n) {
  if (n < SMALL.length) return SMALL[n];
  return `dix-${SMALL[n - 10]}`;
}

function underHundred(n) {
  if (n < 20) return underTwenty(n);
  if (n < 70) {
    const tens = Math.floor(n / 10);
    const units = n % 10;
    const names = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
    if (!units) return names[tens];
    return `${names[tens]}${units === 1 ? ' et ' : '-'}${SMALL[units]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${underTwenty(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${underTwenty(n - 80)}`;
}

function underThousand(n) {
  if (n < 100) return underHundred(n);
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const prefix = hundreds === 1 ? 'cent' : `${SMALL[hundreds]} cent`;
  if (!remainder) return hundreds === 1 ? prefix : `${prefix}s`;
  return `${prefix} ${underHundred(remainder)}`;
}

function integerInFrench(n) {
  if (n === 0) return 'zéro';
  const units = ['', 'mille', 'million', 'milliard'];
  const parts = [];
  let group = 0;
  while (n > 0) {
    const value = n % 1000;
    if (value) {
      if (group === 1) {
        const thousandPrefix = underThousand(value).replace(/cents$/, 'cent').replace(/quatre-vingts$/, 'quatre-vingt');
        parts.unshift(value === 1 ? 'mille' : `${thousandPrefix} mille`);
      } else if (group > 1) {
        const amount = underThousand(value);
        parts.unshift(`${amount} ${units[group]}${value > 1 ? 's' : ''}`);
      } else {
        parts.unshift(underThousand(value));
      }
    }
    n = Math.floor(n / 1000);
    group += 1;
  }
  return parts.join(' ');
}

/** Montant entier FCFA en toutes lettres (borne de l'application : 999 999 999 999). */
export function amountInWordsFcfa(amount) {
  const n = Number(amount);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 999_999_999_999) {
    throw new RangeError('Le montant doit être un entier FCFA compris entre −999 999 999 999 et 999 999 999 999.');
  }
  const absolute = Math.abs(n);
  const sign = n < 0 ? 'moins ' : '';
  return `${sign}${integerInFrench(absolute)} ${absolute <= 1 ? 'franc CFA' : 'francs CFA'}`;
}
