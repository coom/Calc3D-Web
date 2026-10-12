import { describe, it, expect } from 'vitest';
import { computeQuote } from './compute-quote.js';
import { DEFAULT_PRICING_SETTINGS, type PricingSettings, type QuoteInput, type QuoteResult } from './types.js';

const EPS = 1e-4;
const emptyInput: QuoteInput = { filamentLines: [], printHours: 0, printMinutes: 0, prepHours: 0, postHours: 0, designHours: 0, packagingHours: 0, quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0 };
const s = (over: Partial<PricingSettings>): PricingSettings => ({ ...DEFAULT_PRICING_SETTINGS, ...over });

function expectResult(actual: QuoteResult, expected: QuoteResult) {
  for (const key of Object.keys(expected) as (keyof QuoteResult)[]) {
    const e = expected[key]; const a = actual[key];
    if (typeof e === 'boolean') expect(a, key).toBe(e);
    else expect(Math.abs((a as number) - (e as number)), `${key}: ${a} vs ${e}`).toBeLessThan(EPS);
  }
}

describe('computeQuote — cas dorés issus de Invoke-Calcul (PowerShell 1.3.0)', () => {
  const g1Settings = s({ wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0 });
  const g1Input: QuoteInput = { ...emptyInput, filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printHours: 5, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25 };
  const g1: QuoteResult = {
    filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.52704,
    laborPrep: 12.31, laborPost: 6.155, laborDesign: 60, laborPackaging: 2.5,
    depreciation: 2.264167, maintenance: 0.113208, wear: 0.75, fixedCosts: 0,
    subtotal: 86.599415, contingency: 8.659942, costAfterContingency: 95.259356,
    unitPriceExclTax: 114.311228, totalExclTax: 114.311228, discountAmount: 0, shippingCost: 0, vatAmount: 0,
    priceBeforeFloor: 114.311228, floorApplied: false, priceBeforeRounding: 114.311228, roundingAmount: 0, roundingApplied: false,
    finalPrice: 114.311228, pricePerGram: 1.143112, pricePerHour: 22.862246,
  };

  it('G1 markup, un filament, quatre postes de main d\'œuvre, usure', () => {
    expectResult(computeQuote(g1Settings, g1Input), g1);
  });

  it('G2 idem G1 avec arrondi à l\'euro supérieur', () => {
    expectResult(computeQuote({ ...g1Settings, roundToEuro: true }, g1Input), { ...g1, roundingAmount: 0.688772, roundingApplied: true, finalPrice: 115 });
  });

  it('G3 marge cible, deux filaments (ligne à poids 0 ignorée), quantité 3, remise, port, TVA, minutes', () => {
    const settings = s({ pricingMode: 'TARGET_MARGIN', pricingPct: 30, vatPct: 20, floorPrice: 0, wearCostPerHour: 0.2, defaultFixedCosts: 0.5 });
    const input: QuoteInput = { ...emptyInput, filamentLines: [
      { material: 'PETG', weightG: 42.5, pricePerKg: 20, wastePct: 5 },
      { material: 'TPU', weightG: 12, pricePerKg: 25, wastePct: 15 },
      { material: 'PLA', weightG: 0, pricePerKg: 18, wastePct: 10 },
    ], printHours: 2, printMinutes: 45, prepHours: 0.25, packagingHours: 0.5, quantity: 3, consumables: 1.5, discountPct: 10, shippingCost: 6.5 };
    expectResult(computeQuote(settings, input), {
      filamentWeightG: 54.5, filamentCost: 1.2375, printTimeH: 2.75, energyKwh: 1.485, electricityCost: 0.289872,
      laborPrep: 3.0775, laborPost: 0, laborDesign: 0, laborPackaging: 6.155,
      depreciation: 1.245292, maintenance: 0.062265, wear: 0.55, fixedCosts: 2,
      subtotal: 14.617428, contingency: 1.461743, costAfterContingency: 16.079171,
      unitPriceExclTax: 22.970244, totalExclTax: 68.910733, discountAmount: 6.891073, shippingCost: 6.5, vatAmount: 13.703932,
      priceBeforeFloor: 82.223592, floorApplied: false, priceBeforeRounding: 82.223592, roundingAmount: 0, roundingApplied: false,
      finalPrice: 82.223592, pricePerGram: 0.421472, pricePerHour: 8.352816,
    });
  });

  it('G4 plancher 5,5 puis arrondi → 6, entrées nulles', () => {
    const r = computeQuote(s({ roundToEuro: true, floorPrice: 5.5 }), emptyInput);
    expect(r.priceBeforeFloor).toBe(0); expect(r.floorApplied).toBe(true);
    expect(r.priceBeforeRounding).toBe(5.5); expect(r.roundingAmount).toBeCloseTo(0.5, 6); expect(r.roundingApplied).toBe(true);
    expect(r.finalPrice).toBe(6); expect(r.pricePerGram).toBe(0); expect(r.pricePerHour).toBe(0);
  });

  const flat = s({ roundToEuro: true, floorPrice: 0, contingencyPct: 0, pricingPct: 0, electricityPricePerKwh: 0, printerPurchasePrice: 0 });
  it('G5 virgule flottante : 3 × 4,1 = 12,3 → 13', () => {
    const r = computeQuote({ ...flat, hourlyRatePreparation: 4.1 }, { ...emptyInput, prepHours: 3 });
    expect(r.finalPrice).toBe(13); expect(r.roundingAmount).toBeCloseTo(0.7, 6); expect(r.roundingApplied).toBe(true);
  });
  it('G6 prix exactement 12 : arrondi non appliqué', () => {
    const r = computeQuote({ ...flat, hourlyRatePreparation: 12 }, { ...emptyInput, prepHours: 1 });
    expect(r.finalPrice).toBe(12); expect(r.roundingAmount).toBe(0); expect(r.roundingApplied).toBe(false);
  });
});

describe('computeQuote — garde-fous', () => {
  it('refuse une marge cible ≥ 100 %', () => {
    expect(() => computeQuote(s({ pricingMode: 'TARGET_MARGIN', pricingPct: 100 }), emptyInput)).toThrow(/pricingPct/);
    expect(() => computeQuote(s({ pricingMode: 'TARGET_MARGIN', pricingPct: 150 }), emptyInput)).toThrow(/pricingPct/);
  });
  it('une durée de vie imprimante à 0 donne un amortissement nul, pas une division par zéro', () => {
    const r = computeQuote(s({ printerLifetimeHours: 0, floorPrice: 0 }), { ...emptyInput, printHours: 3 });
    expect(r.depreciation).toBe(0); expect(r.maintenance).toBe(0); expect(Number.isFinite(r.finalPrice)).toBe(true);
  });
  it('ne mute pas ses arguments', () => {
    const input = { ...emptyInput, filamentLines: [{ material: 'PLA', weightG: 10, pricePerKg: 18, wastePct: 0 }] };
    const copy = JSON.parse(JSON.stringify(input));
    computeQuote(DEFAULT_PRICING_SETTINGS, input);
    expect(input).toEqual(copy);
  });
});
