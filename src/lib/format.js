// Formatage FCFA et dates (fr-FR).

export function formatFcfa(n) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n) || 0);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso) : iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateLong(iso) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso) : iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function signedFcfa(n) {
  const v = Number(n) || 0;
  return `${v < 0 ? '−' : ''}${formatFcfa(Math.abs(v))}`;
}
