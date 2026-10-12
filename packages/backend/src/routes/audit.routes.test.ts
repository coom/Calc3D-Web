import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { auditRoutes } from './audit.routes.js';
import { errorHandler } from '../middleware/error-handler.js';

const prisma = testPrisma();
afterAll(async () => { await prisma.$disconnect(); });

function app() {
  const a = express();
  a.use((req, _res, next) => { req.user = { typ: 'access', id: 1, username: 'root', role: 'admin' }; next(); });
  a.locals.prisma = prisma;
  a.use('/api/audit', auditRoutes);
  a.use(errorHandler);
  return a;
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.auditLog.createMany({ data: [
    { userId: 1, username: 'root', action: 'user.create', detail: 'alice', ip: '1.2.3.4' },
    { userId: 1, username: 'root', action: 'user.update', detail: '2', ip: '1.2.3.4' },
    { userId: 1, username: 'root', action: 'journal.retention', detail: '30', ip: '1.2.3.4' },
  ] });
});

describe('GET /api/audit', () => {
  it('liste les entrées, plus récentes en premier, avec IP et détail', async () => {
    const res = await request(app()).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.entries.map((e: { action: string }) => e.action)).toEqual(['journal.retention', 'user.update', 'user.create']);
    expect(res.body.entries[0]).toMatchObject({ detail: '30', ip: '1.2.3.4', username: 'root' });
    expect(typeof res.body.entries[0].at).toBe('string');
  });
  it('filtre par préfixe d\'action et par utilisateur, pagine, valide', async () => {
    expect((await request(app()).get('/api/audit?action=user')).body.total).toBe(2);
    expect((await request(app()).get('/api/audit?user=roo')).body.total).toBe(3);
    expect((await request(app()).get('/api/audit?user=nobody')).body.total).toBe(0);
    const p2 = await request(app()).get('/api/audit?page=2&pageSize=2');
    expect(p2.body.entries).toHaveLength(1);
    expect((await request(app()).get('/api/audit?pageSize=500')).status).toBe(400);
    expect((await request(app()).get('/api/audit?page=0')).status).toBe(400);
  });
});
