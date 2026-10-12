import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { testPrisma } from '../test-db.js';
import { isSmtpEnabled, sendMail, type TransportFactory } from './mailer.js';
import { encrypt } from '../utils/crypto.js';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(async () => { await prisma.smtpSettings.deleteMany(); });
const msg = { to: 'c@x.fr', subject: 'S', text: 't', html: '<p>t</p>' };

describe('mailer', () => {
  it('SMTP absent ou désactivé : isSmtpEnabled false, sendMail → 409 smtp_disabled, aucun transport créé', async () => {
    const factory = vi.fn();
    expect(await isSmtpEnabled(prisma)).toBe(false);
    await expect(sendMail(prisma, msg, factory as unknown as TransportFactory)).rejects.toMatchObject({ statusCode: 409, code: 'smtp_disabled' });
    await prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', enabled: false } });
    await expect(sendMail(prisma, msg, factory as unknown as TransportFactory)).rejects.toMatchObject({ code: 'smtp_disabled' });
    expect(factory).not.toHaveBeenCalled();
  });
  it("SMTP activé : transport créé avec le mot de passe déchiffré, message envoyé avec l'expéditeur ; échec du transport → 502 smtp_failed", async () => {
    await prisma.smtpSettings.create({ data: { id: 1, host: 'smtp.x', port: 465, secure: true, username: 'u', passwordEnc: encrypt('p4ss'), fromAddress: 'calc@x.fr', fromName: 'Calc3D', enabled: true } });
    expect(await isSmtpEnabled(prisma)).toBe(true);
    const sent: unknown[] = []; const opts: unknown[] = [];
    const factory: TransportFactory = (o) => { opts.push(o); return { sendMail: async (m) => { sent.push(m); } }; };
    await sendMail(prisma, msg, factory);
    expect(opts[0]).toEqual({ host: 'smtp.x', port: 465, secure: true, auth: { user: 'u', pass: 'p4ss' } });
    expect(sent[0]).toMatchObject({ from: '"Calc3D" <calc@x.fr>', to: 'c@x.fr', subject: 'S' });
    const failing: TransportFactory = () => ({ sendMail: async () => { throw new Error('ECONNREFUSED 1.2.3.4:465'); } });
    await expect(sendMail(prisma, msg, failing)).rejects.toMatchObject({ statusCode: 502, code: 'smtp_failed', details: 'ECONNREFUSED 1.2.3.4:465' });
  });
});
