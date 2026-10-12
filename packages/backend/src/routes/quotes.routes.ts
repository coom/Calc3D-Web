import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeQuote, QUOTE_KINDS, QUOTE_STATUSES, type PricingSettings, type QuoteInput, type QuoteKind, type QuoteStatus } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseListPage } from '../utils/paging.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { createQuoteSchema, quoteInputSchema } from '../quotes/quote.schema.js';
import { buildQuoteData, toQuoteDto } from '../quotes/quote-mapper.js';

export const quotesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** computeQuote lève RangeError sur une marge cible ≥ 100 : 400 avec un code stable pour le frontend. */
function safeCompute(settings: PricingSettings, input: QuoteInput) {
  try { return computeQuote(settings, input); }
  catch (err) {
    if (err instanceof RangeError) throw new AppError(400, err.message, undefined, 'pricing');
    throw err;
  }
}

/** Paramètres courants de l'utilisateur, sans pdfShowCostBreakdown (qui n'influence pas le prix). */
async function currentPricingSettings(req: Request): Promise<PricingSettings> {
  const { pdfShowCostBreakdown: _omit, ...pricing } = await getOrCreateSettings(req.app.locals.prisma, ownerScope(req).userId);
  return pricing;
}

const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

quotesRoutes.post('/preview', wrap(async (req, res) => {
  const parsed = quoteInputSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid quote input', issues(parsed.error), 'validation');
  const settings = await currentPricingSettings(req);
  res.json({ result: safeCompute(settings, parsed.data), settings });
}));

quotesRoutes.post('/', wrap(async (req, res) => {
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid quote', issues(parsed.error), 'validation');
  const { userId } = ownerScope(req);
  const settings = await currentPricingSettings(req);
  const result = safeCompute(settings, parsed.data);
  const row = await req.app.locals.prisma.quote.create({ data: buildQuoteData(userId, parsed.data, settings, result) });
  res.status(201).json(toQuoteDto(row));
}));

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Invalid id');
  return id;
}

/**
 * Filtres de l'historique : q (projet ou client, « contient »), kind, status. Valeur inconnue = 400.
 * Sémantique assumée du « contient » : Prisma émet un LIKE SQLite sans clause ESCAPE, donc `%` et `_`
 * tapés par l'utilisateur sont des jokers (la requête reste paramétrée : aucune injection, aucune erreur).
 */
function listFilters(query: Record<string, unknown>): Record<string, unknown> {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ projectName: { contains: q } }, { customer: { contains: q } }];
  if (query.kind !== undefined) {
    if (!QUOTE_KINDS.includes(query.kind as QuoteKind)) throw new AppError(400, 'Invalid kind');
    where.kind = query.kind;
  }
  if (query.status !== undefined) {
    if (!QUOTE_STATUSES.includes(query.status as QuoteStatus)) throw new AppError(400, 'Invalid status');
    where.status = query.status;
  }
  return where;
}

quotesRoutes.get('/', wrap(async (req, res) => {
  const { page, limit, skip } = parseListPage(req.query);
  const where = { ...ownerScope(req), ...listFilters(req.query) };
  const prisma = req.app.locals.prisma;
  const [total, rows] = await Promise.all([prisma.quote.count({ where }), prisma.quote.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: limit })]);
  res.json({ items: rows.map(toQuoteDto), total, page, limit });
}));

quotesRoutes.get('/:id', wrap(async (req, res) => {
  const row = await req.app.locals.prisma.quote.findFirst({ where: { id: parseId(req.params.id), ...ownerScope(req) } });
  if (!row) throw new AppError(404, 'Quote not found');
  res.json(toQuoteDto(row));
}));

/** Recalcul avec l'instantané du devis (tarifs de sa création) ; ?useCurrentSettings=1 remplace l'instantané par les paramètres courants. */
quotesRoutes.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid quote', issues(parsed.error), 'validation');
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.quote.findFirst({ where: { id, ...scope } });
  if (!existing) throw new AppError(404, 'Quote not found');
  const settings: PricingSettings = req.query.useCurrentSettings === '1' ? await currentPricingSettings(req) : (JSON.parse(existing.settingsSnapshot) as PricingSettings);
  const result = safeCompute(settings, parsed.data);
  const { userId: _keep, ...data } = buildQuoteData(scope.userId, parsed.data, settings, result);
  const row = await prisma.quote.update({ where: { id }, data });
  res.json(toQuoteDto(row));
}));

quotesRoutes.post('/:id/convert', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.quote.findFirst({ where: { id, ...ownerScope(req) } });
  if (!existing) throw new AppError(404, 'Quote not found');
  if (existing.kind === 'ORDER') throw new AppError(409, 'This quote is already an order', undefined, 'already_order');
  const row = await prisma.quote.update({ where: { id }, data: { kind: 'ORDER' } });
  res.json(toQuoteDto(row));
}));

quotesRoutes.delete('/:id', wrap(async (req, res) => {
  const r = await req.app.locals.prisma.quote.deleteMany({ where: { id: parseId(req.params.id), ...ownerScope(req) } });
  if (r.count === 0) throw new AppError(404, 'Quote not found');
  res.status(204).send();
}));
