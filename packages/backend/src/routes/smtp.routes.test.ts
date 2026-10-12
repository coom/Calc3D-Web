import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { smtpRoutes } from './smtp.routes.js';
import { decrypt } from '../utils/crypto.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.smtpSettings.deleteMany(); await prisma.auditLog.deleteMany(); });
const body = { host: 'smtp.x', port: 587, secure: false, username: 'u', password: 's3cret', fromAddress: 'calc@x.fr', fromName: 'Calc3D', enabled: true };

describe('routes SMTP', () => {
  it('admin : lecture sans mot de passe, écriture chiffrée, vide = inchangé, audit ; utilisateur : 403 sauf /status', async () => {
    const adm = await createTestUser(prisma, 'root', 'admin'); const u = await createTestUser(prisma, 'bob');
    expect((await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).get('/api/smtp')).body).toMatchObject({ host: '', port: 587, enabled: false, hasPassword: false });
    const w = await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).put('/api/smtp').send(body);
    expect(w.status).toBe(200); expect(w.body).toMatchObject({ host: 'smtp.x', hasPassword: true, enabled: true }); expect(w.body).not.toHaveProperty('password'); expect(w.body).not.toHaveProperty('passwordEnc');
    const row = await prisma.smtpSettings.findUnique({ where: { id: 1 } });
    expect(row?.passwordEnc.startsWith('enc:')).toBe(true); expect(decrypt(row!.passwordEnc)).toBe('s3cret');
    await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).put('/api/smtp').send({ ...body, password: '' });
    expect(decrypt((await prisma.smtpSettings.findUnique({ where: { id: 1 } }))!.passwordEnc)).toBe('s3cret');
    expect((await prisma.auditLog.findMany()).map((a) => a.action)).toEqual(['smtp.update', 'smtp.update']);
    expect((await request(appAs(prisma, adm, '/api/smtp', smtpRoutes)).put('/api/smtp').send({ ...body, host: '', enabled: true })).status).toBe(400);
    expect((await request(appAs(prisma, u, '/api/smtp', smtpRoutes)).get('/api/smtp')).status).toBe(403);
    expect((await request(appAs(prisma, u, '/api/smtp', smtpRoutes)).put('/api/smtp').send(body)).status).toBe(403);
    expect((await request(appAs(prisma, u, '/api/smtp', smtpRoutes)).get('/api/smtp/status')).body).toEqual({ enabled: true });
  });
  it('e-mail de test : utilise la configuration enregistrée ; 502 si le transport échoue', async () => {
    const adm = await createTestUser(prisma, 'root', 'admin');
    const a = appAs(prisma, adm, '/api/smtp', smtpRoutes);
    expect((await request(a).post('/api/smtp/test').send({ to: 'me@x.fr' })).status).toBe(409);
    await request(a).put('/api/smtp').send(body);
    const sent: { to: string }[] = [];
    a.locals.mailFactory = () => ({ sendMail: async (m: { to: string }) => { sent.push(m); } });
    expect((await request(a).post('/api/smtp/test').send({ to: 'me@x.fr' })).status).toBe(200); expect(sent[0].to).toBe('me@x.fr');
    a.locals.mailFactory = () => ({ sendMail: async () => { throw new Error('auth failed'); } });
    const r = await request(a).post('/api/smtp/test').send({ to: 'me@x.fr' });
    expect(r.status).toBe(502); expect(r.body.details).toBe('auth failed');
  });
});
