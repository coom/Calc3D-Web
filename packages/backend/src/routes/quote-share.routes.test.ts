import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser } from '../test-users.js';
import { errorHandler } from '../middleware/error-handler.js';
import { quoteShareRoutes } from './quote-share.routes.js';
import { quotesRoutes } from './quotes.routes.js';
import { hashShareToken } from '../quotes/share-service.js';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.smtpSettings.deleteMany(); });

export async function seedQuote(userId: number, extra: Record<string, unknown> = {}) {
  const zeros = { filamentWeightG: 0, filamentCost: 0, printTimeH: 0, energyKwh: 0, electricityCost: 0, laborPrep: 0, laborPost: 0, laborDesign: 0, laborPackaging: 0, depreciation: 0, maintenance: 0, wear: 0, fixedCosts: 0, subtotal: 0, contingency: 0, costAfterContingency: 0, unitPriceExclTax: 0, totalExclTax: 0, discountAmount: 0, vatAmount: 0, priceBeforeFloor: 0, floorApplied: false, priceBeforeRounding: 0, roundingAmount: 0, roundingApplied: false, finalPrice: 0, pricePerGram: 0, pricePerHour: 0 };
  return prisma.quote.create({ data: { userId, projectName: 'P', customer: 'C', kind: 'QUOTE', status: 'PENDING', quantity: 1, comment: '', filamentLines: '[]', printHours: 0, printMinutes: 0, prepHours: 0, postHours: 0, designHours: 0, packagingHours: 0, consumables: 0, discountPct: 0, shippingCost: 0, settingsSnapshot: JSON.stringify(DEFAULT_PRICING_SETTINGS), ...zeros, ...extra } });
}
/** Les deux routeurs montés comme dans app.ts : partage avant devis (sinon /unseen-count tombe sur /:id), errorHandler en dernier. */
function app(user: { id: number; username: string; role: string }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = { typ: 'access', id: user.id, username: user.username, role: user.role as 'admin' | 'user' }; next(); });
  a.locals.prisma = prisma;
  a.use('/api/quotes', quoteShareRoutes);
  a.use('/api/quotes', quotesRoutes);
  a.use(errorHandler);
  return a;
}

describe('routes de partage (propriétaire)', () => {
  it("génère un lien, le régénérer invalide l'ancien et efface la réponse, révoquer retire le lien", async () => {
    const u = await createTestUser(prisma, 'alice');
    const q = await seedQuote(u.id);
    const r1 = await request(app(u)).post(`/api/quotes/${q.id}/share`);
    expect(r1.status).toBe(200); expect(r1.body.url).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);
    const token1 = r1.body.url.split('/q/')[1];
    const row1 = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row1?.shareTokenHash).toBe(hashShareToken(token1)); expect(row1?.sharedAt).not.toBeNull();
    await prisma.quote.update({ where: { id: q.id }, data: { clientResponse: 'REFUSED', clientRespondedAt: new Date(), clientComment: 'non' } });
    const r2 = await request(app(u)).post(`/api/quotes/${q.id}/share`);
    const row2 = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row2?.shareTokenHash).not.toBe(hashShareToken(token1)); expect(row2?.clientResponse).toBeNull(); expect(row2?.clientComment).toBe('');
    expect(r2.body.url).not.toBe(r1.body.url);
    expect((await request(app(u)).delete(`/api/quotes/${q.id}/share`)).status).toBe(204);
    expect((await prisma.quote.findUnique({ where: { id: q.id } }))?.shareTokenHash).toBeNull();
    const dto = (await request(app(u)).get(`/api/quotes/${q.id}`)).body;
    expect(dto.shared).toBe(false); expect(dto).not.toHaveProperty('shareTokenHash');
  });
  it('autre utilisateur et admin : 404 sur share, delete et seen', async () => {
    const u = await createTestUser(prisma, 'alice'); const v = await createTestUser(prisma, 'bob'); const adm = await createTestUser(prisma, 'root', 'admin');
    const q = await seedQuote(u.id);
    for (const other of [v, adm]) {
      expect((await request(app(other)).post(`/api/quotes/${q.id}/share`)).status).toBe(404);
      expect((await request(app(other)).delete(`/api/quotes/${q.id}/share`)).status).toBe(404);
      expect((await request(app(other)).post(`/api/quotes/${q.id}/response/seen`)).status).toBe(404);
    }
  });
  it('compteur de non-lus, marquage vu, filtre response', async () => {
    const u = await createTestUser(prisma, 'alice');
    const a = await seedQuote(u.id, { shareTokenHash: 'h1', sharedAt: new Date(), clientResponse: 'ACCEPTED', clientRespondedAt: new Date() });
    await seedQuote(u.id, { shareTokenHash: 'h2', sharedAt: new Date(), clientResponse: 'REFUSED', clientRespondedAt: new Date(), responseSeenAt: new Date() });
    const p = await seedQuote(u.id, { shareTokenHash: 'h3', sharedAt: new Date() });
    const n = await seedQuote(u.id);
    expect((await request(app(u)).get('/api/quotes/unseen-count')).body).toEqual({ count: 1 });
    const seen = await request(app(u)).post(`/api/quotes/${a.id}/response/seen`);
    expect(seen.status).toBe(200); expect(seen.body.responseSeenAt).not.toBeNull();
    expect((await request(app(u)).get('/api/quotes/unseen-count')).body).toEqual({ count: 0 });
    const ids = async (f: string) => (await request(app(u)).get(`/api/quotes?response=${f}`)).body.items.map((x: { id: number }) => x.id).sort();
    expect(await ids('ACCEPTED')).toEqual([a.id]);
    expect(await ids('PENDING')).toEqual([p.id]);
    expect(await ids('NONE')).toEqual([n.id]);
    expect((await request(app(u)).get('/api/quotes?response=MAYBE')).status).toBe(400);
  });
  it("envoi par e-mail : jeton régénéré à chaque envoi, clientEmail enregistré ; 409 sans SMTP ; 502 si le transport échoue (lien inchangé) ; 409 si déjà répondu", async () => {
    const u = await createTestUser(prisma, 'alice'); await prisma.user.update({ where: { id: u.id }, data: { language: 'fr' } });
    const q = await seedQuote(u.id);
    const a = app(u);
    expect((await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: '' })).status).toBe(409);
    await prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', fromAddress: 'calc@x.fr', enabled: true } });
    const sent: { to: string; subject: string; text: string }[] = [];
    a.locals.mailFactory = () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => { sent.push(m); } });
    const r1 = await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: 'Bonjour' });
    expect(r1.status).toBe(200); expect(r1.body.url).toMatch(/\/q\//);
    expect(sent[0]).toMatchObject({ to: 'c@x.fr', subject: 'Devis P – alice' }); expect(sent[0].text).toContain(r1.body.url); expect(sent[0].text).toContain('Bonjour');
    const hash1 = (await prisma.quote.findUnique({ where: { id: q.id } }))?.shareTokenHash;
    // Second envoi : le jeton n'étant jamais stocké en clair, le lien est régénéré (l'ancien meurt, le dernier e-mail fait foi).
    const r2 = await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'd@x.fr', message: '' });
    expect(r2.status).toBe(200); expect(r2.body.url).not.toBe(r1.body.url);
    const row2 = await prisma.quote.findUnique({ where: { id: q.id } });
    expect(row2?.shareTokenHash).not.toBe(hash1); expect(row2?.clientEmail).toBe('d@x.fr');
    expect((await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'pas-un-mail', message: '' })).status).toBe(400);
    a.locals.mailFactory = () => ({ sendMail: async () => { throw new Error('ECONNREFUSED'); } });
    const r3 = await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: '' });
    expect(r3.status).toBe(502); expect(r3.body.code).toBe('smtp_failed'); expect(r3.body.details).toBe('ECONNREFUSED');
    expect((await prisma.quote.findUnique({ where: { id: q.id } }))?.shareTokenHash).toBe(row2?.shareTokenHash);
    await prisma.quote.update({ where: { id: q.id }, data: { clientResponse: 'ACCEPTED', clientRespondedAt: new Date() } });
    expect((await request(a).post(`/api/quotes/${q.id}/share/email`).send({ to: 'c@x.fr', message: '' })).body.code).toBe('already_answered');
  });
});
