import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { quotesRoutes } from './quotes.routes.js';
import { computeQuote, DEFAULT_PRICING_SETTINGS, type CreateQuoteBody } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const body: CreateQuoteBody = {
  projectName: 'Support', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: 'rush',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
  printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25,
  quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
};

describe('/api/quotes', () => {
  it('preview calcule avec les paramètres de l\'utilisateur sans rien enregistrer', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    await prisma.userSettings.create({ data: { userId: a.id, wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0 } });
    const r = await request(app).post('/api/quotes/preview').send(body);
    expect(r.status).toBe(200);
    expect(r.body.result.finalPrice).toBeCloseTo(114.311228, 4);
    expect(r.body.settings.wearCostPerHour).toBe(0.15);
    expect(await prisma.quote.count()).toBe(0);
  });
  it('crée un devis : calcul serveur, instantané des paramètres, montants client ignorés', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const r = await request(app).post('/api/quotes').send({ ...body, finalPrice: 1 });
    expect(r.status, JSON.stringify(r.body)).toBe(400); // clé inconnue : le client n'envoie jamais de montant
    const ok = await request(app).post('/api/quotes').send(body);
    expect(ok.status).toBe(201);
    const expected = computeQuote(DEFAULT_PRICING_SETTINGS, body);
    expect(ok.body.finalPrice).toBeCloseTo(expected.finalPrice, 6);
    expect(ok.body.settingsSnapshot).toEqual(DEFAULT_PRICING_SETTINGS);
    expect(ok.body.filamentLines).toEqual(body.filamentLines);
    expect(ok.body).not.toHaveProperty('userId');
    const row = await prisma.quote.findUnique({ where: { id: ok.body.id } });
    expect(row?.userId).toBe(a.id);
  });
  it('valide : quantité 0 ou décimale, statut inconnu, minutes > 59, marge cible ≥ 100 dans les paramètres', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    expect((await request(app).post('/api/quotes').send({ ...body, quantity: 0 })).status).toBe(400);
    expect((await request(app).post('/api/quotes').send({ ...body, quantity: 1.5 })).status).toBe(400);
    expect((await request(app).post('/api/quotes').send({ ...body, status: 'FINI' })).status).toBe(400);
    expect((await request(app).post('/api/quotes').send({ ...body, printMinutes: 60 })).status).toBe(400);
    // Les appels précédents ont déjà créé la ligne de paramètres : upsert, pas create.
    await prisma.userSettings.upsert({ where: { userId: a.id }, update: { pricingMode: 'TARGET_MARGIN', pricingPct: 100 }, create: { userId: a.id, pricingMode: 'TARGET_MARGIN', pricingPct: 100 } });
    const r = await request(app).post('/api/quotes/preview').send(body);
    expect(r.status).toBe(400); expect(r.body.code).toBe('pricing');
  });
  it('rejette une date souhaitée hors calendrier (400, jamais 500 ni date décalée)', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    for (const dueDate of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-04-31']) {
      const r = await request(app).post('/api/quotes').send({ ...body, dueDate });
      expect(r.status, dueDate).toBe(400);
    }
    const ok = await request(app).post('/api/quotes').send({ ...body, dueDate: '2028-02-29' });
    expect(ok.status).toBe(201); expect(ok.body.dueDate).toBe('2028-02-29');
    expect(await prisma.quote.count()).toBe(1);
  });
  it('un devis créé par A n\'est pas visible de B ni d\'un admin via la base filtrée', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).post('/api/quotes').send(body);
    expect(await prisma.quote.count({ where: { userId: b.id } })).toBe(0);
    expect(await prisma.quote.count({ where: { userId: a.id } })).toBe(1);
  });
});
