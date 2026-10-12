import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { financesRoutes } from './finances.routes.js';
import { quotesRoutes } from './quotes.routes.js';
import { purchasesRoutes } from './purchases.routes.js';
import type { CreateQuoteBody } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const quote: CreateQuoteBody = {
  projectName: 'P', customer: 'C', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
  printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 0, packagingHours: 0,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
};

describe('GET /api/finances', () => {
  it('agrège uniquement les commandes et les achats de l\'utilisateur', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const qa = appAs(prisma, a, '/api/quotes', quotesRoutes); const pa = appAs(prisma, a, '/api/purchases', purchasesRoutes);
    const created = (await request(qa).post('/api/quotes').send(quote)).body;
    await request(qa).post(`/api/quotes/${created.id}/convert`);
    await request(qa).post('/api/quotes').send(quote); // devis non converti : ignoré
    await request(pa).post('/api/purchases').send({ date: new Date().toISOString().slice(0, 10), category: 'FILAMENT', description: 'Bobine', amount: 20, supplier: '', comment: '' });
    const qb = appAs(prisma, b, '/api/quotes', quotesRoutes);
    const other = (await request(qb).post('/api/quotes').send({ ...quote, quantity: 50 })).body;
    await request(qb).post(`/api/quotes/${other.id}/convert`);

    const r = await request(appAs(prisma, a, '/api/finances', financesRoutes)).get('/api/finances?period=month');
    expect(r.status).toBe(200);
    expect(r.body.period).toBe('month');
    expect(r.body.orders.count).toBe(1);
    expect(r.body.orders.revenue).toBeCloseTo(created.finalPrice, 6);
    expect(r.body.orders.printingCost).toBeCloseTo(created.costAfterContingency, 6);
    expect(r.body.purchases).toEqual({ count: 1, total: 20, gapVsPrintingCost: 20 - created.costAfterContingency });
    expect(r.body.monthly).toHaveLength(1);
    expect(r.body.costBreakdown.find((c: { key: string }) => c.key === 'filament').amount).toBeCloseTo(created.filamentCost, 6);
    expect((await request(appAs(prisma, a, '/api/finances', financesRoutes)).get('/api/finances')).body.period).toBe('all');
    expect((await request(appAs(prisma, a, '/api/finances', financesRoutes)).get('/api/finances?period=week')).status).toBe(400);
    const empty = await request(appAs(prisma, await createTestUser(prisma, 'c'), '/api/finances', financesRoutes)).get('/api/finances');
    expect(empty.body.orders).toEqual({ count: 0, revenue: 0, printingCost: 0, netMargin: 0, netMarginPct: 0 });
  });
});
