// POST /api/auth/logout — révoque la session courante.
import { clearSessionCookie, revokeSession, getSessionContext } from '../_lib/auth.js';
import { sendJson, methodNotAllowed, handle } from '../_lib/http.js';
import { run } from '../_lib/pipeline.js';

export default async function handler(req, res) {
  await handle(req, res, async () => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    await run(res, async () => {
      const ctx = await getSessionContext(req);
      if (ctx) await revokeSession(ctx);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
    });
  });
}
