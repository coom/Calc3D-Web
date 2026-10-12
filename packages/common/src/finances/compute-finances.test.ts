import { describe, it, expect } from 'vitest';
import { computeFinances } from './compute-finances.js';
import type { FinanceQuoteRow, FinancePurchaseRow } from './types.js';

const NOW = new Date('2026-10-12T12:00:00Z');
const q = (over: Partial<FinanceQuoteRow>): FinanceQuoteRow => ({
  kind: 'ORDER', createdAt: '2026-10-01T10:00:00Z', finalPrice: 100, costAfterContingency: 60,
  filamentCost: 10, electricityCost: 5, laborPrep: 10, laborPost: 5, laborDesign: 0, laborPackaging: 5,
  depreciation: 4, maintenance: 1, wear: 2, fixedCosts: 8, contingency: 10, ...over,
});
const p = (over: Partial<FinancePurchaseRow>): FinancePurchaseRow => ({ date: '2026-10-05', category: 'FILAMENT', amount: 25, ...over });

describe('computeFinances', () => {
  it('ne compte que les commandes : revenu, coût, marge et pourcentage', () => {
    const r = computeFinances([q({}), q({ kind: 'QUOTE', finalPrice: 999 }), q({ finalPrice: 50, costAfterContingency: 40 })], [], 'all', NOW);
    expect(r.orders).toEqual({ count: 2, revenue: 150, printingCost: 100, netMargin: 50, netMarginPct: (50 / 150) * 100 });
  });
  it('répartit le coût par poste, trié décroissant, avec le pourcentage du coût total', () => {
    const r = computeFinances([q({})], [], 'all', NOW);
    expect(r.costBreakdown[0]).toEqual({ key: 'labor', amount: 20, pct: (20 / 60) * 100 });
    expect(r.costBreakdown.map((c) => c.key)).toEqual(['labor', 'filament', 'contingency', 'fixedCosts', 'printer', 'electricity']);
    expect(r.costBreakdown.find((c) => c.key === 'printer')?.amount).toBe(7);
  });
  it('filtre par période sur la date du devis et sur la date de l\'achat', () => {
    const quotes = [q({ createdAt: '2026-10-02T00:00:00Z' }), q({ createdAt: '2026-03-02T00:00:00Z' }), q({ createdAt: '2025-11-02T00:00:00Z' }), q({ createdAt: '2025-01-02T00:00:00Z' })];
    const purchases = [p({ date: '2026-10-05' }), p({ date: '2026-02-05' }), p({ date: '2025-06-05' })];
    expect(computeFinances(quotes, purchases, 'month', NOW).orders.count).toBe(1);
    expect(computeFinances(quotes, purchases, 'month', NOW).purchases.count).toBe(1);
    expect(computeFinances(quotes, purchases, 'year', NOW).orders.count).toBe(2);
    expect(computeFinances(quotes, purchases, 'year', NOW).purchases.count).toBe(2);
    expect(computeFinances(quotes, purchases, '12m', NOW).orders.count).toBe(3);
    expect(computeFinances(quotes, purchases, 'all', NOW).orders.count).toBe(4);
    expect(computeFinances(quotes, purchases, 'all', NOW).purchases.total).toBe(75);
  });
  it('évolution mensuelle : clés yyyy-MM, mois sans donnée absents, plus récent en premier, 12 mois maximum', () => {
    const quotes = Array.from({ length: 15 }, (_, i) => q({ createdAt: `${2025 + Math.floor((i + 6) / 12)}-${String(((i + 6) % 12) + 1).padStart(2, '0')}-10T00:00:00Z`, finalPrice: 10 }));
    const r = computeFinances(quotes, [p({ date: '2026-09-15', amount: 7 })], 'all', NOW);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[0].month).toBe('2026-09');
    expect(r.monthly[0]).toEqual({ month: '2026-09', revenue: 10, printingCost: 60, purchases: 7 });
    expect(r.monthly[11].month).toBe('2025-10');
  });
  it('achats par catégorie et comparatif coût modélisé / achats réels', () => {
    const r = computeFinances([q({})], [p({ amount: 30 }), p({ category: 'TOOLS', amount: 10 })], 'all', NOW);
    expect(r.purchasesByCategory).toEqual([{ category: 'FILAMENT', amount: 30, pct: 75 }, { category: 'TOOLS', amount: 10, pct: 25 }]);
    expect(r.comparison).toEqual({ modeledCost: 60, actualPurchases: 40 });
    expect(r.purchases.gapVsPrintingCost).toBe(-20);
  });
  it('sans commande : zéros partout, pas de NaN', () => {
    const r = computeFinances([], [], 'all', NOW);
    expect(r.orders).toEqual({ count: 0, revenue: 0, printingCost: 0, netMargin: 0, netMarginPct: 0 });
    expect(r.costBreakdown.every((c) => c.pct === 0)).toBe(true);
    expect(r.monthly).toEqual([]);
  });
});
