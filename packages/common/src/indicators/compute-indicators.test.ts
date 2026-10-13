import { describe, it, expect } from 'vitest';
import { computeIndicators } from './compute-indicators.js';
import type { IndicatorQuoteRow } from './types.js';

const NOW = new Date('2026-10-13T12:00:00Z');
const row = (over: Partial<IndicatorQuoteRow>): IndicatorQuoteRow => ({ kind: 'QUOTE', status: 'PENDING', createdAt: '2026-10-01T10:00:00Z', clientResponse: null, clientRespondedAt: null, convertedAt: null, paidAt: null, ...over });
const rows: IndicatorQuoteRow[] = [
  // A : devis créé, accepté, converti, payé dans la fenêtre de 30 jours.
  row({ kind: 'ORDER', status: 'IN_PROGRESS', createdAt: '2026-10-01T10:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-02T10:00:00Z', convertedAt: '2026-10-03T10:00:00Z', paidAt: '2026-10-05T10:00:00Z' }),
  // B : devis créé et refusé dans la fenêtre.
  row({ createdAt: '2026-09-20T10:00:00Z', clientResponse: 'REFUSED', clientRespondedAt: '2026-09-25T10:00:00Z' }),
  // C : commande créée directement, en cours, non payée.
  row({ kind: 'ORDER', createdAt: '2026-10-10T10:00:00Z' }),
  // D : ancien devis accepté dans la fenêtre précédente (13 août → 13 septembre).
  row({ createdAt: '2026-08-01T10:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-09-01T10:00:00Z' }),
  // E : vieille commande terminée non payée : ni en cours ni comptée.
  row({ kind: 'ORDER', status: 'DONE', createdAt: '2026-07-01T10:00:00Z' }),
  // F : vieille commande en pause, non payée : en cours (instantané).
  row({ kind: 'ORDER', status: 'ON_HOLD', createdAt: '2026-07-02T10:00:00Z' }),
];

describe('computeIndicators', () => {
  it('30 jours : compteurs de la période, période précédente, taux, commandes en cours (instantané), groupes par semaine', () => {
    const d = computeIndicators(rows, 30, NOW, 'UTC');
    expect(d.days).toBe(30); expect(d.from).toBe('2026-09-13T12:00:00.000Z'); expect(d.to).toBe(NOW.toISOString());
    expect(d.current).toEqual({ newQuotes: 2, newOrders: 2, paidOrders: 1, accepted: 1, refused: 1, converted: 1 });
    expect(d.previous).toEqual({ newQuotes: 0, newOrders: 0, paidOrders: 0, accepted: 1, refused: 0, converted: 0 });
    expect(d.rates).toEqual({ acceptancePct: 50, conversionPct: 50 });
    expect(d.openOrders).toBe(2);
    expect(d.granularity).toBe('week'); expect(d.buckets).toHaveLength(5);
    expect(d.buckets[0].start).toBe('2026-09-13'); expect(d.buckets[4].start).toBe('2026-10-11'); expect(d.buckets[4].end).toBe('2026-10-13');
    expect(d.buckets[1]).toMatchObject({ refused: 1, accepted: 0 });
    expect(d.buckets[2]).toMatchObject({ accepted: 1, converted: 1, newQuotes: 1 });
    expect(d.buckets[3]).toMatchObject({ paidOrders: 1, newOrders: 1 });
  });
  it('7 jours : un groupe par jour calendaire du fuseau demandé ; 365 jours : un groupe par mois', () => {
    const week = computeIndicators(rows, 7, NOW, 'UTC');
    expect(week.granularity).toBe('day'); expect(week.buckets.map((b) => b.key)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    expect(week.buckets[4]).toMatchObject({ newOrders: 1 });
    expect(week.current).toEqual({ newQuotes: 0, newOrders: 1, paidOrders: 0, accepted: 0, refused: 0, converted: 0 });
    // À Nouméa (UTC+11), 2026-10-13T12:00Z est déjà le 13 à 23 h : même journée ; mais 2026-10-06T12:00Z → le 6 à 23 h. Avec Honolulu (UTC−10), le 13 à 2 h, et « from » tombe le 6 à 2 h.
    const hon = computeIndicators(rows, 7, NOW, 'Pacific/Honolulu');
    expect(hon.buckets[0].key).toBe('2026-10-06'); expect(hon.buckets.at(-1)?.key).toBe('2026-10-13');
    const year = computeIndicators(rows, 365, NOW, 'UTC');
    expect(year.granularity).toBe('month'); expect(year.buckets[0].key).toBe('2025-10'); expect(year.buckets.at(-1)?.key).toBe('2026-10'); expect(year.buckets).toHaveLength(13);
    expect(year.buckets.find((b) => b.key === '2026-09')).toMatchObject({ accepted: 1, refused: 1, newQuotes: 1 });
    expect(year.current).toEqual({ newQuotes: 3, newOrders: 4, paidOrders: 1, accepted: 2, refused: 1, converted: 1 });
  });
  it('taux null quand le dénominateur est nul ; aucune ligne → tout à zéro', () => {
    const d = computeIndicators([], 90, NOW, 'UTC');
    expect(d.rates).toEqual({ acceptancePct: null, conversionPct: null }); expect(d.openOrders).toBe(0);
    expect(d.granularity).toBe('week'); expect(d.buckets).toHaveLength(13);
    expect(d.buckets.every((b) => b.newQuotes === 0 && b.newOrders === 0 && b.accepted === 0)).toBe(true);
  });
});
