import express, { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CLIENT_RESPONSES, toPublicQuoteDto, type PublicQuoteDto } from '@calc3d/common';
import type { PrismaClient, Quote } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { hashShareToken } from '../quotes/share-service.js';
import { toQuoteDto } from '../quotes/quote-mapper.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { logger } from '../utils/logger.js';

export const publicRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Routes sans authentification : limiteur propre (30 / 15 min / IP) et corps ≤ 16 ko (spec lot 4 §8). */
publicRoutes.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } }));
publicRoutes.use(express.json({ limit: '16kb' }));

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const respondSchema = z.object({ decision: z.enum(CLIENT_RESPONSES), comment: z.string().max(10_000).optional() }).strict();

/** Jeton → devis partagé, ou 404 sans distinguer « inconnu » de « révoqué ». */
async function findShared(prisma: PrismaClient, token: string): Promise<Quote> {
  if (!TOKEN_RE.test(token)) throw new AppError(404, 'Quote not found');
  const row = await prisma.quote.findUnique({ where: { shareTokenHash: hashShareToken(token) } });
  if (!row) throw new AppError(404, 'Quote not found');
  return row;
}

async function publicDto(prisma: PrismaClient, row: Quote): Promise<PublicQuoteDto> {
  const [settings, owner] = await Promise.all([getOrCreateSettings(prisma, row.userId), prisma.user.findUnique({ where: { id: row.userId }, select: { displayName: true } })]);
  return toPublicQuoteDto(toQuoteDto(row), { showCostBreakdown: settings.pdfShowCostBreakdown, currencySymbol: settings.currencySymbol, ownerDisplayName: owner?.displayName ?? '' });
}

publicRoutes.get('/quotes/:token', wrap(async (req, res) => {
  const prisma = req.app.locals.prisma;
  res.json(await publicDto(prisma, await findShared(prisma, String(req.params.token))));
}));

/** Une seule réponse par lien ; le commentaire est stocké brut (tronqué) et échappé à l'affichage. La notification du propriétaire est en meilleur effort. */
publicRoutes.post('/quotes/:token/respond', wrap(async (req, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid response', undefined, 'validation');
  const prisma = req.app.locals.prisma;
  const row = await findShared(prisma, String(req.params.token));
  if (row.clientResponse !== null) throw new AppError(409, 'This quote has already been answered', undefined, 'already_answered');
  const comment = (parsed.data.comment ?? '').slice(0, 2000);
  const updated = await prisma.quote.update({ where: { id: row.id }, data: { clientResponse: parsed.data.decision, clientRespondedAt: new Date(), clientComment: comment, responseSeenAt: null } });
  const notify = req.app.locals.notifyOwnerOfResponse as ((prisma: PrismaClient, quote: Quote) => Promise<void>) | undefined;
  if (notify) notify(prisma, updated).catch((err: unknown) => logger.error({ err, quoteId: updated.id }, 'owner notification failed'));
  res.json(await publicDto(prisma, updated));
}));
