// Génération du rapport PDF par chantier (pdfkit, rendu serveur).
// En-tête Noir Charbon & Or : identité de L'ENTREPRISE concernée (récupérée en base).
// Le rapport est explicite sur la nature « déclarée » des encaissements.

import PDFDocument from 'pdfkit';
import { amountInWordsFcfa } from './money.js';

export function formatFcfa(n) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;
}

export function formatDateFr(iso) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const PDF_CHARCOAL = '#141210';
export const PDF_GOLD = '#d4941e';
export const PDF_GOLD_DARK = '#854d0e';
export const PDF_GRAY = '#574f45';
export const PDF_LIGHT = '#e3ddd0';
export const PDF_HEAD_BG = '#f5f2eb';

export function drawBrandMark(doc, x = 48, y = 42) {
  const dx = x - 48;
  const dy = y - 42;
  doc.save();
  doc.roundedRect(48 + dx, 42 + dy, 28, 28, 6).fillAndStroke(PDF_CHARCOAL, PDF_GOLD);
  doc.moveTo(52 + dx, 55 + dy).lineTo(62 + dx, 47 + dy).lineTo(72 + dx, 55 + dy).lineWidth(1.7).lineJoin('round').strokeColor('#f4a340').stroke();
  doc.moveTo(54 + dx, 55 + dy).lineTo(54 + dx, 65 + dy).lineTo(59 + dx, 65 + dy).lineTo(59 + dx, 60 + dy).lineTo(65 + dx, 60 + dy).lineTo(65 + dx, 65 + dy).lineTo(70 + dx, 65 + dy).lineTo(70 + dx, 55 + dy)
    .lineWidth(1.3).lineJoin('round').strokeColor('#f4a340').stroke();
  doc.moveTo(57 + dx, 59 + dy).lineTo(58.5 + dx, 60.5 + dy).lineTo(61 + dx, 57.5 + dy).moveTo(64 + dx, 59 + dy).lineTo(65.5 + dx, 60.5 + dy).lineTo(68 + dx, 57.5 + dy)
    .lineWidth(0.8).lineCap('round').lineJoin('round').strokeColor('#fbf8f1').stroke();
  doc.moveTo(62 + dx, 50 + dy).lineTo(65 + dx, 52.5 + dy).lineTo(62 + dx, 55 + dy).lineWidth(1).lineCap('round').lineJoin('round').strokeColor('#fbf8f1').stroke();
  doc.restore();
}

function header(doc, company, title, subtitle) {
  drawBrandMark(doc, 48, 42);
  doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(18).text(company.name || 'Entreprise', 84, 45);
  doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8.5);
  const contact = [
    company.rccm ? `RCCM : ${company.rccm}` : null,
    company.phone ? `Téléphone : ${company.phone}` : null,
    company.email ? `E-mail : ${company.email}` : null,
    [company.address, company.city].filter(Boolean).join(' — ') || null,
  ].filter(Boolean);
  let y = 68;
  for (const line of contact) {
    doc.text(line, 84, y, { width: 463 });
    y += 11;
  }
  doc.moveTo(48, y + 6).lineTo(547, y + 6).lineWidth(1.4).strokeColor(PDF_GOLD).stroke();
  doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(13).text(title, 48, y + 18);
  doc.fillColor(PDF_GOLD_DARK).font('Helvetica').fontSize(9).text(subtitle, 48, y + 36);
  return y + 58;
}

function sectionTitle(doc, text, y) {
  doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(11).text(text, 48, y);
  return y + 16;
}

function keyValueTable(doc, y, rows, labelWidth = 160) {
  for (const [k, v] of rows) {
    const valueWidth = 440 - labelWidth;
    const text = String(v);
    doc.font('Helvetica-Bold').fontSize(9);
    const height = Math.max(15, doc.heightOfString(text, { width: valueWidth }));
    if (y + height > 760) { doc.addPage(); y = 56; }
    doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(9).text(k, 48, y, { width: labelWidth });
    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(9).text(text, 48 + labelWidth + 8, y, { width: valueWidth });
    y += height + 3;
  }
  return y + 6;
}

function formatFcfaInWords(amount) {
  return `${formatFcfa(amount)} — ${amountInWordsFcfa(Math.round(Number(amount) || 0))}`;
}

function table(doc, y, columns, rows, footerRow) {
  const pageBottom = 790;
  const drawHead = () => {
    doc.rect(48, y, 499, 18).fill(PDF_CHARCOAL);
    let x = 48 + 6;
    doc.fillColor('#eab956').font('Helvetica-Bold').fontSize(8);
    for (const col of columns) {
      doc.text(col.label, x, y + 5, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    y += 18;
    doc.fillColor(PDF_CHARCOAL);
  };
  drawHead();
  doc.font('Helvetica').fontSize(8.5);
  for (const row of rows) {
    let h = 16;
    for (const col of columns) {
      const val = String(col.value(row) ?? '');
      const th = doc.heightOfString(val, { width: col.width - 8 });
      if (th + 8 > h) h = th + 8;
    }
    if (y + h > pageBottom) {
      doc.addPage();
      y = 56;
      drawHead();
      doc.font('Helvetica').fontSize(8.5);
    }
    let x = 48 + 6;
    for (const col of columns) {
      const val = String(col.value(row) ?? '');
      doc.fillColor(PDF_CHARCOAL).text(val, x, y + 4, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    doc.moveTo(48, y + h).lineTo(547, y + h).lineWidth(0.4).strokeColor(PDF_LIGHT).stroke();
    y += h;
  }
  if (footerRow) {
    if (y + 20 > pageBottom) { doc.addPage(); y = 56; }
    doc.rect(48, y, 499, 18).fill(PDF_HEAD_BG);
    let x = 48 + 6;
    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5);
    for (const col of columns) {
      doc.text(String(col.footer?.() ?? ''), x, y + 5, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    y += 22;
    doc.fillColor(PDF_CHARCOAL);
  }
  return y + 8;
}

/**
 * Construit le rapport PDF. Retourne une promesse du buffer complet.
 * @param {{company: object, project: object, expenses: array, payments: array, totals: object}} data
 */
export function buildProjectReport(data) {
  const { company, project, expenses, payments, totals } = data;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const statusLabel = {
        planifie: 'Planifié', en_cours: 'En cours', en_pause: 'En pause',
        termine: 'Terminé', archive: 'Archivé',
      }[project.status] || project.status;

      let y = header(
        doc, company,
        `Rapport de chantier — ${project.name}`,
        `Document généré le ${formatDateFr(new Date())} · Montants en FCFA (XOF)`,
      );

      y = sectionTitle(doc, 'Identification du chantier', y);
      y = keyValueTable(doc, y, [
        ['Client', project.client_name],
        ['Localisation', project.location || '—'],
        ['Statut', statusLabel],
        ['Date de début', formatDateFr(project.start_date)],
        ['Date de fin', project.end_date ? formatDateFr(project.end_date) : 'Non définie'],
        ['Budget prévisionnel', formatFcfaInWords(project.budget)],
      ]);

      y = sectionTitle(doc, 'Synthèse financière', y);
      y = keyValueTable(doc, y, [
        ['Budget prévisionnel', formatFcfaInWords(totals.budget)],
        ['Total des dépenses', formatFcfaInWords(totals.expenses_total)],
        ['Total des encaissements déclarés', formatFcfaInWords(totals.payments_total)],
        ['Solde client (reste à encaisser)', formatFcfaInWords(totals.reste_a_encaisser)],
        ['Résultat provisoire (encaissements − dépenses)', formatFcfaInWords(totals.resultat_provisionnel)],
      ]);

      y = sectionTitle(doc, `Dépenses (${expenses.length})`, y);
      y = table(doc, y, [
        { label: 'Date', width: 70, value: (r) => formatDateFr(r.expense_date) },
        { label: 'Catégorie', width: 90, value: (r) => r.category },
        { label: 'Fournisseur', width: 95, value: (r) => r.supplier || '—' },
        { label: 'Description', width: 160, value: (r) => r.description || '—' },
        { label: 'Montant', width: 84, align: 'right', value: (r) => formatFcfa(r.amount),
          footer: () => formatFcfa(totals.expenses_total) },
      ], expenses, expenses.length > 0);

      y = sectionTitle(doc, `Encaissements déclarés (${payments.length})`, y);
      y = table(doc, y, [
        { label: 'Date', width: 70, value: (r) => formatDateFr(r.payment_date) },
        { label: 'Client', width: 95, value: (r) => r.client_name },
        { label: 'Référence', width: 100, value: (r) => r.reference },
        { label: 'Mode', width: 90, value: (r) => r.payment_method },
        { label: 'Justificatif', width: 60, value: (r) => (r.has_proof ? 'Joint' : 'Référence') },
        { label: 'Montant', width: 84, align: 'right', value: (r) => formatFcfa(r.amount),
          footer: () => formatFcfa(totals.payments_total) },
      ], payments, payments.length > 0);

      if (y > 660) { doc.addPage(); y = 56; }
      doc.moveTo(48, y).lineTo(547, y).lineWidth(0.6).strokeColor(PDF_LIGHT).stroke();
      y += 12;
      doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(7.5).text(
        'Mentions importantes : les encaissements listés dans ce rapport sont des paiements DÉCLARÉS par l\'entreprise, '
        + 'documentés par leur référence (n° de reçu, référence de virement, etc.). Un paiement n\'est considéré comme '
        + 'prouvé que lorsqu\'un justificatif y est joint (colonne « Justificatif »). Le résultat provisoire correspond aux '
        + 'encaissements déclarés diminués des dépenses enregistrées à la date de génération du document. '
        + 'Ce document ne constitue pas une pièce comptable certifiée.',
        48, y, { width: 499, align: 'justify' },
      );

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(7.5)
          .text(`ChantierPilot — ${company.name} — page ${i + 1} / ${range.count}`, 48, 812, { width: 499, align: 'center' });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
