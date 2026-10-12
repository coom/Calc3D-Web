import { describe, it, expect } from 'vitest';
import { newShareToken, hashShareToken, shareUrl } from './share-service.js';

describe('share-service', () => {
  it('jeton base64url de 43 caractères, hash SHA-256 hex stable, deux jetons différents', () => {
    const a = newShareToken(); const b = newShareToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(a.token)).toBe(a.hash);
    expect(a.token).not.toBe(b.token);
  });
  it('URL publique basée sur FRONTEND_URL, sans double barre', () => {
    expect(shareUrl('abc')).toMatch(/^https?:\/\/[^/]+\/q\/abc$/);
  });
});
