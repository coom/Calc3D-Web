import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { proxyRoutes } from './proxy.routes.js';
import { applyTrustHops, loadTrustHops, TRUST_HOPS_KEY } from '../proxy/trust-proxy.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.appSetting.deleteMany(); await prisma.auditLog.deleteMany(); });

function app(user: { id: number; username: string; role: string }) { const a = appAs(prisma, user, '/api/proxy', proxyRoutes); a.set('trust proxy', 1); return a; }
// Chaîne vue par le backend derrière nginx (1 saut) lui-même derrière un WAF (2 sauts) : client réel, puis WAF.
const XFF = '203.0.113.5, 10.0.0.2';

describe('réglage de la profondeur de proxy (IP client)', () => {
  it("admin : défaut 1 et IP détectée = dernier saut ; PUT enregistre, applique à chaud et audite ; l'IP détectée devient celle du client réel", async () => {
    const adm = await createTestUser(prisma, 'root', 'admin'); const a = app(adm);
    const r1 = await request(a).get('/api/proxy').set('X-Forwarded-For', XFF);
    expect(r1.status).toBe(200); expect(r1.body).toEqual({ trustHops: 1, detectedIp: '10.0.0.2' });
    const w = await request(a).put('/api/proxy').send({ trustHops: 2 });
    expect(w.status).toBe(200); expect(w.body).toEqual({ trustHops: 2 });
    expect((await request(a).get('/api/proxy').set('X-Forwarded-For', XFF)).body).toEqual({ trustHops: 2, detectedIp: '203.0.113.5' });
    expect(await loadTrustHops(prisma)).toBe(2);
    expect((await prisma.auditLog.findMany()).map((x) => [x.action, x.detail])).toEqual([['proxy.update', '2']]);
    for (const bad of [17, -1, 'x', 1.5]) expect((await request(a).put('/api/proxy').send({ trustHops: bad })).status, String(bad)).toBe(400);
    expect((await request(a).put('/api/proxy').send({ trustHops: 0 })).body).toEqual({ trustHops: 0 });
  });
  it('utilisateur : 403 en lecture comme en écriture, rien d’enregistré', async () => {
    const u = await createTestUser(prisma, 'bob'); const a = app(u);
    expect((await request(a).get('/api/proxy')).status).toBe(403);
    expect((await request(a).put('/api/proxy').send({ trustHops: 3 })).status).toBe(403);
    expect(await prisma.appSetting.count()).toBe(0);
  });
  it('loadTrustHops : valeur absente ou corrompue → 1 ; applyTrustHops pose le réglage Express', async () => {
    expect(await loadTrustHops(prisma)).toBe(1);
    await prisma.appSetting.create({ data: { key: TRUST_HOPS_KEY, value: 'abc' } });
    expect(await loadTrustHops(prisma)).toBe(1);
    await prisma.appSetting.update({ where: { key: TRUST_HOPS_KEY }, data: { value: '3' } });
    expect(await loadTrustHops(prisma)).toBe(3);
    const e = express(); applyTrustHops(e, 3); expect(e.get('trust proxy')).toBe(3);
  });
});
