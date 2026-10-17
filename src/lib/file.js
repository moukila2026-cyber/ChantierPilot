// Lecture d'un fichier local en base64 pour l'envoi à l'API.

export function readFileAsAttachment(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > maxBytes) {
      return reject(new Error('Le fichier dépasse la taille maximale de 2 Mo.'));
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      return reject(new Error('Formats acceptés : JPEG, PNG ou PDF.'));
    }
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
