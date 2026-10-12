import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { importRoutes } from './import.routes.js';
import { errorHandler } from '../middleware/error-handler.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

/** Sans express.json() global : la route porte sa propre limite, comme dans app.ts. */
function appAs(user: { id: number; username: string; role: string }) {
  const app = express();
  app.use((req, _res, next) => { req.user = { typ: 'access', id: user.id, username: user.username, role: user.role as 'admin' | 'user' }; next(); });
  app.locals.prisma = prisma;
  app.use('/api/import', importRoutes);
  app.use(errorHandler);
  return app;
}
const achats = ['"Id","Date","Categorie","Description","Montant","Fournisseur","Commentaire"', '"a1","2026-09-05","Outillage","Pince","9,9","",""', ''].join('\n');

describe('POST /api/import/desktop', () => {
  it('importe dans le compte courant et renvoie le rapport ; corps vide ou fuseau inconnu → 400', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const r = await request(appAs(a)).post('/api/import/desktop?tz=Europe/Paris').send({ achats });
    expect(r.status).toBe(200); expect(r.body.purchases).toEqual({ created: 1, updated: 0, rejected: [] });
    expect(await prisma.purchase.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma.purchase.count({ where: { userId: b.id } })).toBe(0);
    expect((await request(appAs(a)).post('/api/import/desktop').send({})).status).toBe(400);
    expect((await request(appAs(a)).post('/api/import/desktop?tz=Mars/Olympus').send({ achats })).status).toBe(400);
    expect((await request(appAs(a)).post('/api/import/desktop').send({ achats: 42 })).status).toBe(400);
  });
  it('accepte un corps de plusieurs Mo (limite propre à la route)', async () => {
    const a = await createTestUser(prisma, 'a');
    const big = achats + Array.from({ length: 40_000 }, (_, i) => `"b${i}","2026-09-05","Outillage","Ligne ${i} ${'x'.repeat(60)}","1","",""`).join('\n') + '\n';
    expect(big.length).toBeGreaterThan(3_000_000);
    const r = await request(appAs(a)).post('/api/import/desktop').send({ achats: big });
    expect(r.status).toBe(200); expect(r.body.purchases.created).toBe(40_001);
  }, 120_000);
});
