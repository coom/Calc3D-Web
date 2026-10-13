import { AppError } from '../middleware/error-handler.js';

/** Taille maximale de l'image d'un devis après préparation par le navigateur (1024 px, JPEG). */
export const MAX_IMAGE_BYTES = 400 * 1024;
const PREFIX = 'data:image/jpeg;base64,';
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Data URL JPEG → octets. Le navigateur a déjà redimensionné et ré-encodé l'image : tout autre type, un base64
 * malformé, des octets qui ne commencent pas par la signature JPEG ou un poids > 400 Ko sont refusés (400 validation).
 */
export function parseImageDataUrl(s: string): Buffer {
  if (!s.startsWith(PREFIX)) throw new AppError(400, 'Invalid image', 'expected a JPEG data URL', 'validation');
  const b64 = s.slice(PREFIX.length);
  if (b64.length === 0 || b64.length % 4 !== 0 || !BASE64_RE.test(b64)) throw new AppError(400, 'Invalid image', 'malformed base64', 'validation');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw new AppError(400, 'Invalid image', `image exceeds ${MAX_IMAGE_BYTES} bytes`, 'validation');
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new AppError(400, 'Invalid image', 'not a JPEG', 'validation');
  return buf;
}

export function imageDataUrl(buf: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}
