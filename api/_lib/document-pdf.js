import PDFDocument from 'pdfkit';
import { drawBrandMark, PDF_CHARCOAL, PDF_GOLD, PDF_GOLD_DARK, PDF_GRAY } from './pdf.js';

const fcfa = (n) => `${Number(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;

export function documentPdf(document, company) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    drawBrandMark(pdf, 45, 42);
    pdf.font('Helvetica-Bold').fontSize(18).fillColor(PDF_CHARCOAL).text(company.name, 81, 45);
    pdf.font('Helvetica').fontSize(9).fillColor(PDF_GRAY).text(
      [
        company.address, company.city, company.phone, company.email,
        company.rccm && `RCCM : ${company.rccm}`,
        company.tax_number && `NCC : ${company.tax_number}`,
        company.tax_regime && `Régime : ${company.tax_regime}`,
      ].filter(Boolean).join(' · '),
      81, 67, { width: 468 },
    );

    const ruleY = Math.max(82, pdf.y + 8);
    pdf.moveTo(45, ruleY).lineTo(550, ruleY).lineWidth(1.4).strokeColor(PDF_GOLD).stroke();
    pdf.y = ruleY + 14;

    pdf.font('Helvetica-Bold').fontSize(18).fillColor(PDF_CHARCOAL)
      .text(`${{ quote: 'DEVIS', invoice: 'FACTURE', credit: 'AVOIR' }[document.kind]} ${document.number}`, 45);
    pdf.font('Helvetica').fontSize(10).fillColor(PDF_GOLD_DARK)
      .text(document.title)
      .fillColor(PDF_GRAY)
      .text(`État : ${document.status} · Date : ${new Date(document.created_at).toISOString().slice(0, 10)}`);
    pdf.moveDown().fillColor(PDF_CHARCOAL).text(`Client : ${document.client_name}`).fillColor(PDF_GRAY).text(document.client_address || '');
    pdf.moveDown();

    for (const line of document.lines) {
      if (pdf.y > 680) pdf.addPage();
      pdf.font('Helvetica-Bold').fontSize(10).fillColor(PDF_CHARCOAL).text(line.label);
      pdf.font('Helvetica').fontSize(9).fillColor(PDF_GRAY).text(`${line.quantity} ${line.unit} × ${fcfa(line.unit_price)} = ${fcfa(line.total)}`);
      pdf.moveDown(0.6);
    }

    if (pdf.y > 620) pdf.addPage();
    pdf.moveDown().font('Helvetica').fontSize(11).fillColor(PDF_CHARCOAL)
      .text(`Sous-total : ${fcfa(document.subtotal)}`, { align: 'right' })
      .text(`Taxes (${document.tax_bps / 100} %) : ${fcfa(document.tax)}`, { align: 'right' });
    pdf.font('Helvetica-Bold').fontSize(15).fillColor(PDF_CHARCOAL)
      .text(`TOTAL : ${fcfa(document.total)}`, { align: 'right' });

    pdf.moveDown().font('Helvetica').fontSize(9).fillColor(PDF_GRAY);
    if (document.due_date) pdf.text(`Échéance / validité : ${String(document.due_date).slice(0, 10)}`);
    if (document.accepted_name) pdf.text(`Acceptation enregistrée par l'entreprise : ${document.accepted_name} · Référence : ${document.accepted_reference}`);
    pdf.moveDown().fontSize(8).text('Document émis par l’entreprise avec ses mentions et son taux de taxe déclarés. Ne constitue pas une facture électronique certifiée par la DGI. L’accord enregistré manuellement n’est pas une signature électronique certifiée. Un document émis ne prouve pas un encaissement.');
    pdf.end();
  });
}
