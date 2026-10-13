import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { testPrisma } from '../test-db.js';
import { createTestUser, appAs } from '../test-users.js';
import { userRoutes } from './users.routes.js';
import { config } from '../config.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.user.deleteMany(); await prisma.smtpSettings.deleteMany(); await prisma.auditLog.deleteMany(); await prisma.appSetting.deleteMany(); });
type Sent = { to: string; subject: string; text: string };
const newUser = { username: 'bob', password: 'Str0ng-Passw0rd!', displayName: 'Bob', role: 'user' };

async function adminApp() {
  const adm = await createTestUser(prisma, 'root', 'admin');
  return appAs(prisma, adm, '/api/users', userRoutes);
}
function captureMail(a: ReturnType<typeof appAs>) { const sent: Sent[] = []; a.locals.mailFactory = () => ({ sendMail: async (m: Sent) => { sent.push(m); } }); return sent; }
const smtpOn = () => prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', fromAddress: 'calc@x.fr', enabled: true } });

describe('utilisateurs : e-mail, langue et notification', () => {
  it('création avec e-mail et langue, sans notification : enregistrés, renvoyés par la liste, aucun e-mail', async () => {
    const a = await adminApp(); const sent = captureMail(a);
    const r = await request(a).post('/api/users').send({ ...newUser, email: 'Bob@X.fr', language: 'en' });
    expect(r.status).toBe(201); expect(r.body).toMatchObject({ username: 'bob', emailSent: false });
    expect(await prisma.user.findUnique({ where: { username: 'bob' } })).toMatchObject({ email: 'bob@x.fr', language: 'en' });
    const list = (await request(a).get('/api/users')).body as { username: string; email: string; language: string | null }[];
    expect(list.find((u) => u.username === 'bob')).toMatchObject({ email: 'bob@x.fr', language: 'en' });
    expect(sent).toHaveLength(0);
  });
  it('langue inconnue ou e-mail invalide : 400, rien créé', async () => {
    const a = await adminApp();
    expect((await request(a).post('/api/users').send({ ...newUser, language: 'xx' })).status).toBe(400);
    expect((await request(a).post('/api/users').send({ ...newUser, email: 'pas-un-mail' })).status).toBe(400);
    expect(await prisma.user.count({ where: { username: 'bob' } })).toBe(0);
  });
  it("notification : e-mail de bienvenue dans la langue de l'utilisateur, avec adresse, identifiant, mot de passe, mentions temporaire et MFA", async () => {
    const a = await adminApp(); const sent = captureMail(a); await smtpOn();
    const r = await request(a).post('/api/users').send({ ...newUser, email: 'bob@x.fr', language: 'fr', notify: true, mustChangePassword: true, mfaRequired: true });
    expect(r.status).toBe(201); expect(r.body.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'bob@x.fr', subject: 'Votre accès à Calc3D' });
    expect(sent[0].text).toContain(config.frontendUrl); expect(sent[0].text).toContain('Identifiant : bob'); expect(sent[0].text).toContain('Mot de passe : Str0ng-Passw0rd!');
    expect(sent[0].text).toContain('temporaire'); expect(sent[0].text).toContain('obligatoire');
    // Jamais le mot de passe dans l'audit.
    const audits = await prisma.auditLog.findMany();
    expect(audits.map((x) => x.action)).toEqual(['user.create']);
    expect(JSON.stringify(audits)).not.toContain('Str0ng-Passw0rd!');
  });
  it("notification sans e-mail : 400 ; sans SMTP : 409 smtp_disabled ; dans les deux cas rien n'est créé", async () => {
    const a = await adminApp();
    const r1 = await request(a).post('/api/users').send({ ...newUser, notify: true });
    expect(r1.status).toBe(400); expect(r1.body.code).toBe('validation');
    const r2 = await request(a).post('/api/users').send({ ...newUser, email: 'bob@x.fr', notify: true });
    expect(r2.status).toBe(409); expect(r2.body.code).toBe('smtp_disabled');
    expect(await prisma.user.count({ where: { username: 'bob' } })).toBe(0);
  });
  it("transport en panne : l'utilisateur est créé, 201 avec emailSent false et le message du transport", async () => {
    const a = await adminApp(); await smtpOn();
    a.locals.mailFactory = () => ({ sendMail: async () => { throw new Error('ECONNREFUSED'); } });
    const r = await request(a).post('/api/users').send({ ...newUser, email: 'bob@x.fr', notify: true });
    expect(r.status).toBe(201); expect(r.body).toMatchObject({ emailSent: false, emailError: 'ECONNREFUSED' });
    expect(await prisma.user.count({ where: { username: 'bob' } })).toBe(1);
  });
  it('édition : e-mail et langue modifiables (204) ; langue inconnue 400 ; e-mail vide accepté', async () => {
    const a = await adminApp(); const u = await createTestUser(prisma, 'bob');
    expect((await request(a).put(`/api/users/${u.id}`).send({ email: 'B@x.fr', language: 'en', displayName: 'Bobby' })).status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toMatchObject({ email: 'b@x.fr', language: 'en', displayName: 'Bobby' });
    expect((await request(a).put(`/api/users/${u.id}`).send({ language: 'xx' })).status).toBe(400);
    expect((await request(a).put(`/api/users/${u.id}`).send({ email: '' })).status).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.email).toBe('');
  });
  it('réinitialisation avec notification : e-mail « nouveau mot de passe » en anglais, sans invitation MFA si déjà activé ; 200 emailSent', async () => {
    const a = await adminApp(); const sent = captureMail(a); await smtpOn();
    const u = await createTestUser(prisma, 'bob'); await prisma.user.update({ where: { id: u.id }, data: { email: 'bob@x.fr', language: 'en', mfaEnabled: true } });
    const r = await request(a).put(`/api/users/${u.id}`).send({ password: 'Str0ng-Passw0rd!', mustChangePassword: true, notify: true });
    expect(r.status).toBe(200); expect(r.body.emailSent).toBe(true);
    expect(sent[0]).toMatchObject({ to: 'bob@x.fr', subject: 'Your new Calc3D password' });
    expect(sent[0].text).toContain('Password : Str0ng-Passw0rd!'); expect(sent[0].text).toContain('temporary'); expect(sent[0].text).not.toMatch(/MFA/);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain('Str0ng-Passw0rd!');
  });
  it('réinitialisation avec notification sans adresse connue : 400, mot de passe inchangé', async () => {
    const a = await adminApp(); const u = await createTestUser(prisma, 'bob'); await smtpOn();
    expect((await request(a).put(`/api/users/${u.id}`).send({ password: 'Str0ng-Passw0rd!', notify: true })).status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.passwordHash).toBe('x');
  });
});
