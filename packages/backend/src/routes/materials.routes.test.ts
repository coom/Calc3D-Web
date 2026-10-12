import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { materialsRoutes } from './materials.routes.js';
import { DEFAULT_MATERIALS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

describe('/api/materials', () => {
  it('liste le catalogue par défaut, ajoute, modifie, supprime', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/materials', materialsRoutes);
    const list = (await request(app).get('/api/materials')).body;
    expect(list).toHaveLength(DEFAULT_MATERIALS.length);
    expect(list[0]).toMatchObject({ name: 'PLA', pricePerKg: 18, sortOrder: 0 });
    const created = await request(app).post('/api/materials').send({ name: '  PLA Silk ', pricePerKg: 24 });
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ name: 'PLA Silk', pricePerKg: 24, sortOrder: DEFAULT_MATERIALS.length });
    expect((await request(app).put(`/api/materials/${created.body.id}`).send({ name: 'PLA Silk', pricePerKg: 26 })).body.pricePerKg).toBe(26);
    expect((await request(app).delete(`/api/materials/${created.body.id}`)).status).toBe(204);
    expect((await request(app).get('/api/materials')).body).toHaveLength(DEFAULT_MATERIALS.length);
  });
  it('refuse un doublon à la casse ou aux espaces près (409, code duplicate)', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/materials', materialsRoutes);
    await request(app).get('/api/materials');
    const r1 = await request(app).post('/api/materials').send({ name: 'pla', pricePerKg: 1 });
    expect(r1.status).toBe(409); expect(r1.body.code).toBe('duplicate');
    const r2 = await request(app).post('/api/materials').send({ name: ' PETG ', pricePerKg: 1 });
    expect(r2.status).toBe(409);
  });
  it('cloisonne : la matière de A est introuvable (404) pour B et pour un admin, en lecture comme en écriture', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b'); const admin = await createTestUser(prisma, 'root', 'admin');
    const appA = appAs(prisma, a, '/api/materials', materialsRoutes);
    const id = (await request(appA).post('/api/materials').send({ name: 'Secret', pricePerKg: 99 })).body.id;
    for (const other of [b, admin]) {
      const app = appAs(prisma, other, '/api/materials', materialsRoutes);
      expect((await request(app).get('/api/materials')).body.map((m: { name: string }) => m.name)).not.toContain('Secret');
      expect((await request(app).put(`/api/materials/${id}`).send({ name: 'Hack', pricePerKg: 1 })).status).toBe(404);
      expect((await request(app).delete(`/api/materials/${id}`)).status).toBe(404);
    }
    expect((await prisma.material.findUnique({ where: { id } }))?.name).toBe('Secret');
  });
  it('la suppression du compte emporte ses matières et paramètres, pas ceux des autres', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    await request(appAs(prisma, a, '/api/materials', materialsRoutes)).get('/api/materials');
    await request(appAs(prisma, b, '/api/materials', materialsRoutes)).get('/api/materials');
    await prisma.user.delete({ where: { id: a.id } });
    expect(await prisma.material.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.userSettings.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.material.count({ where: { userId: b.id } })).toBe(DEFAULT_MATERIALS.length);
  });
  it('valide le corps (nom vide, prix négatif, id non numérique)', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/materials', materialsRoutes);
    expect((await request(app).post('/api/materials').send({ name: '  ', pricePerKg: 1 })).status).toBe(400);
    expect((await request(app).post('/api/materials').send({ name: 'X', pricePerKg: -1 })).status).toBe(400);
    expect((await request(app).put('/api/materials/abc').send({ name: 'X', pricePerKg: 1 })).status).toBe(400);
  });
});
