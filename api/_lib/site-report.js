import PDFDocument from 'pdfkit';
export function siteReportPdf(company,project,journal,tasks) {
  return new Promise((resolve,reject)=>{
    const pdf=new PDFDocument({size:'A4',margin:45}),chunks=[];
    pdf.on('data',c=>chunks.push(c));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);
    pdf.fontSize(18).fillColor('#102a43').text(company.name).text('Compte rendu terrain');
    pdf.moveDown().fontSize(12).text(project.name);
    pdf.fontSize(9).fillColor('#475569').text(`Client : ${project.client_name} · Édité le ${new Date().toISOString().slice(0,10)}`);
    pdf.text('Synthèse des 15 dernières notes et des 100 tâches/réserves les plus proches. Avancement déclaré, non certifié. Ce document ne constitue pas un PV de réception signé.');
    for(const entry of journal) {
      if(pdf.y>480)pdf.addPage();
      pdf.moveDown().fontSize(12).fillColor('#102a43').text(`${entry.entry_date} · ${entry.title}`);
      pdf.fontSize(9).fillColor('#475569').text(`Avancement déclaré : ${entry.progress} % · ${entry.author}`).text(entry.notes||'');
      if(entry.photo) {
        if(pdf.y>500)pdf.addPage();
        try {const y=pdf.y+10;pdf.image(entry.photo,45,y,{fit:[450,190]});pdf.y=y+200;}catch{pdf.fontSize(8).text(`Photo jointe : ${entry.photo_filename} (consultable dans le carnet).`);}
      }
    }
    pdf.addPage().fontSize(16).fillColor('#102a43').text('Tâches & réserves');
    if(!tasks.length)pdf.moveDown().fontSize(10).text('Aucune tâche ou réserve enregistrée.');
    for(const task of tasks) {
      if(pdf.y>670)pdf.addPage();
      pdf.moveDown().fontSize(10).text(`${task.kind==='reserve'?'Réserve':'Tâche'} · ${task.title}`);
      pdf.fontSize(9).fillColor('#475569').text(`État : ${task.status} · Échéance : ${task.due_date} · Responsable : ${task.assignee||'Non affecté'}`).text(task.description||'');
    }
    pdf.end();
  });
}
