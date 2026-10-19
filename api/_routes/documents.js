import { z } from 'zod';
import { withTenant } from '../_lib/db.js';
import { handle,sendJson,readJsonBody,securityHeaders } from '../_lib/http.js';
import { requireAdmin,run } from '../_lib/pipeline.js';
import { uuid,money,zeroMoney,text,date,businessError,projectRequired,command } from '../_lib/operations.js';
import { checkQuota } from '../_lib/billing.js';
import { fileSchema } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { quoteTotals,roundedRatio } from '../../shared/trade.js';
import { documentPdf } from '../_lib/document-pdf.js';
const line=z.object({label:text(),unit:text(30),quantity:z.string().max(20),unit_price:zeroMoney,unit_cost:zeroMoney}).strict();
const schemas={
  quote:z.object({action:z.literal('quote'),project_id:uuid.nullable().default(null),title:text(),client_name:text(),client_address:z.string().trim().max(240).default(''),tax_bps:z.number().int().min(0).max(10000),lines:z.array(line).min(1).max(100),due_date:date}),
  price:z.object({action:z.literal('price'),label:text(),unit:text(30),unit_price:zeroMoney,unit_cost:zeroMoney}),
  issue:z.object({action:z.literal('issue'),id:uuid}),
  reject:z.object({action:z.literal('reject'),id:uuid}),
  accept:z.object({action:z.literal('accept'),id:uuid,name:text(120),reference:text(240),start_date:date}),
  invoice:z.object({action:z.literal('invoice'),quote_id:uuid,kind:z.enum(['deposit','progress','balance']),percent_bps:z.number().int().min(1).max(10000),due_date:date}),
  credit:z.object({action:z.literal('credit'),id:uuid,reason:text(240)}),
  receive_payment:z.object({action:z.literal('receive_payment'),id:uuid,amount:money,date,reference:text(120),method:z.enum(['especes','mobile_money','virement_bancaire','cheque','autre']),proof:fileSchema.nullable().default(null)}),
};
schemas.quote_update=schemas.quote.extend({action:z.literal('quote_update'),id:uuid});
async function row(client,id) {
  const d=(await client.query('SELECT * FROM commercial_documents WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!d)throw businessError('Document introuvable.',404);return d;
}
async function number(client,kind) {
  const n=Number((await client.query('SELECT count(*) AS n FROM commercial_documents')).rows[0].n)+1;
  return `${{quote:'DEV',invoice:'FAC',credit:'AV'}[kind]}-${new Date().getUTCFullYear()}-${String(n).padStart(5,'0')}`;
}
async function insertDocument(client,ctx,data) {
  const keys=['number','kind','invoice_kind','quote_id','source_id','project_id','title','client_name','client_address','lines','subtotal','tax','total','estimated_cost','tax_bps','status','due_date'];
  const values=keys.map(k=>k==='lines'?JSON.stringify(data[k]):data[k]??null);
  return (await client.query(`INSERT INTO commercial_documents(company_id,created_by,${keys.join(',')}) VALUES($1,$2,${keys.map((_,i)=>'$'+(i+3)).join(',')}) RETURNING *`,[ctx.companyId,ctx.userId,...values])).rows[0];
}
export default async function handler(req,res) {
  return handle(req,res,()=>run(res,async()=>{
    const ctx=await requireAdmin(req,res);if(!ctx)return;
    if(req.method==='GET') {
      const data=await withTenant(ctx,async client=>{
        if(req.query.pdf) {
          if(!uuid.safeParse(req.query.pdf).success)throw businessError('Document invalide.');
          const document=await row(client,req.query.pdf);
          const company=(await client.query('SELECT * FROM companies WHERE id=$1',[ctx.companyId])).rows[0];
          return {document,company};
        }
        const docs=(await client.query(`SELECT d.*,COALESCE(p.paid,0)::bigint AS paid,
          COALESCE(c.credited,0)::bigint AS credited FROM commercial_documents d
          LEFT JOIN (SELECT invoice_id,SUM(amount) AS paid FROM payments WHERE invoice_id IS NOT NULL GROUP BY invoice_id) p ON p.invoice_id=d.id
          LEFT JOIN (SELECT source_id,SUM(total) AS credited FROM commercial_documents WHERE kind='credit' GROUP BY source_id) c ON c.source_id=d.id
          ORDER BY d.created_at DESC,d.id LIMIT 500`)).rows;
        const prices=(await client.query('SELECT * FROM price_items ORDER BY label LIMIT 1000')).rows;
        const projects=(await client.query('SELECT id,name,client_name,status FROM projects ORDER BY created_at DESC LIMIT 1000')).rows;
        const summary=(await client.query(`SELECT
          (SELECT count(*) FROM commercial_documents WHERE kind='quote' AND status IN ('draft','issued'))::int AS open_quotes,
          COALESCE((SELECT SUM(CASE WHEN kind='credit' THEN -total ELSE total END) FROM commercial_documents WHERE kind IN ('invoice','credit')),0)::bigint AS net_billed,
          COALESCE(SUM(GREATEST(d.total-COALESCE(p.paid,0)-COALESCE(c.credited,0),0)),0)::bigint AS outstanding,
          count(*) FILTER(WHERE d.due_date<current_date AND d.total-COALESCE(p.paid,0)-COALESCE(c.credited,0)>0)::int AS overdue
          FROM commercial_documents d
          LEFT JOIN (SELECT invoice_id,SUM(amount) AS paid FROM payments WHERE invoice_id IS NOT NULL GROUP BY invoice_id) p ON p.invoice_id=d.id
          LEFT JOIN (SELECT source_id,SUM(total) AS credited FROM commercial_documents WHERE kind='credit' GROUP BY source_id) c ON c.source_id=d.id
          WHERE d.kind='invoice'`)).rows[0];
        return {documents:docs,prices,projects,summary};
      });
      if(req.query.pdf) {
        const buffer=await documentPdf(data.document,data.company);
        securityHeaders(res);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${data.document.number}.pdf"`);res.setHeader('Cache-Control','no-store');return res.end(buffer);
      }
      return sendJson(res,200,data);
    }
    const body=await readJsonBody(req),schema=Object.hasOwn(schemas,body.action)?schemas[body.action]:null;if(!schema)throw businessError('Action inconnue.');
    const result=await withTenant(ctx,client=>command(client,ctx,body,schema,async d=>{
      if(d.action==='price')return (await client.query('INSERT INTO price_items(company_id,label,unit,unit_price,unit_cost) VALUES($1,$2,$3,$4,$5) RETURNING *',[ctx.companyId,d.label,d.unit,d.unit_price,d.unit_cost])).rows[0];
      if(d.action==='quote'||d.action==='quote_update') {
        if(d.project_id)await projectRequired(client,d.project_id);
        const totals=quoteTotals(d.lines,d.tax_bps);
        if(d.action==='quote_update') {
          const existing=await row(client,d.id);
          if(existing.kind!=='quote'||existing.status!=='draft')throw businessError('Seuls les devis en brouillon sont modifiables.',409);
          return (await client.query(`UPDATE commercial_documents SET project_id=$2,title=$3,client_name=$4,client_address=$5,lines=$6,subtotal=$7,tax=$8,total=$9,estimated_cost=$10,tax_bps=$11,due_date=$12 WHERE id=$1 RETURNING *`,[d.id,d.project_id,d.title,d.client_name,d.client_address,JSON.stringify(totals.lines),totals.subtotal,totals.tax,totals.total,totals.estimated_cost,d.tax_bps,d.due_date])).rows[0];
        }
        return insertDocument(client,ctx,{...d,...totals,number:await number(client,'quote'),kind:'quote',status:'draft'});
      }
      if(d.action==='invoice') {
        const quote=await row(client,d.quote_id);
        if(quote.kind!=='quote'||quote.status!=='accepted'||!quote.project_id)throw businessError('Acceptez un devis avant de facturer.',409);
        await projectRequired(client,quote.project_id);
        const billed=(await client.query(`SELECT COALESCE(SUM(CASE WHEN kind='credit' THEN -subtotal ELSE subtotal END),0) AS subtotal,
          COALESCE(SUM(CASE WHEN kind='credit' THEN -tax ELSE tax END),0) AS tax FROM commercial_documents WHERE quote_id=$1 AND kind IN ('invoice','credit')`,[quote.id])).rows[0];
        let subtotal,tax;
        if(d.kind==='deposit') {subtotal=roundedRatio(quote.subtotal,d.percent_bps,10000);tax=roundedRatio(quote.tax,d.percent_bps,10000);}
        else {const percent=d.kind==='balance'?10000:d.percent_bps;subtotal=roundedRatio(quote.subtotal,percent,10000)-Number(billed.subtotal);tax=roundedRatio(quote.tax,percent,10000)-Number(billed.tax);}
        if(subtotal<0||tax<0||subtotal+tax<1||Number(billed.subtotal)+subtotal>Number(quote.subtotal)||Number(billed.tax)+tax>Number(quote.tax))throw businessError('Avancement déjà facturé ou montant dépassant le devis. Vérifiez les acomptes et situations précédents.',409);
        const title=`${{deposit:'Acompte',progress:'Situation de travaux',balance:'Solde'}[d.kind]} · ${quote.number}`;
        return insertDocument(client,ctx,{...quote,kind:'invoice',invoice_kind:d.kind,quote_id:quote.id,source_id:quote.id,number:await number(client,'invoice'),title,lines:[{label:title,quantity:'1',quantity_milli:1000,unit:'forfait',unit_price:subtotal,total:subtotal}],subtotal,tax,total:subtotal+tax,estimated_cost:0,status:'issued',due_date:d.due_date});
      }
      const document=await row(client,d.id);
      if(document.project_id)await projectRequired(client,document.project_id);
      if(d.action==='receive_payment') {
        if(document.kind!=='invoice')throw businessError('Choisissez une facture.');
        const sums=(await client.query(`SELECT COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=$1),0) AS paid,
          COALESCE((SELECT SUM(total) FROM commercial_documents WHERE source_id=$1 AND kind='credit'),0) AS credited`,[document.id])).rows[0];
        if(d.amount>Number(document.total)-Number(sums.paid)-Number(sums.credited))throw businessError('Le paiement dépasse le solde de la facture.',409);
        const proof=decodeFileAttachment(d.proof);
        return (await client.query(`INSERT INTO payments(company_id,project_id,client_name,amount,payment_date,reference,payment_method,memo,created_by,invoice_id,proof,proof_filename,proof_mime,proof_size)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[ctx.companyId,document.project_id,document.client_name,d.amount,d.date,d.reference,d.method,`Règlement ${document.number}`,ctx.userId,document.id,proof?.buffer||null,proof?.filename||null,proof?.mime||null,proof?.size||null])).rows[0];
      }
      if(d.action==='credit') {
        if(document.kind!=='invoice')throw businessError('Seule une facture peut faire l’objet d’un avoir.');
        if((await client.query("SELECT id FROM commercial_documents WHERE source_id=$1 AND kind='credit' UNION ALL SELECT id FROM payments WHERE invoice_id=$1",[document.id])).rows.length)throw businessError('Cette facture est déjà réglée ou créditée. Le remboursement et les avoirs partiels nécessitent un traitement séparé.',409);
        return insertDocument(client,ctx,{...document,number:await number(client,'credit'),kind:'credit',invoice_kind:null,source_id:document.id,title:`Avoir · ${document.number} · ${d.reason}`.slice(0,160),status:'issued'});
      }
      if(document.kind!=='quote')throw businessError('Action réservée aux devis.');
      if(d.action==='issue') {
        if(document.status!=='draft')throw businessError('Ce devis a déjà été émis.',409);
        return (await client.query("UPDATE commercial_documents SET status='issued' WHERE id=$1 RETURNING *",[document.id])).rows[0];
      }
      if(d.action==='reject') {
        if(!['draft','issued'].includes(document.status))throw businessError('Ce devis est déjà clôturé.',409);
        return (await client.query("UPDATE commercial_documents SET status='rejected' WHERE id=$1 RETURNING *",[document.id])).rows[0];
      }
      if(d.action==='accept') {
        if(document.status!=='issued')throw businessError('Émettez le devis avant d’enregistrer son acceptation.',409);
        let projectId=document.project_id;
        if(!projectId) {
          await checkQuota(client,ctx,'projects');
          projectId=(await client.query(`INSERT INTO projects(company_id,name,client_name,budget,start_date,status,created_by) VALUES($1,$2,$3,$4,$5,'planifie',$6) RETURNING id`,[ctx.companyId,document.title,document.client_name,document.total,d.start_date,ctx.userId])).rows[0].id;
        }
        if((await client.query("SELECT id FROM commercial_documents WHERE project_id=$1 AND kind='quote' AND status='accepted'",[projectId])).rows.length)throw businessError('Un devis est déjà accepté pour ce chantier. Les avenants seront traités séparément.',409);
        return (await client.query("UPDATE commercial_documents SET status='accepted',project_id=$2,accepted_name=$3,accepted_reference=$4,accepted_at=now() WHERE id=$1 RETURNING *",[document.id,projectId,d.name,d.reference])).rows[0];
      }
    }));
    return sendJson(res,201,{result});
  }));
}
