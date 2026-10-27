// Export CSV (RFC 4180, BOM UTF-8 pour Excel francophone).

export function toCsv(headers, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Excel et d'autres tableurs interprètent certaines cellules texte comme
    // des formules. Préfixer ces valeurs par une apostrophe sans altérer les
    // nombres réellement typés ni les données enregistrées en base.
    if (typeof v !== 'number' && typeof v !== 'bigint' && (
      /^[\u0000-\u0020\u00a0\u200b-\u200d\u2060\ufeff]*[=+\-@]/u.test(s)
      || /^[ \u00a0]*[\t\r\n]/u.test(s)
    )) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(';')];
  for (const row of rows) {
    lines.push(row.map(escape).join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function sendCsv(res, filename, content) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(content);
}
