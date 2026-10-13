/** Grand côté maximal et poids maximal (après ré-encodage JPEG) de l'image d'un devis ; mêmes bornes que le serveur. */
export const MAX_DIMENSION = 1024;
export const MAX_BYTES = 400 * 1024;

export class ImagePrepareError extends Error {
  constructor(public code: 'prepare' | 'tooLarge') { super(code); this.name = 'ImagePrepareError'; }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImagePrepareError('prepare'));
    img.src = url;
  });
}
/** Octets décodés d'une data URL base64 (sans décoder). */
const dataUrlBytes = (dataUrl: string) => { const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1); return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0); };

/**
 * Prépare une image dans le navigateur, qu'elle vienne d'un fichier local ou d'une data URL renvoyée par le serveur :
 * réduction à 1024 px (proportions conservées), fond blanc, ré-encodage JPEG en baissant la qualité jusqu'à tenir
 * sous 400 Ko. Résultat : data URL `image/jpeg`, seule forme acceptée par l'API.
 */
export async function prepareImage(source: Blob | string): Promise<string> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const w0 = img.naturalWidth || img.width; const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new ImagePrepareError('prepare');
    const scale = Math.min(1, MAX_DIMENSION / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)); const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImagePrepareError('prepare');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const quality of [0.85, 0.7, 0.55]) {
      const out = canvas.toDataURL('image/jpeg', quality);
      if (!out.startsWith('data:image/jpeg;base64,')) throw new ImagePrepareError('prepare');
      if (dataUrlBytes(out) <= MAX_BYTES) return out;
    }
    throw new ImagePrepareError('tooLarge');
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}
