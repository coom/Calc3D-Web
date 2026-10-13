import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { indicatorsRoutes } from './indicators.routes.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const amounts = { filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05, unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26 };
function seed(userId: number, extra: Record<string, unknown>) {
  return prisma.quote.create({ data: { userId, projectName: 'P', customer: 'C', kind: 'QUOTE', status: 'PENDING', quantity: 1, comment: '', filamentLines: '[]', printHours: 1, printMinutes: 0, prepHours: 0, postHours: 0, designHours: 0, packagingHours: 0, consumables: 0, discountPct: 0, shippingCost: 0, settingsSnapshot: JSON.stringify(DEFAULT_PRICING_SETTINGS), ...amounts, ...extra } });
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('GET /api/indicators', () => {
  it('compte les événements de la fenêtre pour le seul utilisateur courant ; fenêtre inconnue ou fuseau invalide → 400', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    await seed(a.id, { kind: 'ORDER', status: 'IN_PROGRESS', createdAt: daysAgo(10), clientResponse: 'ACCEPTED', clientRespondedAt: daysAgo(9), convertedAt: daysAgo(8), paidAt: daysAgo(2) });
    await seed(a.id, { createdAt: daysAgo(20), clientResponse: 'REFUSED', clientRespondedAt: daysAgo(15) });
    await seed(a.id, { kind: 'ORDER', createdAt: daysAgo(3) });
    await seed(a.id, { kind: 'ORDER', status: 'ON_HOLD', createdAt: daysAgo(200) });
    await seed(b.id, { kind: 'ORDER', createdAt: daysAgo(1), clientResponse: 'ACCEPTED', clientRespondedAt: daysAgo(1) });
    const app = appAs(prisma, a, '/api/indicators', indicatorsRoutes);
    const r = await request(app).get('/api/indicators?days=30&tz=Europe/Paris');
    expect(r.status).toBe(200);
    expect(r.body.current).toEqual({ newQuotes: 2, newOrders: 2, paidOrders: 1, accepted: 1, refused: 1, converted: 1 });
    expect(r.body.openOrders).toBe(2); expect(r.body.days).toBe(30); expect(r.body.granularity).toBe('week');
    expect((await request(app).get('/api/indicators')).body.days).toBe(30);
    expect((await request(app).get('/api/indicators?days=7')).body.current.newOrders).toBe(1);
    expect((await request(app).get('/api/indicators?days=15')).status).toBe(400);
    expect((await request(app).get('/api/indicators?days=30&tz=Mars/Olympus')).status).toBe(400);
    const other = await request(appAs(prisma, b, '/api/indicators', indicatorsRoutes)).get('/api/indicators?days=30');
    expect(other.body.current).toEqual({ newQuotes: 0, newOrders: 1, paidOrders: 0, accepted: 1, refused: 0, converted: 0 });
    const admin = await createTestUser(prisma, 'root', 'admin');
    expect((await request(appAs(prisma, admin, '/api/indicators', indicatorsRoutes)).get('/api/indicators?days=365')).body.openOrders).toBe(0);
  });
});
