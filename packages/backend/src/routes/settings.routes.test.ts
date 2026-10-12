import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { settingsRoutes } from './settings.routes.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

const body = { ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true, wearCostPerHour: 0.15, roundToEuro: true };

describe('GET/PUT /api/settings', () => {
  it('renvoie les défauts puis la valeur enregistrée, par utilisateur', async () => {
    const a = await createTestUser(prisma, 'a'); const b = await createTestUser(prisma, 'b');
    const appA = appAs(prisma, a, '/api/settings', settingsRoutes); const appB = appAs(prisma, b, '/api/settings', settingsRoutes);
    expect((await request(appA).get('/api/settings')).body).toMatchObject({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true });
    expect((await request(appA).put('/api/settings').send(body)).status).toBe(200);
    expect((await request(appA).get('/api/settings')).body).toMatchObject({ wearCostPerHour: 0.15, roundToEuro: true });
    // B n'est pas affecté
    expect((await request(appB).get('/api/settings')).body).toMatchObject({ wearCostPerHour: 0, roundToEuro: false });
  });
  it('un admin ne voit que ses propres paramètres', async () => {
    const a = await createTestUser(prisma, 'a'); const admin = await createTestUser(prisma, 'root', 'admin');
    await request(appAs(prisma, a, '/api/settings', settingsRoutes)).put('/api/settings').send(body);
    expect((await request(appAs(prisma, admin, '/api/settings', settingsRoutes)).get('/api/settings')).body.roundToEuro).toBe(false);
  });
  it('rejette un corps incomplet, une clé inconnue, une marge cible ≥ 100 et un pourcentage négatif', async () => {
    const a = await createTestUser(prisma, 'a'); const app = appAs(prisma, a, '/api/settings', settingsRoutes);
    const { pdfShowCostBreakdown: _omit, ...partial } = body;
    expect((await request(app).put('/api/settings').send(partial)).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ ...body, userId: 999 })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ ...body, pricingMode: 'TARGET_MARGIN', pricingPct: 100 })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ ...body, contingencyPct: -1 })).status).toBe(400);
    expect((await request(app).get('/api/settings')).body.roundToEuro).toBe(false);
  });
});
