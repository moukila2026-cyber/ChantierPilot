// Génération du rapport PDF par chantier (pdfkit, rendu serveur).
// En-tête : identité de L'ENTREPRISE concernée (récupérée en base).
// Le rapport est explicite sur la nature « déclarée » des encaissements.

import PDFDocument from 'pdfkit';

export function formatFcfa(n) {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} FCFA`;
}

export function formatDateFr(iso) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const INK = '#1a2332';
const GRAY = '#5b6779';
const LIGHT = '#e8ecf1';
const ACCENT = '#b45309';

function header(doc, company, title, subtitle) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(company.name || 'Entreprise', 48, 48);
  doc.fillColor(GRAY).font('Helvetica').fontSize(8.5);
  const contact = [
    company.rccm ? `RCCM : ${company.rccm}` : null,
    company.phone ? `Téléphone : ${company.phone}` : null,
    company.email ? `E-mail : ${company.email}` : null,
    [company.address, company.city].filter(Boolean).join(' — ') || null,
  ].filter(Boolean);
  let y = 70;
  for (const line of contact) {
    doc.text(line, 48, y);
    y += 11;
  }
  doc.moveTo(48, y + 6).lineTo(547, y + 6).lineWidth(1.2).strokeColor(ACCENT).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(title, 48, y + 18);
  doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(subtitle, 48, y + 36);
  return y + 58;
}

function sectionTitle(doc, text, y) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(text, 48, y);
  return y + 16;
}

function keyValueTable(doc, y, rows, labelWidth = 160) {
  for (const [k, v] of rows) {
    if (y > 760) { doc.addPage(); y = 56; }
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(k, 48, y, { width: labelWidth });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(String(v), 48 + labelWidth + 8, y, { width: 440 - labelWidth });
    y += 15;
  }
  return y + 6;
}

function table(doc, y, columns, rows, footerRow) {
  const pageBottom = 790;
  const drawHead = () => {
    doc.rect(48, y, 499, 18).fill('#f2f4f7');
    let x = 48 + 6;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(8);
    for (const col of columns) {
      doc.text(col.label, x, y + 5, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    y += 18;
    doc.fillColor(INK);
  };
  drawHead();
  doc.font('Helvetica').fontSize(8.5);
  for (const row of rows) {
    // Hauteur de ligne : le plus long texte plié.
    let h = 16;
    let x = 48;
    for (const col of columns) {
      const val = String(col.value(row) ?? '');
      const th = doc.heightOfString(val, { width: col.width - 8 });
      if (th + 8 > h) h = th + 8;
      x += col.width;
    }
    if (y + h > pageBottom) {
      doc.addPage();
      y = 56;
      drawHead();
      doc.font('Helvetica').fontSize(8.5);
    }
    x = 48 + 6;
    for (const col of columns) {
      const val = String(col.value(row) ?? '');
      doc.fillColor(INK).text(val, x, y + 4, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    doc.moveTo(48, y + h).lineTo(547, y + h).lineWidth(0.4).strokeColor(LIGHT).stroke();
    y += h;
  }
  if (footerRow) {
    if (y + 20 > pageBottom) { doc.addPage(); y = 56; }
    doc.rect(48, y, 499, 18).fill('#f8fafc');
    let x = 48 + 6;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5);
    for (const col of columns) {
      doc.text(String(col.footer?.() ?? ''), x, y + 5, { width: col.width - 8, align: col.align || 'left' });
      x += col.width;
    }
    y += 22;
    doc.fillColor(INK);
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
        ['Budget prévisionnel', formatFcfa(project.budget)],
      ]);

      y = sectionTitle(doc, 'Synthèse financière', y);
      y = keyValueTable(doc, y, [
        ['Budget prévisionnel', formatFcfa(totals.budget)],
        ['Total des dépenses', formatFcfa(totals.expenses_total)],
        ['Total des encaissements déclarés', formatFcfa(totals.payments_total)],
        ['Solde client (reste à encaisser)', formatFcfa(totals.reste_a_encaisser)],
        ['Résultat provisoire (encaissements − dépenses)', formatFcfa(totals.resultat_provisionnel)],
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
      doc.moveTo(48, y).lineTo(547, y).lineWidth(0.6).strokeColor(LIGHT).stroke();
      y += 12;
      doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(
        'Mentions importantes : les encaissements listés dans ce rapport sont des paiements DÉCLARÉS par l\'entreprise, '
        + 'documentés par leur référence (n° de reçu, référence de virement, etc.). Un paiement n\'est considéré comme '
        + 'prouvé que lorsqu\'un justificatif y est joint (colonne « Justificatif »). Le résultat provisoire correspond aux '
        + 'encaissements déclarés diminués des dépenses enregistrées à la date de génération du document. '
        + 'Ce document ne constitue pas une pièce comptable certifiée.',
        48, y, { width: 499, align: 'justify' },
      );

      // Numérotation des pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
          .text(`ChantierPilot — ${company.name} — page ${i + 1} / ${range.count}`, 48, 812, { width: 499, align: 'center' });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
