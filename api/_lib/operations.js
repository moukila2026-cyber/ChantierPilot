import crypto from 'node:crypto';
import { z } from 'zod';
import { parseOrThrow } from './validate.js';
import { audit } from './pipeline.js';
import { optionalSql, throwIfMissingSchemaWrite } from './compat.js';
import { kvGet, kvPut } from './kv.js';

export const uuid = z.string().uuid('Identifiant invalide.');
export const money = z.number().int().min(1).max(999999999999);
export const zeroMoney = z.number().int().min(0).max(999999999999);
export const text = (max=160) => z.string().trim().min(2).max(max);
// Les unités métier usuelles « m », « u » ou « j » font un seul caractère.
export const unit = z.string().trim().min(1).max(30);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T00:00:00Z`); return !isNaN(d) && d.toISOString().slice(0,10) === s && s>='2000-01-01' && s<='2100-12-31';
}, 'Date invalide.');
export function businessError(message,status=422) { return Object.assign(new Error(message),{ status,code:'operation_invalide' }); }
export function adminOnly(ctx) { if (ctx.role!=='admin') throw businessError('Action réservée à l’administrateur.',403); }
export async function projectRequired(client,id) {
  const p=(await client.query('SELECT * FROM projects WHERE id=$1',[id])).rows[0];
  if(!p) throw businessError('Chantier introuvable.',404);
  if(p.status==='archive') throw businessError('Chantier archivé : rouvrez-le avant de le modifier.',409);
  return p;
}
export async function activeUser(client,id) {
  if(!(await client.query('SELECT id FROM app_users WHERE id=$1 AND is_active',[id])).rows.length) throw businessError('Collaborateur actif introuvable.',404);
}
export async function command(client,ctx,body,schema,fn) {
  const { request_id, ...data } = parseOrThrow(schema.extend({ request_id: uuid }).strict(),body);
  try {
    // Sérialisation par entreprise : quotas, stocks, numéros et déduplication.
    await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[ctx.companyId]);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    let useKv = false;
    const previous = await optionalSql(
      client,
      'sp_op_req_lookup',
      async () => (await client.query('SELECT * FROM operation_requests WHERE request_id=$1',[request_id])).rows[0],
      async () => {
        useKv = true;
        return kvGet(client, ctx, 'op_req', request_id);
      },
    );
    if(previous) {
      if(previous.user_id!==ctx.userId || previous.fingerprint!==fingerprint) throw businessError('Identifiant de requête déjà utilisé avec un autre contenu.',409);
      return previous.response;
    }
    const response=await fn(data);
    if (useKv) {
      await kvPut(client, ctx, 'op_req', request_id, {
        user_id: ctx.userId,
        fingerprint,
        response,
      });
    } else {
      await client.query(
        'INSERT INTO operation_requests(company_id,request_id,user_id,fingerprint,response) VALUES($1,$2,$3,$4,$5)',
        [ctx.companyId,request_id,ctx.userId,fingerprint,JSON.stringify(response)],
      );
    }
    await audit(client,ctx,'creation','operation',response.id || null,`${data.action} : ${response.number || response.id || ''}`);
    return response;
  } catch (err) {
    throwIfMissingSchemaWrite(err);
    throw err;
  }
}
export async function insertExpense(client,ctx,{project_id,category,amount,date,supplier='',description,receipt=null}) {
  const result=await client.query(`INSERT INTO expenses(company_id,project_id,category,amount,expense_date,supplier,description,created_by,receipt,receipt_filename,receipt_mime,receipt_size)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[ctx.companyId,project_id,category,amount,date,supplier,description,ctx.userId,receipt?.buffer||null,receipt?.filename||null,receipt?.mime||null,receipt?.size||null]);
  return result.rows[0].id;
}
export async function protectLinkedExpense(client,id) {
  const linked = await optionalSql(
    client,
    'sp_protect_linked_expense',
    () => client.query(
      `SELECT id FROM advance_entries WHERE expense_id=$1
       UNION ALL SELECT id FROM attendance WHERE expense_id=$1
       UNION ALL SELECT id FROM purchase_orders WHERE expense_id=$1`,
      [id],
    ),
    { rows: [] },
  );
  if(linked.rows.length)throw businessError('Cette dépense provient d’une avance, d’une présence validée ou d’une réception. Elle est verrouillée pour préserver le rapprochement.',409);
}
