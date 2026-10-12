import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { publicRoutes } from './public.routes.js';
import { errorHandler } from '../middleware/error-handler.js';
import { hashShareToken } from '../quotes/share-service.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.userSettings.deleteMany(); });

function app() { const a = express(); a.locals.prisma = prisma; a.use('/api/public', publicRoutes); a.use(errorHandler); return a; }
const TOKEN = 'a'.repeat(43);
async function seedShared(userId: number, extra: Record<string, unknown> = {}) {
  const amounts = { filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05, unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26 };
  return prisma.quote.create({ data: { userId, projectName: 'Boîtier <b>', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', quantity: 2, comment: 'Fragile', filamentLines: JSON.stringify([{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }]), printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 2, packagingHours: 0.25, consumables: 1.5, discountPct: 10, shippingCost: 6.5, settingsSnapshot: JSON.stringify({ ...DEFAULT_PRICING_SETTINGS, pricingMode: 'TARGET_MARGIN', pricingPct: 30, vatPct: 20 }), shareTokenHash: hashShareToken(TOKEN), sharedAt: new Date(), ...amounts, ...extra } });
}

describe('API publique du devis', () => {
  it('lecture par jeton : DTO client sans donnée interne ; jeton inconnu ou révoqué → 404', async () => {
    const u = await createTestUser(prisma, 'alice');
    await prisma.userSettings.create({ data: { userId: u.id, pdfShowCostBreakdown: false, currencySymbol: '$' } });
    const q = await seedShared(u.id);
    const r = await request(app()).get(`/api/public/quotes/${TOKEN}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ projectName: 'Boîtier <b>', finalPrice: 289, currencySymbol: '$', ownerDisplayName: 'alice', costLines: null, vatPct: 20, clientResponse: null });
    for (const k of ['settingsSnapshot', 'pricingMode', 'pricingPct', 'userId', 'legacyId', 'id', 'clientEmail']) expect(r.body).not.toHaveProperty(k);
    expect(JSON.stringify(r.body)).not.toMatch(/TARGET_MARGIN/);
    expect((await request(app()).get(`/api/public/quotes/${'b'.repeat(43)}`)).status).toBe(404);
    expect((await request(app()).get('/api/public/quotes/x')).status).toBe(404);
    await prisma.quote.update({ where: { id: q.id }, data: { shareTokenHash: null } });
    expect((await request(app()).get(`/api/public/quotes/${TOKEN}`)).status).toBe(404);
  });
  it('réponse : enregistrée une seule fois (409 ensuite), commentaire tronqué à 2000 et stocké brut, non-lu pour le propriétaire', async () => {
    const u = await createTestUser(prisma, 'alice');
    const q = await seedShared(u.id, { responseSeenAt: new Date() });
    const bad = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'MAYBE' });
    expect(bad.status).toBe(400);
    const comment = '<script>x</script>' + 'y'.repeat(3000);
    const r = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED', comment });
    expect(r.status).toBe(200); expect(r.body.clientResponse).toBe('ACCEPTED'); expect(r.body.clientRespondedAt).not.toBeNull();
    const row = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row?.clientComment.length).toBe(2000); expect(row?.clientComment.startsWith('<script>')).toBe(true); expect(row?.responseSeenAt).toBeNull();
    const again = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'REFUSED' });
    expect(again.status).toBe(409); expect(again.body.code).toBe('already_answered');
    expect((await prisma.quote.findUnique({ where: { id: q.id } }))?.clientResponse).toBe('ACCEPTED');
  });
  it('devis converti en commande : toujours consultable, kind ORDER ; devis supprimé : 404', async () => {
    const u = await createTestUser(prisma, 'alice');
    const q = await seedShared(u.id, { kind: 'ORDER' });
    expect((await request(app()).get(`/api/public/quotes/${TOKEN}`)).body.kind).toBe('ORDER');
    await prisma.quote.delete({ where: { id: q.id } });
    expect((await request(app()).get(`/api/public/quotes/${TOKEN}`)).status).toBe(404);
  });
  it('corps de plus de 16 ko refusé (413)', async () => {
    const u = await createTestUser(prisma, 'alice'); await seedShared(u.id);
    const r = await request(app()).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED', comment: 'z'.repeat(20_000) });
    expect(r.status).toBe(413);
  });
  it('la réponse est enregistrée même si la notification échoue ; la notification reçoit le devis', async () => {
    const u = await createTestUser(prisma, 'alice'); await seedShared(u.id);
    const a = app(); const calls: number[] = [];
    a.locals.notifyOwnerOfResponse = async (_p: unknown, q: { id: number }) => { calls.push(q.id); throw new Error('smtp down'); };
    const r = await request(a).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED' });
    expect(r.status).toBe(200); expect(calls).toHaveLength(1);
  });
  it('deux réponses simultanées : exactement un 200 et un 409, la première réponse reste (I1)', async () => {
    const u = await createTestUser(prisma, 'alice'); await seedShared(u.id);
    const a = app();
    const [r1, r2] = await Promise.all([
      request(a).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'ACCEPTED' }),
      request(a).post(`/api/public/quotes/${TOKEN}/respond`).send({ decision: 'REFUSED' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const winner = r1.status === 200 ? r1.body.clientResponse : r2.body.clientResponse;
    expect((await request(a).get(`/api/public/quotes/${TOKEN}`)).body.clientResponse).toBe(winner);
  });
});
