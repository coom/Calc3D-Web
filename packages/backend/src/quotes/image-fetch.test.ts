import { describe, it, expect } from 'vitest';
import { fetchRemoteImage, isPublicAddress, MAX_REMOTE_IMAGE_BYTES, type FetchDeps } from './image-fetch.js';
import { AppError } from '../middleware/error-handler.js';

const hosts: Record<string, string[]> = { 'img.example.com': ['203.0.113.10'], 'cdn.example.com': ['2001:db8::1'], 'intranet.local': ['10.0.0.5'], 'both.example.com': ['203.0.113.11', '192.168.1.2'] };
const lookup: NonNullable<FetchDeps['lookup']> = async (host) => { const a = hosts[host]; if (!a) throw new Error('ENOTFOUND'); return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })); };
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const deps = (handler: Handler): FetchDeps => ({ lookup, fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as typeof fetch });
const fail = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof AppError ? e : null; } };

describe('isPublicAddress', () => {
  it('rejette boucle locale, privées, lien local, métadonnées cloud, CGNAT, non spécifiée, IPv6 locales et IPv4 mappées', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']) expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['203.0.113.10', '8.8.8.8', '172.32.0.1', '2001:db8::1', '::ffff:8.8.8.8']) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe('fetchRemoteImage', () => {
  it('télécharge une image publique : type MIME et octets, sans transmettre de cookies, avec un délai borné', async () => {
    let seen: RequestInit | undefined;
    const r = await fetchRemoteImage('https://img.example.com/a.png?x=1', deps((_u, init) => { seen = init; return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }); }));
    expect(r.mime).toBe('image/png'); expect(r.data.equals(png)).toBe(true);
    expect(seen?.redirect).toBe('manual'); expect(seen?.credentials).toBe('omit'); expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });
  it('URL invalide, schéma non http(s), identifiants dans l’URL, hôte inconnu → 400 validation', async () => {
    const d = deps(() => new Response(png));
    for (const u of ['pas une url', 'ftp://img.example.com/a.png', 'file:///etc/passwd', 'https://user:pw@img.example.com/a.png', 'https://nope.example.com/a.png']) expect((await fail(fetchRemoteImage(u, d)))?.statusCode, u).toBe(400);
  });
  it('adresse privée, directe ou par résolution DNS (même une seule parmi plusieurs) → 400 blocked_address, aucune requête', async () => {
    let calls = 0; const d = deps(() => { calls += 1; return new Response(png); });
    for (const u of ['http://10.0.0.5/a.png', 'http://127.0.0.1:3001/api/health', 'http://[::1]/a.png', 'http://169.254.169.254/latest/meta-data', 'http://intranet.local/a.png', 'http://both.example.com/a.png', 'http://localhost/a.png']) {
      const e = await fail(fetchRemoteImage(u, d)); expect(e?.code, u).toBe('blocked_address');
    }
    expect(calls).toBe(0);
  });
  it('redirections suivies (3 au plus) et revalidées : vers une adresse privée → bloquée', async () => {
    const d = deps((u) => u.includes('start') ? new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/final.png' } }) : new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
    expect((await fetchRemoteImage('https://img.example.com/start', d)).mime).toBe('image/png');
    const toPrivate = deps(() => new Response(null, { status: 301, headers: { location: 'http://intranet.local/x.png' } }));
    expect((await fail(fetchRemoteImage('https://img.example.com/start', toPrivate)))?.code).toBe('blocked_address');
    const loop = deps(() => new Response(null, { status: 302, headers: { location: 'https://img.example.com/again' } }));
    expect((await fail(fetchRemoteImage('https://img.example.com/start', loop)))?.code).toBe('fetch_failed');
  });
  it('statut non 200, erreur réseau → 502 fetch_failed ; type non image → 415 not_image ; plus de 10 Mo → 413 too_large', async () => {
    expect((await fail(fetchRemoteImage('https://img.example.com/a', deps(() => new Response('nope', { status: 404 })))))?.statusCode).toBe(502);
    expect((await fail(fetchRemoteImage('https://img.example.com/a', deps(() => { throw new Error('ECONNRESET'); }))))?.code).toBe('fetch_failed');
    expect((await fail(fetchRemoteImage('https://img.example.com/a', deps(() => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })))))?.code).toBe('not_image');
    const big = deps(() => new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(MAX_REMOTE_IMAGE_BYTES + 1) } }));
    expect((await fail(fetchRemoteImage('https://img.example.com/a', big)))?.code).toBe('too_large');
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_REMOTE_IMAGE_BYTES)); c.enqueue(new Uint8Array(16)); c.close(); } });
    expect((await fail(fetchRemoteImage('https://img.example.com/a', deps(() => new Response(stream, { status: 200, headers: { 'content-type': 'image/jpeg' } })))))?.code).toBe('too_large');
  });
});
