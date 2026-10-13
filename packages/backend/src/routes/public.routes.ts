import express, { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CLIENT_RESPONSES, PAYMENT_METHODS, toPublicQuoteDto, type PublicQuoteDto } from '@calc3d/common';
import type { PrismaClient, Quote } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { hashShareToken } from '../quotes/share-service.js';
import { toQuoteDto } from '../quotes/quote-mapper.js';
import { getOrCreateSettingsRow, toPublicPaypal } from '../settings/settings-service.js';
import { logger } from '../utils/logger.js';

export const publicRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Routes sans authentification : limiteur propre (30 / 15 min / IP) et corps ≤ 16 ko (spec lot 4 §8). */
publicRoutes.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } }));
publicRoutes.use(express.json({ limit: '16kb' }));

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const respondSchema = z.object({ decision: z.enum(CLIENT_RESPONSES), comment: z.string().max(10_000).optional(), paymentMethod: z.enum(PAYMENT_METHODS).optional() }).strict();

/** Jeton → devis partagé, ou 404 sans distinguer « inconnu » de « révoqué ». */
async function findShared(prisma: PrismaClient, token: string): Promise<Quote> {
  if (!TOKEN_RE.test(token)) throw new AppError(404, 'Quote not found');
  const row = await prisma.quote.findUnique({ where: { shareTokenHash: hashShareToken(token) } });
  if (!row) throw new AppError(404, 'Quote not found');
  return row;
}

async function publicDto(prisma: PrismaClient, row: Quote): Promise<PublicQuoteDto> {
  const [settings, owner] = await Promise.all([getOrCreateSettingsRow(prisma, row.userId), prisma.user.findUnique({ where: { id: row.userId }, select: { displayName: true } })]);
  return toPublicQuoteDto(toQuoteDto(row), { showCostBreakdown: settings.pdfShowCostBreakdown, currencySymbol: settings.currencySymbol, ownerDisplayName: owner?.displayName ?? '', paypal: toPublicPaypal(settings) });
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
  const comment = (parsed.data.comment ?? '').slice(0, 2000);
  // Moyen de paiement : exigé avec l'acceptation si le propriétaire propose PayPal, interdit sinon et sur un refus.
  const paypalOffered = (await getOrCreateSettingsRow(prisma, row.userId)).paypalEnabled;
  const paymentMethod = parsed.data.paymentMethod ?? null;
  if (parsed.data.decision === 'ACCEPTED' && paypalOffered && !paymentMethod) throw new AppError(400, 'A payment method is required', undefined, 'validation');
  if (paymentMethod && (parsed.data.decision !== 'ACCEPTED' || !paypalOffered)) throw new AppError(400, 'Payment method not accepted here', undefined, 'validation');
  // Écriture conditionnelle : deux réponses simultanées ne peuvent pas toutes deux passer (la première gagne, la seconde reçoit 409).
  // Pas de ownerScope ici par construction : la route est publique, l'accès est prouvé par le jeton haché (unique).
  const r = await prisma.quote.updateMany({ where: { id: row.id, shareTokenHash: row.shareTokenHash, clientResponse: null }, data: { clientResponse: parsed.data.decision, clientRespondedAt: new Date(), clientComment: comment, responseSeenAt: null, paymentMethod } });
  if (r.count === 0) throw new AppError(409, 'This quote has already been answered', undefined, 'already_answered');
  const updated = (await prisma.quote.findUnique({ where: { id: row.id } }))!;
  const notify = req.app.locals.notifyOwnerOfResponse as ((prisma: PrismaClient, quote: Quote) => Promise<void>) | undefined;
  if (notify) notify(prisma, updated).catch((err: unknown) => logger.error({ err, quoteId: updated.id }, 'owner notification failed'));
  res.json(await publicDto(prisma, updated));
}));
