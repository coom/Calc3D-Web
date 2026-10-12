import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { accountRoutes } from './account.routes.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

describe('PUT /api/account/email', () => {
  it('enregistre une adresse valide (normalisée) ou vide, refuse une adresse invalide', async () => {
    const u = await createTestUser(prisma, 'alice');
    const a = appAs(prisma, u, '/api/account', accountRoutes);
    expect((await request(a).put('/api/account/email').send({ email: 'pas-un-mail' })).status).toBe(400);
    const ok = await request(a).put('/api/account/email').send({ email: ' Alice@Example.com ' });
    expect(ok.status).toBe(200); expect(ok.body).toEqual({ email: 'alice@example.com' });
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.email).toBe('alice@example.com');
    expect((await request(a).put('/api/account/email').send({ email: '' })).status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.email).toBe('');
    expect((await request(a).put('/api/account/email').send({ email: 'a@b.fr', extra: 1 })).status).toBe(400);
  });
});
