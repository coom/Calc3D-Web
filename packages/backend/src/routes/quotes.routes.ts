import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeQuote, type PricingSettings, type QuoteInput } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
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
