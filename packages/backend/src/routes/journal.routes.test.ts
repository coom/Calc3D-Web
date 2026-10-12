import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { journalRoutes } from './journal.routes.js';
import { errorHandler } from '../middleware/error-handler.js';
import { purgeWebLogins, saveRetentionDays } from '../journal/retention.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
const T0 = Date.now();
const at = (h: number) => new Date(T0 - h * 3_600_000);

function appWith(role: 'admin' | 'user') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { typ: 'access', id: 1, username: 'u', role }; next(); });
  app.locals.prisma = prisma;
  app.use('/api/journal', journalRoutes);
  app.use(errorHandler);
  return { app };
}

beforeAll(async () => {
  await prisma.webLogin.createMany({ data: [
    { username: 'admin', userId: 1, ip: '1.2.3.4', country: 'FR', success: true, createdAt: at(6) },
    { username: 'nobody', ip: '1.2.3.4', success: false, reason: 'unknown_user', createdAt: at(1) },
    { username: 'ancien', ip: '1.2.3.4', success: true, createdAt: at(24 * 400) },
  ] });
});

describe('journal routes', () => {
  it('un utilisateur simple est refusé', async () => {
    const { app } = appWith('user');
    for (const url of ['/api/journal/web', '/api/journal/retention']) expect((await request(app).get(url)).status, url).toBe(403);
    expect((await request(app).put('/api/journal/retention').send({ days: 10 })).status).toBe(403);
  });
  it('journal web : plus récent en premier, filtres nom et période, pagination, validation', async () => {
    const w = await request(appWith('admin').app).get('/api/journal/web');
    expect(w.status).toBe(200);
    expect(w.body.total).toBe(3);
    expect(w.body.items[0]).toMatchObject({ username: 'nobody', success: false, reason: 'unknown_user' });
    expect(w.body.items[1]).toMatchObject({ username: 'admin', userId: 1, country: 'FR' });
    expect(typeof w.body.items[0].createdAt).toBe('string');
    expect((await request(appWith('admin').app).get('/api/journal/web?q=ADM')).body.items.map((i: { username: string }) => i.username)).toEqual(['admin']);
    const byPeriod = await request(appWith('admin').app).get(`/api/journal/web?from=${at(3).toISOString()}&to=${at(0).toISOString()}`);
    expect(byPeriod.body.items.map((i: { username: string }) => i.username)).toEqual(['nobody']);
    expect((await request(appWith('admin').app).get('/api/journal/web?limit=1&page=2')).body.items.map((i: { username: string }) => i.username)).toEqual(['admin']);
    expect((await request(appWith('admin').app).get('/api/journal/web?from=yesterday')).status).toBe(400);
    expect((await request(appWith('admin').app).get('/api/journal/web?limit=500')).status).toBe(400);
  });
  it('rétention : lecture, écriture, audit et validation', async () => {
    const { app } = appWith('admin');
    expect((await request(app).get('/api/journal/retention')).body).toEqual({ days: 90 });
    expect((await request(app).put('/api/journal/retention').send({ days: 30 })).body).toEqual({ days: 30 });
    expect((await request(app).get('/api/journal/retention')).body).toEqual({ days: 30 });
    expect(await prisma.auditLog.findMany()).toMatchObject([{ action: 'journal.retention', detail: '30' }]);
    for (const days of [-1, 4000, 1.5, 'x', undefined]) expect((await request(app).put('/api/journal/retention').send({ days })).status, String(days)).toBe(400);
  });
  it('purgeWebLogins supprime les lignes plus anciennes que la rétention, rien si 0', async () => {
    await saveRetentionDays(prisma, 0);
    expect(await purgeWebLogins(prisma)).toBe(0);
    await saveRetentionDays(prisma, 90);
    expect(await purgeWebLogins(prisma)).toBe(1);
    expect(await prisma.webLogin.count()).toBe(2);
  });
});
