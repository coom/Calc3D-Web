import type { IndicatorBucket, IndicatorCounts, IndicatorGranularity, IndicatorQuoteRow, IndicatorsDto, IndicatorWindow } from './types.js';

const DAY = 86_400_000;
type EventKind = keyof IndicatorCounts;

/** Jour calendaire yyyy-MM-dd d'un instant dans le fuseau demandé (celui du navigateur, pas du serveur). */
function localDay(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Arithmétique sur des jours calendaires (midi UTC pour ignorer les changements d'heure). */
const noon = (day: string) => Date.parse(`${day}T12:00:00Z`);
const addDays = (day: string, n: number) => new Date(noon(day) + n * DAY).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((noon(b) - noon(a)) / DAY);
const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
const monthKeyOf = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
const lastDayOfMonth = (idx: number) => new Date(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 0, 12)).toISOString().slice(0, 10);
const emptyCounts = (): IndicatorCounts => ({ newQuotes: 0, newOrders: 0, paidOrders: 0, accepted: 0, refused: 0, converted: 0 });
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Événements datés d'une ligne. Une ligne née devis puis convertie compte un devis créé, une commande nouvelle (à la conversion) et une conversion. */
function eventsOf(r: IndicatorQuoteRow): { kind: EventKind; at: Date }[] {
  const out: { kind: EventKind; at: Date }[] = [];
  if (r.kind === 'QUOTE' || r.convertedAt !== null) out.push({ kind: 'newQuotes', at: new Date(r.createdAt) });
  if (r.kind === 'ORDER') out.push({ kind: 'newOrders', at: new Date(r.convertedAt ?? r.createdAt) });
  if (r.paidAt) out.push({ kind: 'paidOrders', at: new Date(r.paidAt) });
  if (r.clientResponse && r.clientRespondedAt) out.push({ kind: r.clientResponse === 'ACCEPTED' ? 'accepted' : 'refused', at: new Date(r.clientRespondedAt) });
  if (r.convertedAt) out.push({ kind: 'converted', at: new Date(r.convertedAt) });
  return out;
}

/** Groupes couvrant toute la fenêtre (même vides) et fonction d'affectation d'un instant à son groupe. */
function buildBuckets(fromDay: string, toDay: string, days: IndicatorWindow, timeZone: string): { granularity: IndicatorGranularity; buckets: IndicatorBucket[]; indexOf: (d: Date) => number } {
  const span = dayDiff(fromDay, toDay);
  if (days === 7) {
    const buckets = Array.from({ length: span + 1 }, (_, i) => { const day = addDays(fromDay, i); return { key: day, start: day, end: day, ...emptyCounts() }; });
    return { granularity: 'day', buckets, indexOf: (d) => dayDiff(fromDay, localDay(d, timeZone)) };
  }
  if (days === 365) {
    const first = monthIndex(fromDay); const last = monthIndex(toDay);
    const buckets = Array.from({ length: last - first + 1 }, (_, i) => {
      const idx = first + i; const key = monthKeyOf(idx);
      return { key, start: i === 0 ? fromDay : `${key}-01`, end: idx === last ? toDay : lastDayOfMonth(idx), ...emptyCounts() };
    });
    return { granularity: 'month', buckets, indexOf: (d) => monthIndex(localDay(d, timeZone)) - first };
  }
  const n = Math.ceil((span + 1) / 7);
  const buckets = Array.from({ length: n }, (_, i) => {
    const start = addDays(fromDay, 7 * i); const end = i === n - 1 ? toDay : addDays(fromDay, 7 * i + 6);
    return { key: start, start, end, ...emptyCounts() };
  });
  return { granularity: 'week', buckets, indexOf: (d) => Math.floor(dayDiff(fromDay, localDay(d, timeZone)) / 7) };
}

/**
 * Indicateurs de la page du même nom. Fonction pure : fenêtre glissante [now − days, now], période précédente
 * de même durée juste avant, instantané des commandes en cours, groupes chronologiques (jour / semaine / mois)
 * calculés dans `timeZone`. Les montants ne sont jamais lus ; seuls les événements datés comptent.
 */
export function computeIndicators(rows: IndicatorQuoteRow[], days: IndicatorWindow, now: Date, timeZone = 'UTC'): IndicatorsDto {
  const from = new Date(now.getTime() - days * DAY);
  const prevFrom = new Date(from.getTime() - days * DAY);
  const current = emptyCounts(); const previous = emptyCounts();
  const { granularity, buckets, indexOf } = buildBuckets(localDay(from, timeZone), localDay(now, timeZone), days, timeZone);
  let openOrders = 0;
  for (const r of rows) {
    if (r.kind === 'ORDER' && r.status !== 'DONE' && !r.paidAt) openOrders += 1;
    for (const e of eventsOf(r)) {
      if (e.at >= from && e.at <= now) {
        current[e.kind] += 1;
        const b = buckets[indexOf(e.at)];
        if (b) b[e.kind] += 1;
      } else if (e.at >= prevFrom && e.at < from) previous[e.kind] += 1;
    }
  }
  const answered = current.accepted + current.refused;
  return {
    days, from: from.toISOString(), to: now.toISOString(), openOrders, current, previous,
    rates: { acceptancePct: answered > 0 ? round1((current.accepted / answered) * 100) : null, conversionPct: current.newQuotes > 0 ? round1((current.converted / current.newQuotes) * 100) : null },
    granularity, buckets,
  };
}
