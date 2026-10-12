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
  it('liste paginée, plus récent en premier, filtres q (littéral), kind, status ; cloisonnée', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const appA = appAs(prisma, a, '/api/quotes', quotesRoutes); const appB = appAs(prisma, b, '/api/quotes', quotesRoutes);
    await request(appA).post('/api/quotes').send({ ...body, projectName: 'Alpha 100%', customer: 'ACME' });
    await request(appA).post('/api/quotes').send({ ...body, projectName: 'Beta_2', customer: 'Zed', status: 'DONE' });
    const c = await request(appA).post('/api/quotes').send({ ...body, projectName: 'Gamma', customer: 'ACME' });
    await request(appA).post(`/api/quotes/${c.body.id}/convert`);
    await request(appB).post('/api/quotes').send({ ...body, projectName: 'Secret' });

    const all = await request(appA).get('/api/quotes');
    expect(all.status).toBe(200); expect(all.body.total).toBe(3);
    expect(all.body.items.map((x: { projectName: string }) => x.projectName)).toEqual(['Gamma', 'Beta_2', 'Alpha 100%']);
    expect(JSON.stringify(all.body)).not.toContain('Secret');
    expect((await request(appA).get('/api/quotes?q=acme')).body.total).toBe(2);
    expect((await request(appA).get('/api/quotes?q=100%25')).body.items.map((x: { projectName: string }) => x.projectName)).toEqual(['Alpha 100%']);
    expect((await request(appA).get('/api/quotes?q=a_2')).body.total).toBe(1);
    expect((await request(appA).get('/api/quotes?q=[')).status).toBe(200);
    expect((await request(appA).get('/api/quotes?kind=ORDER')).body.items.map((x: { projectName: string }) => x.projectName)).toEqual(['Gamma']);
    expect((await request(appA).get('/api/quotes?status=DONE')).body.total).toBe(1);
    expect((await request(appA).get('/api/quotes?status=FINI')).status).toBe(400);
    const p2 = await request(appA).get('/api/quotes?limit=2&page=2');
    expect(p2.body.items).toHaveLength(1); expect(p2.body.page).toBe(2);
    expect((await request(appA).get('/api/quotes?limit=500')).status).toBe(400);
  });
  it('lecture : propriétaire 200, autre utilisateur et admin 404, id invalide 400', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const id = (await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).post('/api/quotes').send(body)).body.id;
    expect((await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).get(`/api/quotes/${id}`)).body.projectName).toBe('Support');
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).get(`/api/quotes/${id}`)).status).toBe(404);
    expect((await request(appAs(prisma, admin, '/api/quotes', quotesRoutes)).get(`/api/quotes/${id}`)).status).toBe(404);
    expect((await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).get('/api/quotes/abc')).status).toBe(400);
  });
  it('mise à jour : recalcul avec l\'instantané d\'origine malgré de nouveaux tarifs, sauf useCurrentSettings=1', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const created = (await request(app).post('/api/quotes').send(body)).body;
    // Les tarifs changent après l'enregistrement
    await prisma.userSettings.update({ where: { userId: a.id }, data: { hourlyRatePreparation: 100 } });
    const same = await request(app).put(`/api/quotes/${created.id}`).send({ ...body, customer: 'ACME 2' });
    expect(same.status).toBe(200);
    expect(same.body.customer).toBe('ACME 2');
    expect(same.body.finalPrice).toBeCloseTo(created.finalPrice, 6);
    expect(same.body.settingsSnapshot.hourlyRatePreparation).toBe(DEFAULT_PRICING_SETTINGS.hourlyRatePreparation);
    const fresh = await request(app).put(`/api/quotes/${created.id}?useCurrentSettings=1`).send(body);
    expect(fresh.body.finalPrice).toBeGreaterThan(created.finalPrice);
    expect(fresh.body.settingsSnapshot.hourlyRatePreparation).toBe(100);
    expect(await prisma.quote.count({ where: { userId: a.id } })).toBe(1);
    expect((await request(app).put(`/api/quotes/${created.id}`).send({ ...body, finalPrice: 1 })).status).toBe(400);
    const b = await createTestUser(prisma, 'b');
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).put(`/api/quotes/${created.id}`).send(body)).status).toBe(404);
  });
  it('conversion en commande : une fois 200, deux fois 409 already_order, autrui 404', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const id = (await request(app).post('/api/quotes').send(body)).body.id;
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).post(`/api/quotes/${id}/convert`)).status).toBe(404);
    const r1 = await request(app).post(`/api/quotes/${id}/convert`);
    expect(r1.status).toBe(200); expect(r1.body.kind).toBe('ORDER');
    const r2 = await request(app).post(`/api/quotes/${id}/convert`);
    expect(r2.status).toBe(409); expect(r2.body.code).toBe('already_order');
    expect((await prisma.quote.findUnique({ where: { id } }))?.kind).toBe('ORDER');
  });
  it('suppression : autrui 404 et ligne intacte, propriétaire 204 et ligne disparue', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const app = appAs(prisma, a, '/api/quotes', quotesRoutes);
    const id = (await request(app).post('/api/quotes').send(body)).body.id;
    expect((await request(appAs(prisma, b, '/api/quotes', quotesRoutes)).delete(`/api/quotes/${id}`)).status).toBe(404);
    expect((await request(appAs(prisma, admin, '/api/quotes', quotesRoutes)).delete(`/api/quotes/${id}`)).status).toBe(404);
    expect(await prisma.quote.count({ where: { id } })).toBe(1);
    expect((await request(app).delete(`/api/quotes/${id}`)).status).toBe(204);
    expect(await prisma.quote.count({ where: { id } })).toBe(0);
    expect((await request(app).delete(`/api/quotes/${id}`)).status).toBe(404);
  });
  it('un devis créé par A n\'est pas visible de B ni d\'un admin via la base filtrée', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    await request(appAs(prisma, a, '/api/quotes', quotesRoutes)).post('/api/quotes').send(body);
    expect(await prisma.quote.count({ where: { userId: b.id } })).toBe(0);
    expect(await prisma.quote.count({ where: { userId: a.id } })).toBe(1);
  });
});
