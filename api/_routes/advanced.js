// Extensions : toutes les écritures passent par la même transaction sérialisée et dédupliquée.
import crypto from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../_lib/db.js';
import { handle, sendJson, readJsonBody, securityHeaders } from '../_lib/http.js';
import { requireAuth, run } from '../_lib/pipeline.js';
import { uuid, text, date, command, adminOnly, projectRequired, activeUser, businessError } from '../_lib/operations.js';
import { optionalSql } from '../_lib/compat.js';
import { kvGet, kvList, kvPut } from '../_lib/kv.js';
import { fileSchema } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { quantityMilli } from '../../shared/trade.js';

const literal = (action) => z.literal(action);
const taskFields = { project_id: uuid, title: text(), start_date: date, end_date: date, progress: z.number().int().min(0).max(100), predecessor_id: uuid.nullable(), assignee_id: uuid };
const schemas = {
  plan: z.object({ action: literal('plan'), project_id: uuid, title: text(), revision: z.string().trim().min(1).max(60), file: fileSchema }),
  annotation: z.object({ action: literal('annotation'), plan_id: uuid, page: z.number().int().min(1).max(1000), x: z.number().min(0).max(1), y: z.number().min(0).max(1), note: text(2000) }),
  annotation_resolve: z.object({ action: literal('annotation_resolve'), id: uuid }),
  schedule: z.object({ action: literal('schedule'), ...taskFields }),
  schedule_update: z.object({ action: literal('schedule_update'), id: uuid, ...taskFields }),
  warehouse: z.object({ action: literal('warehouse'), name: text(), address: z.string().trim().max(240).default('') }),
  warehouse_move: z.object({ action: literal('warehouse_move'), item_id: uuid, from_id: uuid.nullable(), to_id: uuid.nullable(), project_id: uuid.nullable(), quantity: z.string().max(20), reference: text(240) }),
};

async function rowSql(c, table, id) {
  const r = (await c.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
  if (!r) throw businessError('Élément introuvable.', 404);
  return r;
}

function binary(res, buffer, mime, filename) {
  securityHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  return res.end(buffer);
}

export default async function handler(req, res) {
  return handle(req, res, () => run(res, async () => {
    const ctx = await requireAuth(req, res); if (!ctx) return;

    if (req.method === 'GET') {
      if (req.query.plan_file) {
        if (!uuid.safeParse(req.query.plan_file).success) throw businessError('Plan invalide.');
        const p = await withTenant(ctx, async (c) => {
          const found = await optionalSql(
            c,
            'sp_adv_plan_file',
            () => rowSql(c, 'plan_versions', req.query.plan_file),
            async () => {
              const kv = await kvGet(c, ctx, 'plans', req.query.plan_file);
              return kv?.file_b64 ? { ...kv, file: Buffer.from(kv.file_b64, 'base64') } : null;
            },
          );
          if (!found) throw businessError('Élément introuvable.', 404);
          return found;
        });
        return binary(res, p.file, p.mime, p.mime === 'application/pdf' ? 'plan.pdf' : `plan.${p.mime === 'image/png' ? 'png' : 'jpg'}`);
      }
      if (Object.hasOwn(req.query, 'payroll_pdf')) throw businessError('Ce module a été retiré.', 410);

      const data = await withTenant(ctx, async (c) => {
        const q = async (sql, params = []) => (await c.query(sql, params)).rows;
        const projects = await q('SELECT id,name,status FROM projects ORDER BY name');
        const users = await q('SELECT id,full_name FROM app_users WHERE is_active ORDER BY full_name');
        const ext = await optionalSql(c, 'sp_advanced_list', async () => {
          const plans = await q('SELECT id,project_id,title,revision,mime,sha256,created_at FROM plan_versions ORDER BY created_at DESC');
          const annotations = await q('SELECT * FROM plan_annotations ORDER BY created_at');
          const tasks = await q('SELECT * FROM schedule_tasks ORDER BY start_date,title');
          const warehouses = await q('SELECT * FROM warehouses ORDER BY name');
          const items = await q('SELECT id,name,unit FROM inventory_items ORDER BY name');
          const stock = await q(`SELECT w.id AS warehouse_id,i.id AS item_id,w.name AS warehouse_name,i.name AS item_name,i.unit,
           SUM(CASE WHEN m.to_id=w.id THEN m.quantity_milli ELSE -m.quantity_milli END)::bigint AS available_milli
           FROM warehouse_movements m JOIN warehouses w ON w.id=m.from_id OR w.id=m.to_id JOIN inventory_items i ON i.id=m.item_id GROUP BY w.id,i.id`);
          const moves = await q('SELECT * FROM warehouse_movements ORDER BY created_at DESC LIMIT 500');
          return { plans, annotations, tasks, warehouses, items, stock, moves };
        }, async () => {
          const [plans, annotations, tasks, warehouses, items, moves] = await Promise.all([
            kvList(c, ctx, 'plans'),
            kvList(c, ctx, 'annotations'),
            kvList(c, ctx, 'schedule'),
            kvList(c, ctx, 'warehouses'),
            kvList(c, ctx, 'items'),
            kvList(c, ctx, 'warehouse_moves'),
          ]);
          const whMap = new Map(warehouses.map((w) => [w.id, w]));
          const itemMap = new Map(items.map((i) => [i.id, i]));
          const stockMap = new Map();
          for (const m of moves) {
            const it = itemMap.get(m.item_id);
            if (!it) continue;
            for (const [wid, sign] of [[m.to_id, 1], [m.from_id, -1]]) {
              if (!wid || !whMap.has(wid)) continue;
              const k = `${wid}:${m.item_id}`;
              const cur = stockMap.get(k) || { warehouse_id: wid, item_id: m.item_id, warehouse_name: whMap.get(wid).name, item_name: it.name, unit: it.unit, available_milli: 0 };
              cur.available_milli += sign * Number(m.quantity_milli);
              stockMap.set(k, cur);
            }
          }
          return {
            plans: plans.map(({ file_b64, ...rest }) => rest),
            annotations,
            tasks: tasks.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))),
            warehouses,
            items: items.map(({ id, name, unit }) => ({ id, name, unit })),
            stock: [...stockMap.values()],
            moves,
          };
        });
        return { projects, users, ...ext };
      });
      return sendJson(res, 200, data);
    }

    const body = await readJsonBody(req);
    const schema = Object.hasOwn(schemas, body.action) ? schemas[body.action] : null;
    if (!schema) throw businessError('Action inconnue.');

    const result = await withTenant(ctx, (c) => command(c, ctx, body, schema, async (d) => {
      if (d.action !== 'annotation') adminOnly(ctx);
      if (d.project_id) await projectRequired(c, d.project_id);
      const hasSql = await optionalSql(
        c,
        'sp_adv_probe',
        async () => { await c.query('SELECT 1 FROM plan_versions LIMIT 1'); return true; },
        false,
      );
      const insert = async (sql, values) => (await c.query(sql, values)).rows[0];
      const getRec = async (table, kvName, id) => {
        if (hasSql) return rowSql(c, table, id);
        const found = await kvGet(c, ctx, kvName, id);
        if (!found) throw businessError('Élément introuvable.', 404);
        return found;
      };

      switch (d.action) {
        case 'plan': {
          const f = decodeFileAttachment(d.file);
          const sha = crypto.createHash('sha256').update(f.buffer).digest('hex');
          if (hasSql) return insert('INSERT INTO plan_versions(company_id,project_id,title,revision,file,mime,filename,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [ctx.companyId, d.project_id, d.title, d.revision, f.buffer, f.mime, f.filename, sha, ctx.userId]);
          const dup = (await kvList(c, ctx, 'plans')).some((p) => p.project_id === d.project_id && p.title === d.title && p.revision === d.revision);
          if (dup) throw businessError('Cette révision de plan existe déjà.', 409);
          const id = crypto.randomUUID();
          await kvPut(c, ctx, 'plans', id, { id, project_id: d.project_id, title: d.title, revision: d.revision, file_b64: f.buffer.toString('base64'), mime: f.mime, filename: f.filename, sha256: sha, created_by: ctx.userId, created_at: new Date().toISOString() });
          return { id };
        }
        case 'annotation': {
          const p = await getRec('plan_versions', 'plans', d.plan_id);
          await projectRequired(c, p.project_id);
          if (p.mime !== 'application/pdf' && d.page !== 1) throw businessError('Une image ne comporte qu’une page.');
          if (hasSql) return insert('INSERT INTO plan_annotations(company_id,plan_id,page,x,y,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [ctx.companyId, d.plan_id, d.page, d.x, d.y, d.note, ctx.userId]);
          const id = crypto.randomUUID();
          await kvPut(c, ctx, 'annotations', id, { id, plan_id: d.plan_id, page: d.page, x: d.x, y: d.y, note: d.note, status: 'open', created_by: ctx.userId, created_at: new Date().toISOString() });
          return { id };
        }
        case 'annotation_resolve': {
          const a = await getRec('plan_annotations', 'annotations', d.id);
          const p = await getRec('plan_versions', 'plans', a.plan_id);
          await projectRequired(c, p.project_id);
          if (hasSql) return insert("UPDATE plan_annotations SET status='resolved' WHERE id=$1 RETURNING id", [d.id]);
          await kvPut(c, ctx, 'annotations', d.id, { ...a, status: 'resolved' });
          return { id: d.id };
        }
        case 'schedule': case 'schedule_update': {
          if (d.end_date < d.start_date) throw businessError('La fin doit suivre le début.');
          await activeUser(c, d.assignee_id);
          if (d.action === 'schedule_update') {
            const old = await getRec('schedule_tasks', 'schedule', d.id);
            if (old.project_id !== d.project_id) throw businessError('Le chantier de la tâche ne peut pas changer.');
          }
          if (d.predecessor_id) {
            const p = await getRec('schedule_tasks', 'schedule', d.predecessor_id);
            if (p.project_id !== d.project_id || new Date(p.end_date).toISOString().slice(0, 10) >= d.start_date) {
              throw businessError('Le prédécesseur doit appartenir au chantier et se terminer avant le début.');
            }
            const seen = new Set(d.id ? [d.id] : []);
            let current = p;
            while (current) {
              if (seen.has(current.id)) throw businessError('Dépendance circulaire refusée.');
              seen.add(current.id);
              current = current.predecessor_id ? await getRec('schedule_tasks', 'schedule', current.predecessor_id) : null;
            }
          }
          if (d.action === 'schedule_update') {
            const clash = hasSql
              ? (await c.query('SELECT id FROM schedule_tasks WHERE predecessor_id=$1 AND start_date<=$2', [d.id, d.end_date])).rows.length
              : (await kvList(c, ctx, 'schedule')).some((t) => t.predecessor_id === d.id && String(t.start_date) <= d.end_date);
            if (clash) throw businessError('Déplacez les tâches suivantes avant de retarder leur prédécesseur.');
            if (hasSql) return insert('UPDATE schedule_tasks SET title=$2,start_date=$3,end_date=$4,progress=$5,predecessor_id=$6,assignee_id=$7 WHERE id=$1 RETURNING id', [d.id, d.title, d.start_date, d.end_date, d.progress, d.predecessor_id, d.assignee_id]);
            await kvPut(c, ctx, 'schedule', d.id, { id: d.id, project_id: d.project_id, title: d.title, start_date: d.start_date, end_date: d.end_date, progress: d.progress, predecessor_id: d.predecessor_id, assignee_id: d.assignee_id });
            return { id: d.id };
          }
          if (hasSql) return insert('INSERT INTO schedule_tasks(company_id,project_id,title,start_date,end_date,progress,predecessor_id,assignee_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [ctx.companyId, d.project_id, d.title, d.start_date, d.end_date, d.progress, d.predecessor_id, d.assignee_id]);
          const id = crypto.randomUUID();
          await kvPut(c, ctx, 'schedule', id, { id, project_id: d.project_id, title: d.title, start_date: d.start_date, end_date: d.end_date, progress: d.progress, predecessor_id: d.predecessor_id, assignee_id: d.assignee_id });
          return { id };
        }
        case 'warehouse': {
          if (hasSql) return insert('INSERT INTO warehouses(company_id,name,address) VALUES($1,$2,$3) RETURNING id', [ctx.companyId, d.name, d.address]);
          const id = crypto.randomUUID();
          await kvPut(c, ctx, 'warehouses', id, { id, name: d.name, address: d.address });
          return { id };
        }
        case 'warehouse_move': {
          if ((!d.from_id && !d.to_id) || d.from_id === d.to_id || (d.project_id && (!d.from_id || d.to_id))) {
            throw businessError('Choisissez une entrée, un transfert entre dépôts ou une sortie vers chantier.');
          }
          await getRec('inventory_items', 'items', d.item_id);
          if (d.from_id) await getRec('warehouses', 'warehouses', d.from_id);
          if (d.to_id) await getRec('warehouses', 'warehouses', d.to_id);
          const qty = quantityMilli(d.quantity);
          if (d.from_id) {
            const bal = hasSql
              ? BigInt((await c.query('SELECT COALESCE(SUM(CASE WHEN to_id=$1 THEN quantity_milli ELSE -quantity_milli END),0) AS qty FROM warehouse_movements WHERE item_id=$2 AND (to_id=$1 OR from_id=$1)', [d.from_id, d.item_id])).rows[0].qty)
              : BigInt((await kvList(c, ctx, 'warehouse_moves')).filter((m) => m.item_id === d.item_id && (m.to_id === d.from_id || m.from_id === d.from_id)).reduce((s, m) => s + (m.to_id === d.from_id ? Number(m.quantity_milli) : -Number(m.quantity_milli)), 0));
            if (bal < BigInt(qty)) throw businessError('Stock insuffisant dans le dépôt source.', 409);
          }
          if (hasSql) {
            const movement = await insert('INSERT INTO warehouse_movements(company_id,item_id,from_id,to_id,project_id,quantity_milli,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [ctx.companyId, d.item_id, d.from_id, d.to_id, d.project_id, qty, d.reference, ctx.userId]);
            if (d.project_id) await c.query("INSERT INTO stock_movements(company_id,project_id,item_id,kind,quantity_milli,reference,created_by) VALUES($1,$2,$3,'receipt',$4,$5,$6)", [ctx.companyId, d.project_id, d.item_id, qty, `Dépôt : ${d.reference}`, ctx.userId]);
            return movement;
          }
          const id = crypto.randomUUID();
          await kvPut(c, ctx, 'warehouse_moves', id, { id, item_id: d.item_id, from_id: d.from_id, to_id: d.to_id, project_id: d.project_id, quantity_milli: qty, reference: d.reference, created_by: ctx.userId, created_at: new Date().toISOString() });
          if (d.project_id) {
            const smId = crypto.randomUUID();
            await kvPut(c, ctx, 'stock_movements', smId, { id: smId, project_id: d.project_id, item_id: d.item_id, kind: 'receipt', quantity_milli: qty, reference: `Dépôt : ${d.reference}`, created_by: ctx.userId, created_at: new Date().toISOString() });
          }
          return { id };
        }
        default: return null;
      }
    }));
    return sendJson(res, 201, { result });
  }));
}
