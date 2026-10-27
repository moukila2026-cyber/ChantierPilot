#!/usr/bin/env node
// Sonde de santé HTTP en lecture seule. Elle ne se substitue ni au préflight
// de production ni à une vérification des sauvegardes et droits RLS.
import { pathToFileURL } from 'node:url';

const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

function healthUrl(value) {
  const base = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(base.hostname);
  if (!['https:', 'http:'].includes(base.protocol)
    || (base.protocol === 'http:' && !loopback)
    || base.username || base.password || base.search || base.hash
    || !['', '/'].includes(base.pathname)) {
    throw new Error('adresse invalide');
  }
  return new URL('/api/health', base).toString();
}

async function readJsonBounded(response) {
  const type = response.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(type)) throw new Error('format invalide');
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    throw new Error('réponse trop volumineuse');
  }
  if (!response.body) throw new Error('réponse vide');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('réponse trop volumineuse');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  return JSON.parse(text);
}

/** Retourne 0 pour un contrôle réussi et 1 sinon ; n'affiche aucune valeur de configuration. */
export async function runMonitor({ env = process.env, fetcher = fetch, report = console.log } = {}) {
  if (!env.APP_URL) {
    report('Surveillance indisponible : APP_URL doit être configurée.');
    return 1;
  }
  let target;
  try { target = healthUrl(env.APP_URL); } catch {
    report('Surveillance indisponible : APP_URL est invalide ou non sécurisée.');
    return 1;
  }
  const readyFlag = env.MONITOR_REQUIRE_READY;
  if (readyFlag !== undefined && readyFlag !== '' && !['0', '1'].includes(readyFlag)) {
    report('Surveillance indisponible : MONITOR_REQUIRE_READY est invalide.');
    return 1;
  }
  const requireReady = readyFlag === '1';
  let payload;
  try {
    const response = await fetcher(target, {
      method: 'GET', headers: { Accept: 'application/json' },
      redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) throw new Error('réponse HTTP non valide');
    payload = await readJsonBounded(response);
  } catch {
    report('Surveillance en échec : la réponse de santé est indisponible ou invalide.');
    return 1;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.status !== 'ok' || payload.database !== 'ok' || payload.schema !== 'ok') {
    report('Surveillance en échec : service, base ou schéma non opérationnel.');
    return 1;
  }
  if (requireReady && payload.ready !== true) {
    report('Surveillance stricte en échec : disponibilité complète non attestée par l’API.');
    return 1;
  }
  report(requireReady
    ? 'Surveillance : disponibilité déclarée par l’API. Le préflight reste nécessaire.'
    : 'Surveillance : santé technique de base vérifiée. Ce contrôle ne valide pas la production.');
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exitCode = await runMonitor();
