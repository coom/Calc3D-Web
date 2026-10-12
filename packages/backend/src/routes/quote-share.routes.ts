import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseId } from '../utils/paging.js';
import { toQuoteDto } from '../quotes/quote-mapper.js';
import { z } from 'zod';
import { newShareToken, shareUrl } from '../quotes/share-service.js';
import { isSmtpEnabled, sendMail, type TransportFactory } from '../mail/mailer.js';
import { quoteEmail } from '../mail/templates.js';

export const quoteShareRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Monté sur /api/quotes AVANT quotesRoutes (sinon /unseen-count serait capturé par /:id). */
quoteShareRoutes.get('/unseen-count', wrap(async (req, res) => {
  const count = await req.app.locals.prisma.quote.count({ where: { ...ownerScope(req), clientResponse: { not: null }, responseSeenAt: null } });
  res.json({ count });
}));

/** Génère (ou régénère) le lien : l'ancien jeton meurt, la réponse précédente est effacée (réouverture). Le jeton en clair n'est renvoyé qu'ici. */
quoteShareRoutes.post('/:id/share', wrap(async (req, res) => {
  const id = parseId(req.params.id); const scope = ownerScope(req);
  const { token, hash } = newShareToken();
  const r = await req.app.locals.prisma.quote.updateMany({ where: { id, ...scope }, data: { shareTokenHash: hash, sharedAt: new Date(), clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.json({ url: shareUrl(token) });
}));

quoteShareRoutes.delete('/:id/share', wrap(async (req, res) => {
  const r = await req.app.locals.prisma.quote.updateMany({ where: { id: parseId(req.params.id), ...ownerScope(req) }, data: { shareTokenHash: null } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.status(204).send();
}));

quoteShareRoutes.post('/:id/response/seen', wrap(async (req, res) => {
  const id = parseId(req.params.id); const scope = ownerScope(req); const prisma = req.app.locals.prisma;
  const r = await prisma.quote.updateMany({ where: { id, ...scope }, data: { responseSeenAt: new Date() } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.json(toQuoteDto((await prisma.quote.findFirst({ where: { id, ...scope } }))!));
}));

const emailSchema = z.object({ to: z.string().trim().email().max(200), message: z.string().max(1000).default('') }).strict();

/**
 * Envoie le lien au client. Le jeton en clair n'est jamais stocké : chaque envoi régénère le lien (le précédent meurt),
 * sauf si une réponse existe déjà (409 : régénérer effacerait la réponse). L'envoi précède l'écriture : si le transport
 * échoue, l'ancien lien reste valide.
 */
quoteShareRoutes.post('/:id/share/email', wrap(async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid e-mail request', undefined, 'validation');
  const id = parseId(req.params.id); const scope = ownerScope(req); const prisma = req.app.locals.prisma;
  const existing = await prisma.quote.findFirst({ where: { id, ...scope } });
  if (!existing) throw new AppError(404, 'Quote not found');
  if (existing.clientResponse !== null) throw new AppError(409, 'This quote has already been answered; regenerate the link first', undefined, 'already_answered');
  if (!(await isSmtpEnabled(prisma))) throw new AppError(409, 'SMTP is not configured', undefined, 'smtp_disabled');
  const owner = await prisma.user.findUnique({ where: { id: scope.userId }, select: { displayName: true, language: true } });
  const { token, hash } = newShareToken(); const url = shareUrl(token);
  await sendMail(prisma, { to: parsed.data.to, ...quoteEmail(owner?.language, { projectName: existing.projectName, ownerName: owner?.displayName ?? '', url, message: parsed.data.message }) }, req.app.locals.mailFactory as TransportFactory | undefined);
  await prisma.quote.update({ where: { id }, data: { shareTokenHash: hash, sharedAt: new Date(), clientEmail: parsed.data.to.toLowerCase(), clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null } });
  res.json({ url });
}));
