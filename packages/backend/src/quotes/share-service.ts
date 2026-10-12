import { createHash, randomBytes } from 'crypto';
import { config } from '../config.js';

/** Jeton de partage : 32 octets aléatoires ; seul le SHA-256 est stocké (spec lot 4 §8). */
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashShareToken(token) };
}
export function hashShareToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
/** Lien public, basé sur FRONTEND_URL (jamais sur l'en-tête Host). */
export function shareUrl(token: string): string { return `${config.frontendUrl.replace(/\/+$/, '')}/q/${token}`; }
