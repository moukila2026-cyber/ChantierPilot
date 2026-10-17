// Pièces jointes (justificatifs) : validation stricte avant stockage en base.

import { sniffFile } from './validate.js';

/**
 * Décode et valide un justificatif {filename, mime, data(base64)}.
 * Vérifie la taille (2 Mo) ET le contenu réel (magic bytes), pas seulement
 * le type annoncé. Lève une erreur HTTP explicite en cas de problème.
 */
export function decodeFileAttachment(receipt) {
  if (!receipt) return null;
  const buffer = Buffer.from(receipt.data, 'base64');
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    const err = new Error('Le fichier joint dépasse la taille maximale de 2 Mo.');
    err.status = 413; err.code = 'fichier_trop_volumineux';
    throw err;
  }
  const sniffed = sniffFile(buffer);
  if (sniffed !== receipt.mime) {
    const err = new Error('Le fichier joint ne correspond pas à un format accepté (JPEG, PNG ou PDF).');
    err.status = 422; err.code = 'fichier_invalide';
    err.fields = { receipt: 'Formats acceptés : JPEG, PNG, PDF (2 Mo maximum).' };
    throw err;
  }
  return { buffer, filename: receipt.filename.slice(0, 180), mime: receipt.mime, size: buffer.length };
}
