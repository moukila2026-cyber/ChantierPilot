import PDFDocument from 'pdfkit';
const fcfa=n=>Number(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g,' ')+' FCFA';
export function documentPdf(document,company) {
  return new Promise((resolve,reject)=>{
    const pdf=new PDFDocument({size:'A4',margin:45}),chunks=[];
    pdf.on('data',c=>chunks.push(c));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);
    pdf.fontSize(19).fillColor('#102a43').text(company.name);
    pdf.fontSize(9).fillColor('#475569').text([company.address,company.city,company.phone,company.email,company.rccm&&`RCCM : ${company.rccm}`,company.tax_number&&`NCC : ${company.tax_number}`,company.tax_regime&&`Régime : ${company.tax_regime}`].filter(Boolean).join(' · '));
    pdf.moveDown().fontSize(18).fillColor('#102a43').text(`${{quote:'DEVIS',invoice:'FACTURE',credit:'AVOIR'}[document.kind]} ${document.number}`);
    pdf.fontSize(10).fillColor('#334155').text(document.title).text(`État : ${document.status} · Date : ${new Date(document.created_at).toISOString().slice(0,10)}`);
    pdf.moveDown().text(`Client : ${document.client_name}`).text(document.client_address||'');
    pdf.moveDown();
    for(const line of document.lines) {
      if(pdf.y>680)pdf.addPage();
      pdf.fontSize(10).fillColor('#102a43').text(line.label);
      pdf.fontSize(9).fillColor('#475569').text(`${line.quantity} ${line.unit} × ${fcfa(line.unit_price)} = ${fcfa(line.total)}`);pdf.moveDown(.6);
    }
    if(pdf.y>620)pdf.addPage();
    pdf.moveDown().fontSize(11).text(`Sous-total : ${fcfa(document.subtotal)}`,{align:'right'}).text(`Taxes (${document.tax_bps/100} %) : ${fcfa(document.tax)}`,{align:'right'});
    pdf.fontSize(15).fillColor('#102a43').text(`TOTAL : ${fcfa(document.total)}`,{align:'right'});
    pdf.moveDown().fontSize(9).fillColor('#475569');
    if(document.due_date)pdf.text(`Échéance / validité : ${String(document.due_date).slice(0,10)}`);
    if(document.accepted_name)pdf.text(`Acceptation enregistrée par l'entreprise : ${document.accepted_name} · Référence : ${document.accepted_reference}`);
    pdf.moveDown().fontSize(8).text('Document émis par l’entreprise avec ses mentions et son taux de taxe déclarés. Ne constitue pas une facture électronique certifiée par la DGI. L’accord enregistré manuellement n’est pas une signature électronique certifiée. Un document émis ne prouve pas un encaissement.');
    pdf.end();
  });
}
