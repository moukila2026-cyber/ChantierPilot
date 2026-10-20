import PDFDocument from 'pdfkit';
import { drawBrandMark, PDF_CHARCOAL, PDF_GOLD, PDF_GOLD_DARK, PDF_GRAY } from './pdf.js';

export function siteReportPdf(company, project, journal, tasks) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    drawBrandMark(pdf, 45, 42);
    pdf.font('Helvetica-Bold').fontSize(17).fillColor(PDF_CHARCOAL).text(company.name, 81, 45);
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(PDF_GOLD_DARK).text('Compte rendu terrain', 81, 65);
    pdf.moveTo(45, 82).lineTo(550, 82).lineWidth(1.4).strokeColor(PDF_GOLD).stroke();
    pdf.y = 94;

    pdf.font('Helvetica-Bold').fontSize(13).fillColor(PDF_CHARCOAL).text(project.name, 45);
    pdf.font('Helvetica').fontSize(9).fillColor(PDF_GRAY)
      .text(`Client : ${project.client_name} · Édité le ${new Date().toISOString().slice(0, 10)}`)
      .text('Synthèse des 15 dernières notes et des 100 tâches/réserves les plus proches. Avancement déclaré, non certifié. Ce document ne constitue pas un PV de réception signé.');

    for (const entry of journal) {
      if (pdf.y > 480) pdf.addPage();
      pdf.moveDown().font('Helvetica-Bold').fontSize(12).fillColor(PDF_CHARCOAL).text(`${entry.entry_date} · ${entry.title}`);
      pdf.font('Helvetica').fontSize(9).fillColor(PDF_GRAY)
        .text(`Avancement déclaré : ${entry.progress} % · ${entry.author}`)
        .text(entry.notes || '');
      if (entry.photo) {
        if (pdf.y > 500) pdf.addPage();
        try {
          const y = pdf.y + 10;
          pdf.image(entry.photo, 45, y, { fit: [450, 190] });
          pdf.y = y + 200;
        } catch {
          pdf.fontSize(8).text(`Photo jointe : ${entry.photo_filename} (consultable dans le carnet).`);
        }
      }
    }

    pdf.addPage().font('Helvetica-Bold').fontSize(16).fillColor(PDF_CHARCOAL).text('Tâches & réserves');
    if (!tasks.length) pdf.moveDown().font('Helvetica').fontSize(10).fillColor(PDF_GRAY).text('Aucune tâche ou réserve enregistrée.');
    for (const task of tasks) {
      if (pdf.y > 670) pdf.addPage();
      pdf.moveDown().font('Helvetica-Bold').fontSize(10).fillColor(PDF_CHARCOAL)
        .text(`${task.kind === 'reserve' ? 'Réserve' : 'Tâche'} · ${task.title}`);
      pdf.font('Helvetica').fontSize(9).fillColor(PDF_GRAY)
        .text(`État : ${task.status} · Échéance : ${task.due_date} · Responsable : ${task.assignee || 'Non affecté'}`)
        .text(task.description || '');
    }
    pdf.end();
  });
}
