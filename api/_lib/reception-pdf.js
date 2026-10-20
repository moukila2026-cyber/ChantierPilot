// Procès-Verbal contradictoire interne de réception de travaux & levée de réserves (PDF A4).
// Rendu serveur via pdfkit, charte Noir Charbon & Or ChantierPilot.

import PDFDocument from 'pdfkit';
import {
  drawBrandMark, formatFcfa, formatDateFr,
  PDF_CHARCOAL, PDF_GOLD, PDF_GOLD_DARK, PDF_GRAY, PDF_LIGHT, PDF_HEAD_BG,
} from './pdf.js';

export function buildReceptionPdf({ company, project, snags = [], subcontracts = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `PV de réception — ${project.name}`,
        Author: company.name || 'ChantierPilot',
        Creator: 'ChantierPilot',
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const todayIso = new Date().toISOString().slice(0, 10);
    const effectiveBudget = Number(project.contract_total ?? project.budget ?? 0);
    const paid = Number(project.payments_total || 0);
    const retentionBps = Number(project.retention_bps || 0);
    const retentionAmount = Math.round((effectiveBudget * retentionBps) / 10000);
    const remainingDue = Math.max(0, effectiveBudget - paid);

    const openSnags = snags.filter((s) => s.status !== 'validated');
    const clearedSnags = snags.filter((s) => s.status === 'validated');
    const decision = openSnags.length === 0
      ? 'RÉCEPTION PRONONCÉE SANS RÉSERVE'
      : `RÉCEPTION PRONONCÉE AVEC ${openSnags.length} RÉSERVE(S) À LEVER`;

    drawBrandMark(doc, 48, 42);
    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(17).text(company.name || 'Entreprise', 84, 44);
    doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8.5);
    const lines = [
      [company.rccm ? `RCCM : ${company.rccm}` : null, company.tax_number ? `NCC : ${company.tax_number}` : null].filter(Boolean).join(' · ') || null,
      [company.phone ? `Tél. : ${company.phone}` : null, company.email ? `E-mail : ${company.email}` : null].filter(Boolean).join(' · ') || null,
      [company.address, company.city].filter(Boolean).join(' — ') || null,
    ].filter(Boolean);
    let y = 66;
    for (const l of lines) {
      doc.text(l, 84, y, { width: 463 });
      y += 11;
    }
    doc.moveTo(48, y + 6).lineTo(547, y + 6).lineWidth(1.5).strokeColor(PDF_GOLD).stroke();
    y += 18;

    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(13.5)
      .text('PROCÈS-VERBAL CONTRADICTOIRE DE RÉCEPTION DES TRAVAUX', 48, y);
    y += 17;
    doc.fillColor(PDF_GOLD_DARK).font('Helvetica-Bold').fontSize(9.5).text(decision, 48, y);
    doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8.5)
      .text(`Établi le ${formatDateFr(todayIso)}`, 360, y, { width: 187, align: 'right' });
    y += 22;

    doc.roundedRect(48, y, 499, 78, 5).fillAndStroke(PDF_HEAD_BG, PDF_LIGHT);
    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(9.5).text('1. Identification de l’opération', 58, y + 8);
    const kvLeft = [
      ['Chantier :', project.name],
      ['Localisation :', project.location || 'Non précisée'],
      ['Période des travaux :', `Du ${formatDateFr(project.start_date)} au ${formatDateFr(project.end_date || todayIso)}`],
    ];
    const kvRight = [
      ['Maître d’ouvrage :', project.client_name],
      ['Contact client :', project.client_phone || '—'],
      ['Entreprise exécutante :', company.name || '—'],
    ];
    let ky = y + 24;
    for (let i = 0; i < kvLeft.length; i += 1) {
      doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8.5).text(kvLeft[i][0], 58, ky, { width: 92 });
      doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5).text(String(kvLeft[i][1]), 150, ky, { width: 145 });
      doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8.5).text(kvRight[i][0], 305, ky, { width: 95 });
      doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5).text(String(kvRight[i][1]), 400, ky, { width: 138 });
      ky += 16;
    }
    y += 92;

    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(10.5).text('2. Situation financière récapitulative (XOF / FCFA)', 48, y);
    y += 15;
    const finRows = [
      ['Montant de référence du marché / devis accepté', formatFcfa(effectiveBudget)],
      ['Cumul des règlements client déclarés à ce jour', formatFcfa(paid)],
      ['Solde global restant sur le marché', formatFcfa(remainingDue)],
      [
        retentionBps > 0
          ? `Dont retenue de garantie (${(retentionBps / 100).toFixed(retentionBps % 100 === 0 ? 0 : 2)} %)`
          : 'Retenue de garantie contractuelle',
        retentionBps > 0
          ? `${formatFcfa(retentionAmount)} — ${project.retention_released ? 'Mainlevée accordée' : `Libérable le ${formatDateFr(project.retention_release_date)}`}`
          : 'Aucune retenue stipulée (0 FCFA)',
      ],
    ];
    for (const [label, val] of finRows) {
      doc.rect(48, y, 499, 19).strokeColor(PDF_LIGHT).lineWidth(0.6).stroke();
      doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8.5).text(label, 56, y + 5, { width: 280 });
      doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5).text(val, 340, y + 5, { width: 199, align: 'right' });
      y += 19;
    }
    y += 16;

    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(10.5)
      .text(`3. État des réserves et finitions (${clearedSnags.length} validée(s) · ${openSnags.length} à lever)`, 48, y);
    y += 15;

    if (snags.length === 0) {
      doc.roundedRect(48, y, 499, 28, 4).fillAndStroke(PDF_HEAD_BG, PDF_LIGHT);
      doc.fillColor(PDF_CHARCOAL).font('Helvetica').fontSize(8.5)
        .text('Aucune réserve enregistrée sur ce chantier à la date d’édition du présent procès-verbal.', 58, y + 9, { width: 480 });
      y += 40;
    } else {
      doc.rect(48, y, 499, 18).fill(PDF_CHARCOAL);
      doc.fillColor('#eab956').font('Helvetica-Bold').fontSize(8);
      doc.text('Désignation de la réserve / finition', 54, y + 5, { width: 250 });
      doc.text('Échéance', 310, y + 5, { width: 95 });
      doc.text('Statut constaté', 410, y + 5, { width: 130, align: 'right' });
      y += 18;
      for (const s of snags) {
        if (y > 710) { doc.addPage(); y = 52; }
        const statusLabel = s.status === 'validated'
          ? 'Levée et validée'
          : s.status === 'done' ? 'Reprise effectuée (à valider)' : 'À lever';
        doc.rect(48, y, 499, 19).strokeColor(PDF_LIGHT).lineWidth(0.5).stroke();
        doc.fillColor(PDF_CHARCOAL).font('Helvetica').fontSize(8.5).text(String(s.title || ''), 54, y + 5, { width: 250 });
        doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8).text(s.due_date ? formatDateFr(s.due_date) : '—', 310, y + 5, { width: 95 });
        doc.fillColor(s.status === 'validated' ? '#166534' : PDF_GOLD_DARK).font('Helvetica-Bold').fontSize(8)
          .text(statusLabel, 410, y + 5, { width: 130, align: 'right' });
        y += 19;
      }
      y += 14;
    }

    if (subcontracts.length > 0) {
      if (y > 660) { doc.addPage(); y = 52; }
      doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(10.5)
        .text('4. Lots techniques exécutés & avancement constaté', 48, y);
      y += 15;
      for (const sub of subcontracts) {
        if (y > 720) { doc.addPage(); y = 52; }
        doc.rect(48, y, 499, 18).strokeColor(PDF_LIGHT).lineWidth(0.5).stroke();
        doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5)
          .text(`${sub.trade_lot} — ${sub.subcontractor_name}`, 54, y + 5, { width: 340 });
        doc.fillColor(PDF_GRAY).font('Helvetica-Bold').fontSize(8.5)
          .text(`Avancement : ${sub.progress || 0} %`, 400, y + 5, { width: 140, align: 'right' });
        y += 18;
      }
      y += 14;
    }

    if (y > 640) { doc.addPage(); y = 52; }
    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(10).text('Signatures contradictoires des parties', 48, y);
    y += 14;
    doc.roundedRect(48, y, 240, 86, 5).strokeColor(PDF_LIGHT).lineWidth(0.9).stroke();
    doc.roundedRect(307, y, 240, 86, 5).strokeColor(PDF_LIGHT).lineWidth(0.9).stroke();
    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5)
      .text(`Pour l’Entreprise (${company.name || ''})`, 58, y + 8, { width: 220 });
    doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8)
      .text('Nom, qualité, cachet et signature précédés de « Lu et approuvé » :', 58, y + 22, { width: 220 });

    doc.fillColor(PDF_CHARCOAL).font('Helvetica-Bold').fontSize(8.5)
      .text(`Pour le Maître d’Ouvrage (${project.client_name})`, 317, y + 8, { width: 220 });
    doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(8)
      .text('Nom et signature précédés de « Bon pour réception » :', 317, y + 22, { width: 220 });
    y += 100;

    doc.fillColor(PDF_GRAY).font('Helvetica').fontSize(7.5).text(
      'Mention importante : ce document constitue un support opérationnel interne généré à partir des données saisies dans ChantierPilot. '
      + 'Il prend valeur contradictoire par l’apposition des signatures manuscrites des parties et ne constitue pas un acte authentique ou certifié par un tiers.',
      48, y, { width: 499, align: 'justify' },
    );

    doc.end();
  });
}
