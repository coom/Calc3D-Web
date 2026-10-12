import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeFinances, FINANCES_PERIODS, type FinancesPeriod } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { toFinanceRow } from '../quotes/quote-mapper.js';
import { toFinancePurchaseRow } from '../purchases/purchase-mapper.js';

export const financesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Fuseau IANA envoyé par le navigateur ; défaut UTC ; 400 si inconnu (Intl refuse les noms invalides). */
function parseTimeZone(raw: unknown): string {
  if (raw === undefined) return 'UTC';
  const tz = String(raw);
  if (tz.length > 64) throw new AppError(400, 'Invalid tz');
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { throw new AppError(400, 'Invalid tz'); }
}

/** Les montants viennent des colonnes enregistrées des commandes ; le filtrage par période est fait par computeFinances dans le fuseau du navigateur. */
financesRoutes.get('/', wrap(async (req, res) => {
  const period = (req.query.period ?? 'all') as FinancesPeriod;
  if (!FINANCES_PERIODS.includes(period)) throw new AppError(400, 'Invalid period');
  const timeZone = parseTimeZone(req.query.tz);
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const [quotes, purchases] = await Promise.all([
    prisma.quote.findMany({ where: { ...scope, kind: 'ORDER' }, select: { kind: true, createdAt: true, finalPrice: true, costAfterContingency: true, filamentCost: true, electricityCost: true, laborPrep: true, laborPost: true, laborDesign: true, laborPackaging: true, depreciation: true, maintenance: true, wear: true, fixedCosts: true, contingency: true } }),
    prisma.purchase.findMany({ where: scope, select: { date: true, category: true, amount: true } }),
  ]);
  res.json(computeFinances(quotes.map(toFinanceRow), purchases.map(toFinancePurchaseRow), period, new Date(), timeZone));
}));
