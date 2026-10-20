// Lecture et optimisation automatique côté client des pièces justificatives.
// Les photos prises au smartphone (JPEG, PNG, WebP, HEIC décodées par le navigateur,
// même de 5 à 12 Mo) sont redimensionnées sur canevas (max 1600 px) et compressées
// en JPEG net (< ~400 Ko) afin de passer instantanément sur réseau mobile 3G/4G.

const COMPRESS_THRESHOLD = 850 * 1024;
const MAX_DIMENSION = 1600;
const ALLOWED_DIRECT = ['image/jpeg', 'image/png', 'application/pdf'];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de décoder cette photo.'));
    img.src = src;
  });
}

async function compressPhoto(file, maxBytes) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Compression photo indisponible sur cet appareil.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.82, 0.68, 0.52]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const data = dataUrl.split(',')[1] || '';
      const bytes = Math.floor((data.length * 3) / 4);
      if (bytes <= maxBytes) {
        const stem = (file.name || 'photo-chantier').replace(/\.[^.]+$/, '').slice(0, 170) || 'photo-chantier';
        return {
          filename: `${stem}.jpg`,
          mime: 'image/jpeg',
          data,
        };
      }
    }
    throw new Error('La photo reste supérieure à 2 Mo même après compression.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readFileAsAttachment(file, maxBytes = 2 * 1024 * 1024) {
  if (!file) return null;

  const isImage = Boolean(file.type && file.type.startsWith('image/'));
  const hasDomCanvas = typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL?.createObjectURL === 'function';

  if (isImage && hasDomCanvas && (!ALLOWED_DIRECT.includes(file.type) || file.size > COMPRESS_THRESHOLD)) {
    return compressPhoto(file, maxBytes);
  }

  if (file.size > maxBytes) {
    throw new Error('Le fichier dépasse la taille maximale de 2 Mo.');
  }
  if (!ALLOWED_DIRECT.includes(file.type)) {
    throw new Error('Formats acceptés : JPEG, PNG ou PDF.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const data = result.split(',')[1] || '';
      resolve({ filename: file.name.slice(0, 180), mime: file.type, data });
    };
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

export const readAttachment = readFileAsAttachment;
