// Synthèses financières en FCFA et partage direct WhatsApp (`wa.me`).
// Normalise automatiquement les numéros ivoiriens à 10 chiffres (01/05/07/25/27) vers +225.

import { formatFcfa, formatDate } from './format.js';

export function normalizeWhatsappPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d+]/g, '');
  const clean = digits.startsWith('+') ? digits.slice(1) : digits.startsWith('00') ? digits.slice(2) : digits;
  if (!clean) return '';
  if (clean.length === 10 && /^(01|05|07|25|27)/.test(clean)) return `225${clean}`;
  return clean;
}

export function whatsappHref(phone, text) {
  const num = normalizeWhatsappPhone(phone);
  const encoded = encodeURIComponent(text);
  return num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildProjectSummaryText(project, totals, companyName = '') {
  const budget = Number(totals?.budget ?? project.budget ?? 0);
  const paid = Number(totals?.payments_total ?? project.payments_total ?? 0);
  const bps = Number(project.retention_bps || 0);
  const retention = bps > 0 && !project.retention_released
    ? Math.round((budget * bps) / 10000)
    : 0;
  const collectible = Math.max(0, budget - retention - paid);
  const lines = [
    `Bonjour ${project.client_name || ''},`.trim(),
    `Point financier du chantier « ${project.name} »${companyName ? ` (${companyName})` : ''} :`,
    `• Montant de référence : ${formatFcfa(budget)}`,
    `• Règlements enregistrés : ${formatFcfa(paid)}`,
  ];
  if (retention > 0) {
    lines.push(
      `• Retenue de garantie (${bps / 100} %) : ${formatFcfa(retention)}${project.retention_release_date ? ` (mainlevée prévue le ${formatDate(project.retention_release_date)})` : ''}`,
    );
    lines.push(`• Solde net encaissable hors retenue : ${formatFcfa(collectible)}`);
  } else {
    lines.push(`• Reste à régler sur le marché : ${formatFcfa(Math.max(0, budget - paid))}`);
  }
  lines.push('Cordialement.');
  return lines.join('\n');
}

export function buildDocumentSummaryText(doc, companyName = '') {
  const label = doc.kind === 'quote' ? 'Devis' : doc.kind === 'invoice' ? 'Facture' : 'Avoir';
  const lines = [
    `Bonjour ${doc.client_name || ''},`.trim(),
    `${label} ${doc.number} — ${doc.title}${companyName ? ` (${companyName})` : ''}`,
    `• Montant total : ${formatFcfa(doc.total)}`,
  ];
  if (doc.kind === 'invoice') {
    const due = Math.max(0, Number(doc.total || 0) - Number(doc.paid || 0) - Number(doc.credited || 0));
    lines.push(`• Déjà réglé : ${formatFcfa(doc.paid || 0)}`);
    lines.push(`• Reste à régler : ${formatFcfa(due)}`);
    if (doc.due_date) lines.push(`• Échéance : ${formatDate(doc.due_date)}`);
  } else if (doc.due_date) {
    lines.push(`• Validité : jusqu’au ${formatDate(doc.due_date)}`);
  }
  lines.push('Cordialement.');
  return lines.join('\n');
}

export function buildSubcontractSummaryText(sub, projectName = '') {
  return [
    `Bonjour ${sub.subcontractor_name},`,
    `Point du contrat lot « ${sub.trade_lot} »${projectName ? ` (${projectName})` : ''} :`,
    `• Forfait convenu : ${formatFcfa(sub.agreed_amount)}`,
    `• Acomptes versés : ${formatFcfa(sub.paid_amount)} (${sub.paid_pct} %)`,
    `• Avancement constaté : ${sub.progress} %`,
    `• Solde restant : ${formatFcfa(sub.remaining_amount)}`,
  ].join('\n');
}
