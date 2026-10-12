import { describe, it, expect } from 'vitest';
import { buildQuoteData, toQuoteDto } from './quote-mapper.js';
import { computeQuote, DEFAULT_PRICING_SETTINGS, type CreateQuoteBody } from '@calc3d/common';

const body: CreateQuoteBody = {
  projectName: 'Support', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: '2026-11-01', comment: '',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
  printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
};

describe('quote-mapper', () => {
  it('aller-retour : les données construites, relues comme une ligne Prisma, redonnent le DTO attendu', () => {
    const settings = { ...DEFAULT_PRICING_SETTINGS, wearCostPerHour: 0.15 };
    const result = computeQuote(settings, body);
    const data = buildQuoteData(7, body, settings, result);
    expect(data.userId).toBe(7);
    expect(data.dueDate).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(JSON.parse(data.filamentLines)).toEqual(body.filamentLines);
    const dto = toQuoteDto({ ...data, id: 1, legacyId: null, createdAt: new Date('2026-10-12T10:00:00Z'), updatedAt: new Date('2026-10-12T10:00:00Z') });
    expect(dto).toMatchObject({ id: 1, projectName: 'Support', kind: 'QUOTE', dueDate: '2026-11-01', finalPrice: result.finalPrice, wear: 0.75 });
    expect(dto.settingsSnapshot).toEqual(settings);
    expect(dto.filamentLines).toEqual(body.filamentLines);
    expect(dto.createdAt).toBe('2026-10-12T10:00:00.000Z');
    expect(dto).not.toHaveProperty('userId');
  });
  it('dueDate null est conservé', () => {
    const data = buildQuoteData(1, { ...body, dueDate: null }, DEFAULT_PRICING_SETTINGS, computeQuote(DEFAULT_PRICING_SETTINGS, body));
    expect(data.dueDate).toBeNull();
  });
});
