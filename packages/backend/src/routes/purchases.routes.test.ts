import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { purchasesRoutes } from './purchases.routes.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const body = { date: '2026-10-05', category: 'FILAMENT', description: 'Bobine PLA 1 kg', amount: 18.9, supplier: 'Shop', comment: '' };

describe('/api/purchases', () => {
  it('crée, liste (plus récent en premier), filtre q littéral et catégorie, pagine ; cloisonné', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const appA = appAs(prisma, a, '/api/purchases', purchasesRoutes); const appB = appAs(prisma, b, '/api/purchases', purchasesRoutes);
    const c1 = await request(appA).post('/api/purchases').send(body);
    expect(c1.status).toBe(201); expect(c1.body).toMatchObject({ date: '2026-10-05', category: 'FILAMENT', amount: 18.9 });
    await request(appA).post('/api/purchases').send({ ...body, date: '2026-10-07', category: 'TOOLS', description: 'Buse 0.4 100%', supplier: 'Amazon' });
    await request(appA).post('/api/purchases').send({ ...body, date: '2026-09-01', description: 'Vieux' });
    await request(appB).post('/api/purchases').send({ ...body, description: 'Secret' });
    const all = await request(appA).get('/api/purchases');
    expect(all.body.total).toBe(3);
    expect(all.body.items.map((x: { description: string }) => x.description)).toEqual(['Buse 0.4 100%', 'Bobine PLA 1 kg', 'Vieux']);
    expect(JSON.stringify(all.body)).not.toContain('Secret');
    expect((await request(appA).get('/api/purchases?q=amazon')).body.total).toBe(1);
    expect((await request(appA).get('/api/purchases?q=100%25')).body.total).toBe(1);
    expect((await request(appA).get('/api/purchases?q=[')).status).toBe(200);
    expect((await request(appA).get('/api/purchases?category=TOOLS')).body.total).toBe(1);
    expect((await request(appA).get('/api/purchases?category=NOPE')).status).toBe(400);
    expect((await request(appA).get('/api/purchases?limit=2&page=2')).body.items).toHaveLength(1);
  });
  it('modifie et supprime : propriétaire OK, autrui et admin 404, ligne intacte', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const app = appAs(prisma, a, '/api/purchases', purchasesRoutes);
    const id = (await request(app).post('/api/purchases').send(body)).body.id;
    for (const other of [b, admin]) {
      const o = appAs(prisma, other, '/api/purchases', purchasesRoutes);
      expect((await request(o).put(`/api/purchases/${id}`).send({ ...body, amount: 1 })).status).toBe(404);
      expect((await request(o).delete(`/api/purchases/${id}`)).status).toBe(404);
    }
    expect((await prisma.purchase.findUnique({ where: { id } }))?.amount).toBe(18.9);
    expect((await request(app).put(`/api/purchases/${id}`).send({ ...body, amount: 20 })).body.amount).toBe(20);
    expect((await request(app).delete(`/api/purchases/${id}`)).status).toBe(204);
    expect(await prisma.purchase.count({ where: { id } })).toBe(0);
  });
  it('valide : montant ≤ 0, description vide, date hors calendrier, clé inconnue, id non numérique', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/purchases', purchasesRoutes);
    expect((await request(app).post('/api/purchases').send({ ...body, amount: 0 })).status).toBe(400);
    expect((await request(app).post('/api/purchases').send({ ...body, description: '  ' })).status).toBe(400);
    expect((await request(app).post('/api/purchases').send({ ...body, date: '2026-02-30' })).status).toBe(400);
    expect((await request(app).post('/api/purchases').send({ ...body, userId: 9 })).status).toBe(400);
    expect((await request(app).put('/api/purchases/x').send(body)).status).toBe(400);
    expect(await prisma.purchase.count()).toBe(0);
  });
});
