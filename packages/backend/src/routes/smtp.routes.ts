import { Router, type Request, type Response, type NextFunction } from 'express';
import type { SmtpSettingsDto } from '@calc3d/common';
import type { SmtpSettings } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../audit/audit.js';
import { encrypt } from '../utils/crypto.js';
import { getSmtpSettings, isSmtpEnabled, sendMail, type TransportFactory } from '../mail/mailer.js';
import { smtpBodySchema, smtpTestSchema } from '../mail/smtp.schema.js';

export const smtpRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const toDto = (s: SmtpSettings | null): SmtpSettingsDto => ({ host: s?.host ?? '', port: s?.port ?? 587, secure: s?.secure ?? false, username: s?.username ?? '', hasPassword: !!s?.passwordEnc, fromAddress: s?.fromAddress ?? '', fromName: s?.fromName ?? '', enabled: s?.enabled ?? false });

/** Visible de tout utilisateur connecté : juste « activé ou non », pour les boutons d'envoi. */
smtpRoutes.get('/status', wrap(async (req, res) => { res.json({ enabled: await isSmtpEnabled(req.app.locals.prisma) }); }));

smtpRoutes.use(requireRole('admin'));
smtpRoutes.get('/', wrap(async (req, res) => { res.json(toDto(await getSmtpSettings(req.app.locals.prisma))); }));

/** Le mot de passe n'est jamais renvoyé ; vide ou absent en écriture = inchangé. Chiffré avec ENCRYPTION_KEY. */
smtpRoutes.put('/', wrap(async (req, res) => {
  const parsed = smtpBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid SMTP settings', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const { password, ...rest } = parsed.data;
  const data = { ...rest, ...(password ? { passwordEnc: encrypt(password) } : {}) };
  const row = await req.app.locals.prisma.smtpSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await audit(req, 'smtp.update', `${row.host}:${row.port} enabled=${row.enabled}`);
  res.json(toDto(row));
}));

smtpRoutes.post('/test', wrap(async (req, res) => {
  const parsed = smtpTestSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid recipient', undefined, 'validation');
  await sendMail(req.app.locals.prisma, { to: parsed.data.to, subject: 'Calc3D – test SMTP', text: 'Calc3D : la configuration SMTP fonctionne.', html: '<p>Calc3D : la configuration SMTP fonctionne.</p>' }, req.app.locals.mailFactory as TransportFactory | undefined);
  res.json({ ok: true });
}));
