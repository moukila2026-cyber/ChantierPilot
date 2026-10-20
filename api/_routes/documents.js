import crypto from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../_lib/db.js';
import { handle, sendJson, readJsonBody, securityHeaders } from '../_lib/http.js';
import { requireAdmin, run } from '../_lib/pipeline.js';
import { uuid, money, zeroMoney, text, date, businessError, projectRequired, command } from '../_lib/operations.js';
import { optionalSql } from '../_lib/compat.js';
import { kvGet, kvList, kvPut } from '../_lib/kv.js';
import { checkQuota } from '../_lib/billing.js';
import { fileSchema } from '../_lib/validate.js';
import { decodeFileAttachment } from '../_lib/files.js';
import { quoteTotals, roundedRatio } from '../../shared/trade.js';
import { documentPdf } from '../_lib/document-pdf.js';

const line = z.object({ label: text(), unit: text(30), quantity: z.string().max(20), unit_price: zeroMoney, unit_cost: zeroMoney }).strict();
const priceItem = z.object({ label: text(), unit: text(30), unit_price: zeroMoney, unit_cost: zeroMoney.default(0) }).strict();

const schemas = {
  quote: z.object({ action: z.literal('quote'), project_id: uuid.nullable().default(null), title: text(), client_name: text(), client_address: z.string().trim().max(240).default(''), tax_bps: z.number().int().min(0).max(10000), lines: z.array(line).min(1).max(100), due_date: date }),
  price: z.object({ action: z.literal('price'), label: text(), unit: text(30), unit_price: zeroMoney, unit_cost: zeroMoney }),
  price_import: z.object({ action: z.literal('price_import'), items: z.array(priceItem).min(1).max(200) }),
  duplicate: z.object({ action: z.literal('duplicate'), id: uuid }),
  issue: z.object({ action: z.literal('issue'), id: uuid }),
  reject: z.object({ action: z.literal('reject'), id: uuid }),
  accept: z.object({ action: z.literal('accept'), id: uuid, name: text(120), reference: text(240), start_date: date }),
  invoice: z.object({ action: z.literal('invoice'), quote_id: uuid, kind: z.enum(['deposit', 'progress', 'balance']), percent_bps: z.number().int().min(1).max(10000), due_date: date }),
  credit: z.object({ action: z.literal('credit'), id: uuid, reason: text(240) }),
  receive_payment: z.object({ action: z.literal('receive_payment'), id: uuid, amount: money, date, reference: text(120), method: z.enum(['especes', 'mobile_money', 'virement_bancaire', 'cheque', 'autre']), proof: fileSchema.nullable().default(null) }),
};
schemas.quote_update = schemas.quote.extend({ action: z.literal('quote_update'), id: uuid });

async function rowSql(client, id) {
  const d = (await client.query('SELECT * FROM commercial_documents WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!d) throw businessError('Document introuvable.', 404);
  return d;
}

async function numberSql(client, kind) {
  const n = Number((await client.query('SELECT count(*) AS n FROM commercial_documents')).rows[0].n) + 1;
  return `${{ quote: 'DEV', invoice: 'FAC', credit: 'AV' }[kind]}-${new Date().getUTCFullYear()}-${String(n).padStart(5, '0')}`;
}

function numberKv(docs, kind) {
  const n = docs.length + 1;
  return `${{ quote: 'DEV', invoice: 'FAC', credit: 'AV' }[kind]}-${new Date().getUTCFullYear()}-${String(n).padStart(5, '0')}`;
}

async function insertDocumentSql(client, ctx, data) {
  const keys = ['number', 'kind', 'invoice_kind', 'quote_id', 'source_id', 'project_id', 'title', 'client_name', 'client_address', 'lines', 'subtotal', 'tax', 'total', 'estimated_cost', 'tax_bps', 'status', 'due_date'];
  const values = keys.map((k) => (k === 'lines' ? JSON.stringify(data[k]) : data[k] ?? null));
  return (await client.query(`INSERT INTO commercial_documents(company_id,created_by,${keys.join(',')}) VALUES($1,$2,${keys.map((_, i) => '$' + (i + 3)).join(',')}) RETURNING *`, [ctx.companyId, ctx.userId, ...values])).rows[0];
}

export default async function handler(req, res) {
  return handle(req, res, () => run(res, async () => {
    const ctx = await requireAdmin(req, res); if (!ctx) return;

    if (req.method === 'GET') {
      const data = await withTenant(ctx, async (client) => {
        if (req.query.pdf) {
          if (!uuid.safeParse(req.query.pdf).success) throw businessError('Document invalide.');
          const document = await optionalSql(
            client,
            'sp_doc_pdf',
            () => rowSql(client, req.query.pdf),
            () => kvGet(client, ctx, 'docs', req.query.pdf),
          );
          if (!document) throw businessError('Document introuvable.', 404);
          const [compRes, compMeta] = await Promise.all([
            client.query('SELECT * FROM companies WHERE id=$1', [ctx.companyId]),
            kvGet(client, ctx, 'company_meta', ctx.companyId),
          ]);
          const rawComp = compRes.rows[0];
          const company = {
            ...rawComp,
            tax_number: rawComp.tax_number || compMeta?.tax_number || '',
            tax_regime: rawComp.tax_regime || compMeta?.tax_regime || '',
          };
          return { document, company };
        }

        const projects = (await client.query('SELECT id,name,client_name,status FROM projects ORDER BY created_at DESC LIMIT 1000')).rows;
        const ext = await optionalSql(client, 'sp_documents_list', async () => {
          const docs = (await client.query(`SELECT d.*,COALESCE(p.paid,0)::bigint AS paid,
            COALESCE(c.credited,0)::bigint AS credited FROM commercial_documents d
            LEFT JOIN (SELECT invoice_id,SUM(amount) AS paid FROM payments WHERE invoice_id IS NOT NULL GROUP BY invoice_id) p ON p.invoice_id=d.id
            LEFT JOIN (SELECT source_id,SUM(total) AS credited FROM commercial_documents WHERE kind='credit' GROUP BY source_id) c ON c.source_id=d.id
            ORDER BY d.created_at DESC,d.id LIMIT 500`)).rows;
          const prices = (await client.query('SELECT * FROM price_items ORDER BY label LIMIT 1000')).rows;
          const summary = (await client.query(`SELECT
            (SELECT count(*) FROM commercial_documents WHERE kind='quote' AND status IN ('draft','issued'))::int AS open_quotes,
            COALESCE((SELECT SUM(CASE WHEN kind='credit' THEN -total ELSE total END) FROM commercial_documents WHERE kind IN ('invoice','credit')),0)::bigint AS net_billed,
            COALESCE(SUM(GREATEST(d.total-COALESCE(p.paid,0)-COALESCE(c.credited,0),0)),0)::bigint AS outstanding,
            count(*) FILTER(WHERE d.due_date<current_date AND d.total-COALESCE(p.paid,0)-COALESCE(c.credited,0)>0)::int AS overdue
            FROM commercial_documents d
            LEFT JOIN (SELECT invoice_id,SUM(amount) AS paid FROM payments WHERE invoice_id IS NOT NULL GROUP BY invoice_id) p ON p.invoice_id=d.id
            LEFT JOIN (SELECT source_id,SUM(total) AS credited FROM commercial_documents WHERE kind='credit' GROUP BY source_id) c ON c.source_id=d.id
            WHERE d.kind='invoice'`)).rows[0];
          return { documents: docs, prices, summary };
        }, async () => {
          const [kvDocs, kvPrices] = await Promise.all([
            kvList(client, ctx, 'docs'),
            kvList(client, ctx, 'prices'),
          ]);
          const today = new Date().toISOString().slice(0, 10);
          const docs = kvDocs.map((d) => ({
            ...d,
            paid: Number(d.paid || 0),
            credited: kvDocs.filter((x) => x.source_id === d.id && x.kind === 'credit').reduce((s, x) => s + Number(x.total || 0), 0),
          })).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
          const invoices = docs.filter((d) => d.kind === 'invoice');
          return {
            documents: docs.slice(0, 500),
            prices: kvPrices.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'fr')).slice(0, 1000),
            summary: {
              open_quotes: docs.filter((d) => d.kind === 'quote' && ['draft', 'issued'].includes(d.status)).length,
              net_billed: docs.filter((d) => ['invoice', 'credit'].includes(d.kind))
                .reduce((s, d) => s + (d.kind === 'credit' ? -Number(d.total) : Number(d.total)), 0),
              outstanding: invoices.reduce((s, d) => s + Math.max(0, Number(d.total) - d.paid - d.credited), 0),
              overdue: invoices.filter((d) => String(d.due_date) < today && Number(d.total) - d.paid - d.credited > 0).length,
            },
          };
        });
        return { projects, ...ext };
      });
      if (req.query.pdf) {
        const buffer = await documentPdf(data.document, data.company);
        securityHeaders(res); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${data.document.number}.pdf"`); res.setHeader('Cache-Control', 'no-store'); return res.end(buffer);
      }
      return sendJson(res, 200, data);
    }

    const body = await readJsonBody(req);
    const schema = Object.hasOwn(schemas, body.action) ? schemas[body.action] : null;
    if (!schema) throw businessError('Action inconnue.');

    const result = await withTenant(ctx, (client) => command(client, ctx, body, schema, async (d) => {
      const hasSql = await optionalSql(
        client,
        'sp_docs_probe',
        async () => { await client.query('SELECT 1 FROM commercial_documents LIMIT 1'); return true; },
        false,
      );

      const getDoc = async (id) => {
        if (hasSql) return rowSql(client, id);
        const found = await kvGet(client, ctx, 'docs', id);
        if (!found) throw businessError('Document introuvable.', 404);
        return found;
      };
      const putKvDoc = async (docObj) => {
        const id = docObj.id || crypto.randomUUID();
        const full = {
          company_id: ctx.companyId,
          created_by: ctx.userId,
          created_at: new Date().toISOString(),
          paid: 0,
          invoice_kind: null,
          quote_id: null,
          source_id: null,
          project_id: null,
          accepted_name: null,
          accepted_reference: null,
          accepted_at: null,
          ...docObj,
          id,
        };
        await kvPut(client, ctx, 'docs', id, full);
        return full;
      };

      if (d.action === 'price') {
        if (hasSql) return (await client.query('INSERT INTO price_items(company_id,label,unit,unit_price,unit_cost) VALUES($1,$2,$3,$4,$5) RETURNING *', [ctx.companyId, d.label, d.unit, d.unit_price, d.unit_cost])).rows[0];
        const id = crypto.randomUUID();
        const item = { id, company_id: ctx.companyId, label: d.label, unit: d.unit, unit_price: d.unit_price, unit_cost: d.unit_cost };
        await kvPut(client, ctx, 'prices', id, item);
        return item;
      }

      if (d.action === 'price_import') {
        const imported = [];
        for (const it of d.items) {
          if (hasSql) {
            imported.push((await client.query('INSERT INTO price_items(company_id,label,unit,unit_price,unit_cost) VALUES($1,$2,$3,$4,$5) RETURNING *', [ctx.companyId, it.label, it.unit, it.unit_price, it.unit_cost ?? 0])).rows[0]);
          } else {
            const id = crypto.randomUUID();
            const item = { id, company_id: ctx.companyId, label: it.label, unit: it.unit, unit_price: it.unit_price, unit_cost: it.unit_cost ?? 0 };
            await kvPut(client, ctx, 'prices', id, item);
            imported.push(item);
          }
        }
        return { id: imported[0]?.id, count: imported.length, items: imported };
      }

      if (d.action === 'duplicate') {
        const src = await getDoc(d.id);
        if (src.kind !== 'quote') throw businessError('Seul un devis peut être dupliqué.', 409);
        const copiedLines = (src.lines || []).map((l) => ({
          label: l.label,
          unit: l.unit,
          quantity: String(l.quantity),
          unit_price: Number(l.unit_price || 0),
          unit_cost: Number(l.unit_cost || 0),
        }));
        const totals = quoteTotals(copiedLines, Number(src.tax_bps || 0));
        const copyData = {
          project_id: null,
          title: `${src.title} (copie)`.slice(0, 160),
          client_name: src.client_name,
          client_address: src.client_address || '',
          tax_bps: Number(src.tax_bps || 0),
          due_date: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
          ...totals,
          kind: 'quote',
          status: 'draft',
        };
        if (hasSql) return insertDocumentSql(client, ctx, { ...copyData, number: await numberSql(client, 'quote') });
        return putKvDoc({ ...copyData, number: numberKv(await kvList(client, ctx, 'docs'), 'quote') });
      }

      if (d.action === 'quote' || d.action === 'quote_update') {
        if (d.project_id) await projectRequired(client, d.project_id);
        const totals = quoteTotals(d.lines, d.tax_bps);
        if (d.action === 'quote_update') {
          const existing = await getDoc(d.id);
          if (existing.kind !== 'quote' || existing.status !== 'draft') throw businessError('Seuls les devis en brouillon sont modifiables.', 409);
          if (hasSql) {
            return (await client.query('UPDATE commercial_documents SET project_id=$2,title=$3,client_name=$4,client_address=$5,lines=$6,subtotal=$7,tax=$8,total=$9,estimated_cost=$10,tax_bps=$11,due_date=$12 WHERE id=$1 RETURNING *', [d.id, d.project_id, d.title, d.client_name, d.client_address, JSON.stringify(totals.lines), totals.subtotal, totals.tax, totals.total, totals.estimated_cost, d.tax_bps, d.due_date])).rows[0];
          }
          return putKvDoc({ ...existing, project_id: d.project_id, title: d.title, client_name: d.client_name, client_address: d.client_address, ...totals, tax_bps: d.tax_bps, due_date: d.due_date });
        }
        if (hasSql) return insertDocumentSql(client, ctx, { ...d, ...totals, number: await numberSql(client, 'quote'), kind: 'quote', status: 'draft' });
        return putKvDoc({ ...d, ...totals, number: numberKv(await kvList(client, ctx, 'docs'), 'quote'), kind: 'quote', status: 'draft' });
      }

      if (d.action === 'invoice') {
        const quote = await getDoc(d.quote_id);
        if (quote.kind !== 'quote' || quote.status !== 'accepted' || !quote.project_id) throw businessError('Acceptez un devis avant de facturer.', 409);
        await projectRequired(client, quote.project_id);
        const allKv = hasSql ? [] : await kvList(client, ctx, 'docs');
        const billed = hasSql
          ? (await client.query("SELECT COALESCE(SUM(CASE WHEN kind='credit' THEN -subtotal ELSE subtotal END),0) AS subtotal, COALESCE(SUM(CASE WHEN kind='credit' THEN -tax ELSE tax END),0) AS tax FROM commercial_documents WHERE quote_id=$1 AND kind IN ('invoice','credit')", [quote.id])).rows[0]
          : allKv.filter((x) => x.quote_id === quote.id && ['invoice', 'credit'].includes(x.kind)).reduce(
            (acc, x) => ({
              subtotal: acc.subtotal + (x.kind === 'credit' ? -Number(x.subtotal) : Number(x.subtotal)),
              tax: acc.tax + (x.kind === 'credit' ? -Number(x.tax) : Number(x.tax)),
            }),
            { subtotal: 0, tax: 0 },
          );
        let subtotal; let tax;
        if (d.kind === 'deposit') {
          subtotal = roundedRatio(quote.subtotal, d.percent_bps, 10000);
          tax = roundedRatio(quote.tax, d.percent_bps, 10000);
        } else {
          const percent = d.kind === 'balance' ? 10000 : d.percent_bps;
          subtotal = roundedRatio(quote.subtotal, percent, 10000) - Number(billed.subtotal);
          tax = roundedRatio(quote.tax, percent, 10000) - Number(billed.tax);
        }
        if (subtotal < 0 || tax < 0 || subtotal + tax < 1 || Number(billed.subtotal) + subtotal > Number(quote.subtotal) || Number(billed.tax) + tax > Number(quote.tax)) {
          throw businessError('Avancement déjà facturé ou montant dépassant le devis. Vérifiez les acomptes et situations précédents.', 409);
        }
        const title = `${{ deposit: 'Acompte', progress: 'Situation de travaux', balance: 'Solde' }[d.kind]} · ${quote.number}`;
        const invData = {
          ...quote,
          id: undefined,
          kind: 'invoice',
          invoice_kind: d.kind,
          quote_id: quote.id,
          source_id: quote.id,
          title,
          lines: [{ label: title, quantity: '1', quantity_milli: 1000, unit: 'forfait', unit_price: subtotal, total: subtotal }],
          subtotal,
          tax,
          total: subtotal + tax,
          estimated_cost: 0,
          status: 'issued',
          due_date: d.due_date,
        };
        if (hasSql) return insertDocumentSql(client, ctx, { ...invData, number: await numberSql(client, 'invoice') });
        return putKvDoc({ ...invData, number: numberKv(allKv, 'invoice') });
      }

      const document = await getDoc(d.id);
      if (document.project_id) await projectRequired(client, document.project_id);

      if (d.action === 'receive_payment') {
        if (document.kind !== 'invoice') throw businessError('Choisissez une facture.');
        const allKv = hasSql ? [] : await kvList(client, ctx, 'docs');
        const sums = hasSql
          ? (await client.query("SELECT COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=$1),0) AS paid, COALESCE((SELECT SUM(total) FROM commercial_documents WHERE source_id=$1 AND kind='credit'),0) AS credited", [document.id])).rows[0]
          : {
            paid: Number(document.paid || 0),
            credited: allKv.filter((x) => x.source_id === document.id && x.kind === 'credit').reduce((s, x) => s + Number(x.total || 0), 0),
          };
        if (d.amount > Number(document.total) - Number(sums.paid) - Number(sums.credited)) {
          throw businessError('Le paiement dépasse le solde de la facture.', 409);
        }
        const proof = decodeFileAttachment(d.proof);
        if (hasSql) {
          return (await client.query(`INSERT INTO payments(company_id,project_id,client_name,amount,payment_date,reference,payment_method,memo,created_by,invoice_id,proof,proof_filename,proof_mime,proof_size)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, [ctx.companyId, document.project_id, document.client_name, d.amount, d.date, d.reference, d.method, `Règlement ${document.number}`, ctx.userId, document.id, proof?.buffer || null, proof?.filename || null, proof?.mime || null, proof?.size || null])).rows[0];
        }
        const payRow = (await client.query(`INSERT INTO payments(company_id,project_id,client_name,amount,payment_date,reference,payment_method,memo,created_by,proof,proof_filename,proof_mime,proof_size)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [ctx.companyId, document.project_id, document.client_name, d.amount, d.date, d.reference, d.method, `Règlement ${document.number}`, ctx.userId, proof?.buffer || null, proof?.filename || null, proof?.mime || null, proof?.size || null])).rows[0];
        await putKvDoc({ ...document, paid: Number(document.paid || 0) + d.amount });
        return payRow;
      }

      if (d.action === 'credit') {
        if (document.kind !== 'invoice') throw businessError('Seule une facture peut faire l’objet d’un avoir.');
        if (hasSql) {
          if ((await client.query("SELECT id FROM commercial_documents WHERE source_id=$1 AND kind='credit' UNION ALL SELECT id FROM payments WHERE invoice_id=$1", [document.id])).rows.length) {
            throw businessError('Cette facture est déjà réglée ou créditée. Le remboursement et les avoirs partiels nécessitent un traitement séparé.', 409);
          }
          return insertDocumentSql(client, ctx, { ...document, number: await numberSql(client, 'credit'), kind: 'credit', invoice_kind: null, source_id: document.id, title: `Avoir · ${document.number} · ${d.reason}`.slice(0, 160), status: 'issued' });
        }
        const allKv = await kvList(client, ctx, 'docs');
        if (Number(document.paid || 0) > 0 || allKv.some((x) => x.source_id === document.id && x.kind === 'credit')) {
          throw businessError('Cette facture est déjà réglée ou créditée. Le remboursement et les avoirs partiels nécessitent un traitement séparé.', 409);
        }
        return putKvDoc({ ...document, id: undefined, number: numberKv(allKv, 'credit'), kind: 'credit', invoice_kind: null, source_id: document.id, title: `Avoir · ${document.number} · ${d.reason}`.slice(0, 160), status: 'issued' });
      }

      if (document.kind !== 'quote') throw businessError('Action réservée aux devis.');
      if (d.action === 'issue') {
        if (document.status !== 'draft') throw businessError('Ce devis a déjà été émis.', 409);
        if (hasSql) return (await client.query("UPDATE commercial_documents SET status='issued' WHERE id=$1 RETURNING *", [document.id])).rows[0];
        return putKvDoc({ ...document, status: 'issued' });
      }
      if (d.action === 'reject') {
        if (!['draft', 'issued'].includes(document.status)) throw businessError('Ce devis est déjà clôturé.', 409);
        if (hasSql) return (await client.query("UPDATE commercial_documents SET status='rejected' WHERE id=$1 RETURNING *", [document.id])).rows[0];
        return putKvDoc({ ...document, status: 'rejected' });
      }
      if (d.action === 'accept') {
        if (document.status !== 'issued') throw businessError('Émettez le devis avant d’enregistrer son acceptation.', 409);
        let projectId = document.project_id;
        if (!projectId) {
          await checkQuota(client, ctx, 'projects');
          projectId = (await client.query("INSERT INTO projects(company_id,name,client_name,budget,start_date,status,created_by) VALUES($1,$2,$3,$4,$5,'planifie',$6) RETURNING id", [ctx.companyId, document.title, document.client_name, document.total, d.start_date, ctx.userId])).rows[0].id;
        }
        if (hasSql) {
          if ((await client.query("SELECT id FROM commercial_documents WHERE project_id=$1 AND kind='quote' AND status='accepted'", [projectId])).rows.length) {
            throw businessError('Un devis est déjà accepté pour ce chantier. Les avenants seront traités séparément.', 409);
          }
          return (await client.query("UPDATE commercial_documents SET status='accepted',project_id=$2,accepted_name=$3,accepted_reference=$4,accepted_at=now() WHERE id=$1 RETURNING *", [document.id, projectId, d.name, d.reference])).rows[0];
        }
        const allKv = await kvList(client, ctx, 'docs');
        if (allKv.some((x) => x.project_id === projectId && x.kind === 'quote' && x.status === 'accepted')) {
          throw businessError('Un devis est déjà accepté pour ce chantier. Les avenants seront traités séparément.', 409);
        }
        return putKvDoc({
          ...document,
          status: 'accepted',
          project_id: projectId,
          accepted_name: d.name,
          accepted_reference: d.reference,
          accepted_at: new Date().toISOString(),
        });
      }
      return null;
    }));
    return sendJson(res, 201, { result });
  }));
}
