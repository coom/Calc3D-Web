import { describe, it, expect } from 'vitest';
import { toPublicQuoteDto } from './to-public-quote.js';
import { DEFAULT_PRICING_SETTINGS, type QuoteDto } from '../index.js';

const quote: QuoteDto = {
  id: 7, createdAt: '2026-10-01T10:00:00Z', updatedAt: '', legacyId: 'abc', projectName: 'Boîtier', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: '2026-11-15', comment: 'Fragile',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 2, packagingHours: 0.25, quantity: 2, consumables: 1.5, discountPct: 10, shippingCost: 6.5,
  settingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, contingencyPct: 10, vatPct: 20, pricingMode: 'TARGET_MARGIN', pricingPct: 30 },
  filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05,
  unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26,
  shared: true, sharedAt: '2026-10-02T00:00:00Z', clientResponse: 'ACCEPTED', clientRespondedAt: '2026-10-03T00:00:00Z', clientComment: 'ok', responseSeenAt: null, clientEmail: 'c@x.fr', paymentMethod: 'PAYPAL',
};
const FORBIDDEN = ['paypalEnabled', 'settingsSnapshot', 'pricingMode', 'pricingPct', 'userId', 'legacyId', 'id', 'clientEmail', 'responseSeenAt', 'clientComment', 'pricePerGram', 'pricePerHour', 'subtotal', 'contingency', 'priceBeforeRounding'];

describe('toPublicQuoteDto', () => {
  it('avec détail : lignes non nulles, coût de revient, TVA, arrondi ; jamais les clés internes', () => {
    const d = toPublicQuoteDto(quote, { showCostBreakdown: true, currencySymbol: '€', ownerDisplayName: 'Guillaume', paypal: null });
    expect(d.costLines?.map((l) => l.key)).toEqual(['filament', 'electricity', 'laborPrep', 'laborDesign', 'laborPackaging', 'depreciation', 'maintenance', 'wear', 'fixedCosts', 'contingency']);
    expect(d.costAfterContingency).toBe(91.05); expect(d.contingencyPct).toBe(10); expect(d.vatPct).toBe(20); expect(d.laborTotal).toBeCloseTo(75.39, 6);
    expect(d.clientResponse).toBe('ACCEPTED'); expect(d.ownerDisplayName).toBe('Guillaume'); expect(d.currencySymbol).toBe('€');
    for (const k of FORBIDDEN) expect(d).not.toHaveProperty(k);
    expect(JSON.stringify(d)).not.toMatch(/TARGET_MARGIN|"30"|c@x\.fr/);
  });
  it("sans détail : costLines et costAfterContingency à null, main d'œuvre totale et consommables seulement", () => {
    const d = toPublicQuoteDto(quote, { showCostBreakdown: false, currencySymbol: '€', ownerDisplayName: 'G', paypal: null });
    expect(d.costLines).toBeNull(); expect(d.costAfterContingency).toBeNull(); expect(d.laborTotal).toBeCloseTo(75.39, 6); expect(d.fixedCosts).toBe(1.5);
  });
  it('paiement : moyen choisi toujours transmis ; coordonnées PayPal seulement si le propriétaire a activé PayPal', () => {
    const off = toPublicQuoteDto(quote, { showCostBreakdown: false, currencySymbol: '€', ownerDisplayName: 'G', paypal: null });
    expect(off.paymentMethod).toBe('PAYPAL'); expect(off.paypal).toBeNull();
    const on = toPublicQuoteDto(quote, { showCostBreakdown: false, currencySymbol: '€', ownerDisplayName: 'G', paypal: { handle: 'g3d', email: 'g@x.fr' } });
    expect(on.paypal).toEqual({ handle: 'g3d', email: 'g@x.fr' });
  });
});
