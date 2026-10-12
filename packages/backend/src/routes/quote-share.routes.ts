import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseId } from '../utils/paging.js';
import { toQuoteDto } from '../quotes/quote-mapper.js';
import { newShareToken, shareUrl } from '../quotes/share-service.js';

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
