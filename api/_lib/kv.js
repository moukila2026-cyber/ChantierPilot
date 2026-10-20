// Persistance documentaire segmentée multi-tenant adossée à `audit_log`
// (présente sur 100 % des bases PostgreSQL Neon dès le schéma initial V1,
// protégée par `FORCE ROW LEVEL SECURITY` : `company_id = app_current_company_id()`).
//
// Utilisée en repli transparent lorsqu'une table ou colonne optionnelle n'a pas
// encore été créée sur une instance Neon connectée uniquement via `chantierpilot_app`,
// ET lue en complément après migration afin qu'aucune saisie pré-migration ne soit perdue.

const CHUNK_SIZE = 440; // < contrainte SQL `char_length(summary) <= 500`
const PREFIX = '_cp:';
let seq = 0;

function entityKey(collection) {
  const key = `${PREFIX}${collection}`;
  if (key.length > 40) throw new Error(`Collection KV trop longue : ${collection}`);
  return key;
}

function nextGen() {
  seq = (seq + 1) % 46656; // 36^3
  return `${Date.now().toString(36)}.${seq.toString(36).padStart(3, '0')}`;
}

export async function kvPut(client, ctx, collection, id, value) {
  const raw = JSON.stringify(value);
  const gen = nextGen();
  const actions = [];
  const summaries = [];
  const total = Math.max(1, Math.ceil(raw.length / CHUNK_SIZE));
  for (let i = 0; i < total; i += 1) {
    actions.push(`p:${gen}:${String(i).padStart(4, '0')}`);
    summaries.push(raw.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
  await client.query(
    `INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, summary)
     SELECT $1::uuid, $2::uuid, t.a, $3::text, $4::uuid, t.s
     FROM unnest($5::text[], $6::text[]) AS t(a, s)`,
    [ctx.companyId, ctx.userId || null, entityKey(collection), id, actions, summaries],
  );
  return value;
}

export async function kvDelete(client, ctx, collection, id) {
  await client.query(
    `INSERT INTO audit_log (company_id, user_id, action, entity, entity_id, summary)
     VALUES ($1, $2, $3, $4, $5, '')`,
    [ctx.companyId, ctx.userId || null, `d:${nextGen()}`, entityKey(collection), id],
  );
}

function assembleRows(rows) {
  const states = new Map();
  for (const r of rows) {
    const id = r.entity_id;
    if (!id) continue;
    const act = String(r.action || '');
    if (act.startsWith('d:')) {
      states.delete(id);
      continue;
    }
    if (!act.startsWith('p:')) continue;
    const [, gen, idxStr] = act.split(':');
    const cur = states.get(id);
    if (!cur || cur.gen !== gen) {
      states.set(id, { gen, chunks: [[Number(idxStr), r.summary]], created_at: r.created_at });
    } else {
      cur.chunks.push([Number(idxStr), r.summary]);
    }
  }
  const out = [];
  for (const [id, st] of states.entries()) {
    st.chunks.sort((a, b) => a[0] - b[0]);
    try {
      const parsed = JSON.parse(st.chunks.map((c) => c[1]).join(''));
      out.push({ id, created_at: st.created_at, ...parsed });
    } catch {
      // Segment incomplet ignoré sans interrompre la lecture.
    }
  }
  return out;
}

export async function kvList(client, ctx, collection) {
  const { rows } = await client.query(
    `SELECT entity_id, action, summary, created_at
     FROM audit_log
     WHERE company_id = $1 AND entity = $2
     ORDER BY id ASC`,
    [ctx.companyId, entityKey(collection)],
  );
  return assembleRows(rows);
}

export async function kvGet(client, ctx, collection, id) {
  const { rows } = await client.query(
    `SELECT entity_id, action, summary, created_at
     FROM audit_log
     WHERE company_id = $1 AND entity = $2 AND entity_id = $3
     ORDER BY id ASC`,
    [ctx.companyId, entityKey(collection), id],
  );
  return assembleRows(rows)[0] || null;
}
