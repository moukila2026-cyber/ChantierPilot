import { siteReportPdf } from '../_lib/site-report.js';
import { z } from 'zod';
import { withTenant } from '../_lib/db.js';
import { handle, sendJson, readJsonBody, securityHeaders, fail } from '../_lib/http.js';
import { requireAuth, run } from '../_lib/pipeline.js';
import { uuid,money,zeroMoney,text,date,businessError,adminOnly,projectRequired,activeUser,command,insertExpense } from '../_lib/operations.js';
import { fileSchema, CATEGORIES } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { quantityMilli, roundedRatio } from '../../shared/trade.js';
const action = name => z.literal(name);
const schemas = {
  advance: z.object({ action:action('advance'),project_id:uuid,assignee_id:uuid,amount:money,purpose:text(500),reference:text(120),date }),
  advance_spend: z.object({ action:action('advance_spend'),advance_id:uuid,amount:money,category:z.enum(CATEGORIES),reference:text(120),description:text(500),date,receipt:fileSchema.nullable().default(null) }),
  advance_return: z.object({ action:action('advance_return'),advance_id:uuid,amount:money,reference:text(120) }),
  advance_close: z.object({ action:action('advance_close'),advance_id:uuid }),
  worker: z.object({ action:action('worker'),full_name:text(120),trade:z.string().trim().max(120).default(''),daily_rate:money.max(999999999) }),
  attendance: z.object({ action:action('attendance'),project_id:uuid,worker_id:uuid,date,minutes:z.number().int().min(30).max(960) }),
  attendance_review: z.object({ action:action('attendance_review'),id:uuid,approve:z.boolean() }),
  task: z.object({ action:action('task'),project_id:uuid,title:text(),description:z.string().trim().max(2000).default(''),kind:z.enum(['task','reserve']),assignee_id:uuid,due_date:date }),
  task_status: z.object({ action:action('task_status'),id:uuid,status:z.enum(['todo','doing','done','validated']) }),
  journal: z.object({ action:action('journal'),project_id:uuid,date,title:text(),notes:z.string().trim().max(2000).default(''),progress:z.number().int().min(0).max(100),photo:fileSchema.nullable().default(null) }),
  item: z.object({ action:action('item'),name:text(),unit:text(30),minimum:z.string().max(20).default('0') }),
  purchase: z.object({ action:action('purchase'),project_id:uuid,item_id:uuid,supplier:text(),quantity:z.string().max(20),unit_price:money,delivery_date:date }),
  purchase_review: z.object({ action:action('purchase_review'),id:uuid,approve:z.boolean() }),
  purchase_receive: z.object({ action:action('purchase_receive'),id:uuid,reference:text(120),date,receipt:fileSchema.nullable().default(null) }),
  stock: z.object({ action:action('stock'),project_id:uuid,item_id:uuid,kind:z.enum(['consume','return']),quantity:z.string().max(20),reference:text(120) }),
};
async function getRow(client,table,id) { // table : constante interne, jamais saisie utilisateur.
  const row=(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(!row) throw businessError('Élément introuvable.',404); return row;
}
async function itemRequired(client,id) {
  const row=(await client.query('SELECT * FROM inventory_items WHERE id=$1',[id])).rows[0];
  if(!row) throw businessError('Article introuvable.',404);return row;
}
export default async function handler(req,res) {
  return handle(req,res,()=>run(res,async()=>{
    const ctx=await requireAuth(req,res); if(!ctx)return;
    if(req.method==='GET') {
      if(req.query.report_project) {
        if(!uuid.safeParse(req.query.report_project).success)throw businessError('Chantier invalide.');
        const report=await withTenant(ctx,async client=>{
          const project=(await client.query('SELECT * FROM projects WHERE id=$1',[req.query.report_project])).rows[0];
          if(!project)throw businessError('Chantier introuvable.',404);
          const company=(await client.query('SELECT name FROM companies WHERE id=$1',[ctx.companyId])).rows[0];
          const journal=(await client.query('SELECT j.*,u.full_name AS author FROM site_journal j JOIN app_users u ON u.id=j.created_by WHERE j.project_id=$1 ORDER BY j.entry_date DESC,j.created_at DESC LIMIT 15',[project.id])).rows;
          const tasks=(await client.query('SELECT t.*,u.full_name AS assignee FROM site_tasks t LEFT JOIN app_users u ON u.id=t.assignee_id WHERE t.project_id=$1 ORDER BY due_date LIMIT 100',[project.id])).rows;
          return {company,project,journal,tasks};
        });
        const pdf=await siteReportPdf(report.company,report.project,report.journal,report.tasks);
        securityHeaders(res);res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition','attachment; filename="compte-rendu-terrain.pdf"');return res.end(pdf);
      }
      const data=await withTenant(ctx,async client=>{
        const projectId=req.query.project_id||null;
        if(projectId && !uuid.safeParse(projectId).success) throw businessError('Chantier invalide.');
        if(req.query.photo_id) {
          if(!uuid.safeParse(req.query.photo_id).success) throw businessError('Photo invalide.');
          const row=(await client.query('SELECT photo,photo_mime FROM site_journal WHERE id=$1',[req.query.photo_id])).rows[0];
          if(!row?.photo) return null;
          return {binary:row.photo,mime:row.photo_mime};
        }
        const query=(sql,params=[])=>client.query(sql,params).then(r=>r.rows);
        const projects=await query('SELECT id,name,status,client_name,budget FROM projects ORDER BY created_at DESC LIMIT 1000');
        const users=await query('SELECT id,full_name,role FROM app_users WHERE is_active ORDER BY full_name');
        const workers=await query(`SELECT id,full_name,trade,is_active${ctx.role==='admin'?',daily_rate':''} FROM workers ORDER BY full_name`);
        const tasks=await query('SELECT * FROM site_tasks WHERE ($1::uuid IS NULL OR project_id=$1) ORDER BY due_date LIMIT 500',[projectId]);
        const journal=await query(`SELECT j.id,j.project_id,j.entry_date,j.title,j.notes,j.progress,j.created_by,j.created_at,u.full_name AS author,(j.photo IS NOT NULL) AS has_photo
          FROM site_journal j JOIN app_users u ON u.id=j.created_by WHERE ($1::uuid IS NULL OR j.project_id=$1) ORDER BY j.entry_date DESC,j.created_at DESC LIMIT 200`,[projectId]);
        const advances=await query(`SELECT a.*,u.full_name AS assignee,COALESCE(e.spent,0)::bigint AS spent,COALESCE(e.returned,0)::bigint AS returned,
          (a.amount-COALESCE(e.spent,0)-COALESCE(e.returned,0))::bigint AS remaining
          FROM cash_advances a JOIN app_users u ON u.id=a.assignee_id
          LEFT JOIN (SELECT advance_id,SUM(amount) FILTER(WHERE kind='expense') AS spent,SUM(amount) FILTER(WHERE kind='return') AS returned FROM advance_entries GROUP BY advance_id) e ON e.advance_id=a.id
          WHERE ($1::uuid IS NULL OR a.project_id=$1) AND ($2::boolean OR a.assignee_id=$3) ORDER BY a.created_at DESC LIMIT 200`,[projectId,ctx.role==='admin',ctx.userId]);
        const advanceEntries=await query(`SELECT e.* FROM advance_entries e JOIN cash_advances a ON a.id=e.advance_id
          WHERE ($1::uuid IS NULL OR a.project_id=$1) AND ($2::boolean OR a.assignee_id=$3) ORDER BY e.created_at DESC LIMIT 500`,[projectId,ctx.role==='admin',ctx.userId]);
        const attendance=await query(`SELECT a.id,a.project_id,a.worker_id,a.work_date,a.minutes,a.status,a.created_by,a.expense_id,w.full_name${ctx.role==='admin'?',a.cost':''}
          FROM attendance a JOIN workers w ON w.id=a.worker_id WHERE ($1::uuid IS NULL OR a.project_id=$1) ORDER BY a.work_date DESC LIMIT 500`,[projectId]);
        const items=await query('SELECT * FROM inventory_items ORDER BY name');
        const purchases=await query('SELECT o.*,i.name AS item_name,i.unit FROM purchase_orders o JOIN inventory_items i ON i.id=o.item_id WHERE ($1::uuid IS NULL OR o.project_id=$1) ORDER BY o.created_at DESC LIMIT 300',[projectId]);
        const stock=await query(`SELECT m.project_id,m.item_id,i.name,i.unit,i.minimum_milli,
          SUM(CASE WHEN m.kind='consume' THEN -m.quantity_milli ELSE m.quantity_milli END)::bigint AS available_milli,
          SUM(CASE WHEN m.kind='consume' THEN m.quantity_milli WHEN m.kind='return' THEN -m.quantity_milli ELSE 0 END)::bigint AS consumed_milli
          FROM stock_movements m JOIN inventory_items i ON i.id=m.item_id WHERE ($1::uuid IS NULL OR m.project_id=$1) GROUP BY m.project_id,m.item_id,i.name,i.unit,i.minimum_milli`,[projectId]);
        const movements=await query('SELECT * FROM stock_movements WHERE ($1::uuid IS NULL OR project_id=$1) ORDER BY created_at DESC LIMIT 300',[projectId]);
        const purchaseSummary=(await client.query(`SELECT count(*) FILTER(WHERE status='requested')::int AS requested,
          COALESCE(SUM(amount) FILTER(WHERE status='approved'),0)::bigint AS committed FROM purchase_orders WHERE ($1::uuid IS NULL OR project_id=$1)`,[projectId])).rows[0];
        return {projects,users,workers,tasks,journal,advances,advanceEntries,attendance,items,purchases,stock,movements,purchaseSummary};
      });
      if(req.query.photo_id) {
        if(!data) return fail(res,404,'introuvable','Photo introuvable.');
        securityHeaders(res); res.setHeader('Content-Type',data.mime); res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Disposition','inline');return res.end(data.binary);
      }
      return sendJson(res,200,data);
    }
    const body=await readJsonBody(req);
    const schema=Object.hasOwn(schemas,body.action)?schemas[body.action]:null; if(!schema)throw businessError('Action inconnue.');
    const result=await withTenant(ctx,client=>command(client,ctx,body,schema,async d=>{
      if(d.project_id) await projectRequired(client,d.project_id);
      const insert=async(sql,params)=>(await client.query(sql,params)).rows[0];
      switch(d.action) {
        case 'advance': {
          adminOnly(ctx);await activeUser(client,d.assignee_id);
          return insert(`INSERT INTO cash_advances(company_id,project_id,assignee_id,amount,purpose,reference,advance_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[ctx.companyId,d.project_id,d.assignee_id,d.amount,d.purpose,d.reference,d.date,ctx.userId]);
        }
        case 'advance_spend':case 'advance_return':case 'advance_close': {
          const advance=await getRow(client,'cash_advances',d.advance_id);
          await projectRequired(client,advance.project_id);
          if(ctx.role!=='admin' && advance.assignee_id!==ctx.userId) throw businessError('Cette avance ne vous est pas affectée.',403);
          if(advance.status!=='open')throw businessError('Avance déjà clôturée.',409);
          const used=Number((await client.query('SELECT COALESCE(SUM(amount),0) AS n FROM advance_entries WHERE advance_id=$1',[advance.id])).rows[0].n);
          if(d.action==='advance_close') {
            adminOnly(ctx);if(used!==Number(advance.amount)) throw businessError('Justifiez les dépenses et enregistrez le reliquat restitué avant la clôture.',409);
            return insert("UPDATE cash_advances SET status='closed',closed_by=$2,closed_at=now() WHERE id=$1 RETURNING *",[advance.id,ctx.userId]);
          }
          if(d.amount>Number(advance.amount)-used)throw businessError('Le montant dépasse le reliquat de l’avance.',409);
          if(d.action==='advance_return')adminOnly(ctx); // seule la direction atteste la restitution effective
          let expenseId=null;
          if(d.action==='advance_spend')expenseId=await insertExpense(client,ctx,{project_id:advance.project_id,category:d.category,amount:d.amount,date:d.date,description:d.description,receipt:decodeFileAttachment(d.receipt)});
          return insert('INSERT INTO advance_entries(company_id,advance_id,kind,amount,expense_id,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[ctx.companyId,advance.id,expenseId?'expense':'return',d.amount,expenseId,d.reference,ctx.userId]);
        }
        case 'worker':adminOnly(ctx);return insert('INSERT INTO workers(company_id,full_name,trade,daily_rate) VALUES($1,$2,$3,$4) RETURNING *',[ctx.companyId,d.full_name,d.trade,d.daily_rate]);
        case 'attendance': {
          const worker=await getRow(client,'workers',d.worker_id);if(!worker.is_active)throw businessError('Ouvrier inactif.');
          const cost=roundedRatio(worker.daily_rate,d.minutes,480);
          const result=await insert(`INSERT INTO attendance(company_id,project_id,worker_id,work_date,minutes,cost,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(company_id,worker_id,work_date) DO UPDATE SET project_id=EXCLUDED.project_id,minutes=EXCLUDED.minutes,cost=EXCLUDED.cost,status='pending',created_by=EXCLUDED.created_by,reviewed_by=NULL
            WHERE attendance.status='rejected' RETURNING id,status`,[ctx.companyId,d.project_id,worker.id,d.date,d.minutes,cost,ctx.userId]);
          if(!result)throw businessError('Une présence est déjà en attente ou validée pour cet ouvrier à cette date.',409);
          return result;
        }
        case 'attendance_review': {
          adminOnly(ctx);const row=await getRow(client,'attendance',d.id);await projectRequired(client,row.project_id);
          if(row.status!=='pending')throw businessError('Présence déjà examinée.',409);
          const expense=d.approve?await insertExpense(client,ctx,{project_id:row.project_id,category:'main_oeuvre',amount:Number(row.cost),date:row.work_date,description:`Présence validée ${row.work_date} · ${row.minutes} min`}):null;
          return insert('UPDATE attendance SET status=$2,expense_id=$3,reviewed_by=$4 WHERE id=$1 RETURNING *',[row.id,d.approve?'approved':'rejected',expense,ctx.userId]);
        }
        case 'task': {
          await activeUser(client,d.assignee_id);
          if(ctx.role!=='admin' && d.assignee_id!==ctx.userId)throw businessError('Seul l’administrateur peut affecter une tâche à un autre agent.',403);
          return insert('INSERT INTO site_tasks(company_id,project_id,title,description,kind,assignee_id,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[ctx.companyId,d.project_id,d.title,d.description,d.kind,d.assignee_id,d.due_date,ctx.userId]);
        }
        case 'task_status': {
          const row=await getRow(client,'site_tasks',d.id);await projectRequired(client,row.project_id);
          if(ctx.role!=='admin' && (row.assignee_id!==ctx.userId || d.status==='validated' || row.status==='validated'))throw businessError('Action réservée au responsable ou à l’administrateur.',403);
          if(d.status==='validated' && row.status!=='done')throw businessError('La tâche doit être terminée avant validation.',409);
          return insert('UPDATE site_tasks SET status=$2 WHERE id=$1 RETURNING *',[row.id,d.status]);
        }
        case 'journal': {
          const photo=decodeFileAttachment(d.photo);if(photo && !photo.mime.startsWith('image/'))throw businessError('Le journal accepte uniquement des photos JPEG ou PNG.');
          return insert('INSERT INTO site_journal(company_id,project_id,entry_date,title,notes,progress,photo,photo_mime,photo_filename,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,project_id,title,progress',[ctx.companyId,d.project_id,d.date,d.title,d.notes,d.progress,photo?.buffer||null,photo?.mime||null,photo?.filename||null,ctx.userId]);
        }
        case 'item': {
          adminOnly(ctx);const minimum=d.minimum==='0'?0:quantityMilli(d.minimum);
          return insert('INSERT INTO inventory_items(company_id,name,unit,minimum_milli) VALUES($1,$2,$3,$4) RETURNING *',[ctx.companyId,d.name,d.unit,minimum]);
        }
        case 'purchase': {
          await itemRequired(client,d.item_id);const q=quantityMilli(d.quantity),amount=roundedRatio(d.unit_price,q,1000);if(amount<1)throw businessError('Montant trop faible.');
          return insert('INSERT INTO purchase_orders(company_id,project_id,item_id,supplier,quantity_milli,unit_price,amount,delivery_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[ctx.companyId,d.project_id,d.item_id,d.supplier,q,d.unit_price,amount,d.delivery_date,ctx.userId]);
        }
        case 'purchase_review':case 'purchase_receive': {
          adminOnly(ctx);const row=await getRow(client,'purchase_orders',d.id);await projectRequired(client,row.project_id);
          if(d.action==='purchase_review') {
            if(row.status!=='requested')throw businessError('Commande déjà examinée.',409);
            return insert('UPDATE purchase_orders SET status=$2 WHERE id=$1 RETURNING *',[row.id,d.approve?'approved':'rejected']);
          }
          if(row.status!=='approved')throw businessError('Seule une commande approuvée peut être réceptionnée.',409);
          const expense=await insertExpense(client,ctx,{project_id:row.project_id,category:'materiaux',amount:Number(row.amount),date:d.date,supplier:row.supplier,description:`Réception ${d.reference}`,receipt:decodeFileAttachment(d.receipt)});
          await client.query("INSERT INTO stock_movements(company_id,project_id,item_id,kind,quantity_milli,order_id,reference,created_by) VALUES($1,$2,$3,'receipt',$4,$5,$6,$7)",[ctx.companyId,row.project_id,row.item_id,row.quantity_milli,row.id,d.reference,ctx.userId]);
          return insert("UPDATE purchase_orders SET status='received',reference=$2,expense_id=$3 WHERE id=$1 RETURNING *",[row.id,d.reference,expense]);
        }
        case 'stock': {
          adminOnly(ctx);await itemRequired(client,d.item_id);const q=quantityMilli(d.quantity);
          const totals=(await client.query(`SELECT COALESCE(SUM(CASE WHEN kind='consume' THEN -quantity_milli ELSE quantity_milli END),0) AS available,
            COALESCE(SUM(CASE WHEN kind='consume' THEN quantity_milli WHEN kind='return' THEN -quantity_milli ELSE 0 END),0) AS consumed
            FROM stock_movements WHERE project_id=$1 AND item_id=$2`,[d.project_id,d.item_id])).rows[0];
          if(d.kind==='consume' && q>Number(totals.available))throw businessError('Stock insuffisant.',409);
          if(d.kind==='return' && q>Number(totals.consumed))throw businessError('Le retour dépasse la quantité consommée.',409);
          return insert('INSERT INTO stock_movements(company_id,project_id,item_id,kind,quantity_milli,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[ctx.companyId,d.project_id,d.item_id,d.kind,q,d.reference,ctx.userId]);
        }
      }
    }));
    return sendJson(res,201,{result});
  }));
}
