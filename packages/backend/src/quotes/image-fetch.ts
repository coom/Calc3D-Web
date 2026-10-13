import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../middleware/error-handler.js';

/** Poids maximal téléchargé (le navigateur réduit ensuite à 1024 px / 400 Ko). */
export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export interface FetchDeps { fetchImpl?: typeof fetch; lookup?: (host: string) => Promise<{ address: string; family: number }[]> }
const defaultLookup: NonNullable<FetchDeps['lookup']> = (host) => dnsLookup(host, { all: true });

const ipv4ToInt = (ip: string) => ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
const inV4 = (ip: string, cidr: string) => { const [net, bits] = cidr.split('/'); const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0; return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(net) & mask) >>> 0); };
/** Plages non routables ou sensibles : boucle locale, privées, lien local (métadonnées cloud), CGNAT, réseau nul, 224/4 multicast, 240/4 réservé. */
const PRIVATE_V4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '224.0.0.0/4', '240.0.0.0/4'];

/** Vrai seulement pour une adresse publique routable ; une IPv4 mappée en IPv6 est jugée sur sa partie IPv4. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return !PRIVATE_V4.some((c) => inV4(ip, c));
  if (kind !== 6) return false;
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  if (lower === '::' || lower === '::1') return false;
  const head = lower.split(':')[0];
  if (/^fe[89ab]/.test(head)) return false; // lien local fe80::/10
  if (/^f[cd]/.test(head)) return false; // uniques locales fc00::/7
  if (/^ff/.test(head)) return false; // multicast
  return true;
}

const fetchError = (details: string) => new AppError(502, 'Could not download the image', details, 'fetch_failed');

/** URL http(s) sans identifiants, dont l'hôte (littéral ou résolu, toutes les adresses) est public ; sinon 400. */
async function checkUrl(raw: string, lookup: NonNullable<FetchDeps['lookup']>): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError(400, 'Invalid URL', undefined, 'validation'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AppError(400, 'Only http(s) URLs are allowed', undefined, 'validation');
  if (url.username || url.password) throw new AppError(400, 'Credentials in URL are not allowed', undefined, 'validation');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const blocked = () => new AppError(400, 'URL points to a private or local address', undefined, 'blocked_address');
  if (host === 'localhost' || host.endsWith('.localhost')) throw blocked();
  if (isIP(host)) { if (!isPublicAddress(host)) throw blocked(); return url; }
  let addresses: { address: string }[];
  try { addresses = await lookup(host); } catch { throw new AppError(400, 'Unknown host', undefined, 'validation'); }
  if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) throw blocked();
  return url;
}

/**
 * Seule exception, avec SMTP, à l'absence d'appel réseau sortant du backend : téléchargement d'une image d'illustration
 * à partir d'une URL fournie par l'utilisateur (le navigateur ne peut pas le faire depuis un autre domaine, CORS).
 * Garde-fous anti-SSRF : http(s) seulement, aucune adresse privée ou locale (littérale ou résolue), redirections
 * revalidées une à une (3 au plus), délai de 10 s, type `image/*` exigé, 10 Mo au plus, aucun cookie transmis.
 */
export async function fetchRemoteImage(raw: string, deps: FetchDeps = {}): Promise<{ mime: string; data: Buffer }> {
  const fetchImpl = deps.fetchImpl ?? fetch; const lookup = deps.lookup ?? defaultLookup;
  let url = await checkUrl(raw, lookup);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop += 1) {
      let res: Response;
      try { res = await fetchImpl(url.toString(), { redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { accept: 'image/*' } }); }
      catch (err) { throw fetchError(err instanceof Error ? err.message : String(err)); }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || hop >= MAX_REDIRECTS) throw fetchError('too many redirects');
        url = await checkUrl(new URL(loc, url).toString(), lookup);
        continue;
      }
      if (res.status !== 200) throw fetchError(`HTTP ${res.status}`);
      const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!mime.startsWith('image/')) throw new AppError(415, 'The URL does not point to an image', mime || 'no content-type', 'not_image');
      const tooLarge = () => new AppError(413, 'Image too large', `limit ${MAX_REMOTE_IMAGE_BYTES} bytes`, 'too_large');
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > MAX_REMOTE_IMAGE_BYTES) throw tooLarge();
      if (!res.body) throw fetchError('empty body');
      const chunks: Uint8Array[] = []; let total = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REMOTE_IMAGE_BYTES) { await reader.cancel().catch(() => {}); throw tooLarge(); }
        chunks.push(value);
      }
      return { mime, data: Buffer.concat(chunks) };
    }
  } finally { clearTimeout(timer); }
}
