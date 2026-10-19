// Calculs entiers : quantités au millième, taux en points de base, arrondi au FCFA.
const invalid = message => Object.assign(new Error(message), { status: 422, code: 'calcul_invalide' });
const MAX = 999999999999n;
export function quantityMilli(value) {
  const text = String(value);
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(text)) throw invalid('Quantité positive attendue, avec trois décimales au maximum.');
  const [whole, fraction=''] = text.split('.');
  const result = Number(whole)*1000 + Number(fraction.padEnd(3,'0'));
  if (result < 1 || result > 1000000000) throw invalid('Quantité hors limites.');
  return result;
}
export function roundedRatio(amount, numerator, denominator) {
  const result = (BigInt(amount)*BigInt(numerator) + BigInt(denominator)/2n)/BigInt(denominator);
  if (result < 0 || result > MAX) throw invalid('Montant hors limites.');
  return Number(result);
}
export function quoteTotals(lines, taxBps = 0) {
  if (!Number.isInteger(taxBps) || taxBps < 0 || taxBps > 10000 || !lines.length || lines.length > 100) throw invalid('Lignes ou taux invalides.');
  let subtotal = 0n, cost = 0n;
  const result = lines.map(line => {
    for (const k of ['unit_price','unit_cost']) if (!Number.isSafeInteger(line[k]) || line[k]<0 || BigInt(line[k])>MAX) throw invalid('Prix unitaire invalide.');
    const quantity_milli = quantityMilli(line.quantity);
    const total = roundedRatio(line.unit_price, quantity_milli, 1000);
    subtotal += BigInt(total); cost += BigInt(roundedRatio(line.unit_cost,quantity_milli,1000));
    return { ...line, quantity_milli, total };
  });
  if (subtotal > MAX || cost > MAX) throw invalid('Montant hors limites.');
  const tax = roundedRatio(subtotal,taxBps,10000);
  if (subtotal+BigInt(tax) > MAX || subtotal+BigInt(tax) < 1n) throw invalid('Total invalide.');
  return { lines: result, subtotal: Number(subtotal), tax, total: Number(subtotal)+tax, estimated_cost: Number(cost) };
}
