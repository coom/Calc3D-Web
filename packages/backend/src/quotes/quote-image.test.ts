import { describe, it, expect } from 'vitest';
import { imageDataUrl, parseImageDataUrl, MAX_IMAGE_BYTES } from './quote-image.js';
import { AppError } from '../middleware/error-handler.js';

const jpeg = (size = 16) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4)]);
const url = (buf: Buffer, mime = 'image/jpeg') => `data:${mime};base64,${buf.toString('base64')}`;

describe("image de devis (data URL JPEG préparée par le navigateur)", () => {
  it('accepte un JPEG ≤ 400 Ko et redonne les octets ; aller-retour avec imageDataUrl', () => {
    const buf = jpeg(1024);
    expect(parseImageDataUrl(url(buf)).equals(buf)).toBe(true);
    expect(imageDataUrl(buf)).toBe(url(buf));
  });
  it('refuse un autre type MIME, un préfixe inconnu, un base64 invalide, des octets non JPEG et une image trop grande (400 validation)', () => {
    const bad = (s: string) => { try { parseImageDataUrl(s); return null; } catch (e) { return e instanceof AppError ? e : null; } };
    expect(bad(url(jpeg(), 'image/png'))?.statusCode).toBe(400);
    expect(bad('http://x/y.jpg')?.statusCode).toBe(400);
    expect(bad('data:image/jpeg;base64,***')?.statusCode).toBe(400);
    expect(bad(url(Buffer.from('<svg onload=alert(1)>')))?.statusCode).toBe(400);
    expect(bad(url(jpeg(MAX_IMAGE_BYTES + 1)))?.code).toBe('validation');
    expect(parseImageDataUrl(url(jpeg(MAX_IMAGE_BYTES))).length).toBe(MAX_IMAGE_BYTES);
  });
});
