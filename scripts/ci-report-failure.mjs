#!/usr/bin/env node
// Résumé CI volontairement borné : aucun contenu brut de test, valeur de
// fixture, adresse, jeton ou détail de connexion ne sort dans les annotations.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHASES = new Set([
  'test:all', 'check:assets', 'db:test-rls', 'test:migration', 'test:rate-limit',
  'test:unit', 'test:ui', 'test', 'test:theme', 'test:features', 'test:browser',
]);
const HINTS = ['AssertionError', 'TimeoutError', 'ERR_ASSERTION', 'EADDRINUSE',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'MODULE_NOT_FOUND', 'ENOENT'];

export function summarizeFailure(text, requestedPhase) {
  let phase = PHASES.has(requestedPhase) ? requestedPhase : 'tests';
  for (const match of String(text).matchAll(/^>\s+chantierpilot@[^\s]+\s+([\w:-]+)\s*$/gm)) {
    if (PHASES.has(match[1])) phase = match[1];
  }
  const hints = HINTS.filter((hint) => new RegExp(`\\b${hint}\\b`).test(text));
  return `Échec des tests (${phase}).${hints.length ? ` Indices techniques : ${hints.join(', ')}.` : ''} Les valeurs et journaux bruts sont masqués.`;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  let text = '';
  try { text = readFileSync(process.argv[2], 'utf8'); } catch { /* résumé minimal */ }
  console.error(`::error::${summarizeFailure(text, process.argv[3])}`);
}
