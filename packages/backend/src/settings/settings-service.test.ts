import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { getOrCreateSettings, toPricingSettings } from './settings-service.js';
import { DEFAULT_PRICING_SETTINGS, DEFAULT_MATERIALS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); });

describe('settings-service', () => {
  it('crée les paramètres par défaut et le catalogue au premier accès, une seule fois', async () => {
    const u = await createTestUser(prisma, 'alice');
    const first = await getOrCreateSettings(prisma, u.id);
    expect(first).toMatchObject({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true });
    const materials = await prisma.material.findMany({ where: { userId: u.id }, orderBy: { sortOrder: 'asc' } });
    expect(materials.map((m) => [m.name, m.pricePerKg])).toEqual(DEFAULT_MATERIALS.map((m) => [m.name, m.pricePerKg]));
    await getOrCreateSettings(prisma, u.id);
    expect(await prisma.material.count({ where: { userId: u.id } })).toBe(DEFAULT_MATERIALS.length);
  });
  it('toPricingSettings ne garde que les champs du moteur', async () => {
    const u = await createTestUser(prisma, 'bob');
    const row = await prisma.userSettings.create({ data: { userId: u.id } });
    const p = toPricingSettings(row);
    expect(Object.keys(p).sort()).toEqual(Object.keys(DEFAULT_PRICING_SETTINGS).sort());
    expect(p.pricingMode).toBe('MARKUP');
  });
});
