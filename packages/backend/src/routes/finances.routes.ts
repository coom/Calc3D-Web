import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeFinances, FINANCES_PERIODS, type FinancesPeriod } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { toFinanceRow } from '../quotes/quote-mapper.js';
import { toFinancePurchaseRow } from '../purchases/purchase-mapper.js';

export const financesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Les montants viennent des colonnes enregistrées des commandes ; le filtrage par période est fait par computeFinances. */
financesRoutes.get('/', wrap(async (req, res) => {
  const period = (req.query.period ?? 'all') as FinancesPeriod;
  if (!FINANCES_PERIODS.includes(period)) throw new AppError(400, 'Invalid period');
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const [quotes, purchases] = await Promise.all([
    prisma.quote.findMany({ where: { ...scope, kind: 'ORDER' }, select: { kind: true, createdAt: true, finalPrice: true, costAfterContingency: true, filamentCost: true, electricityCost: true, laborPrep: true, laborPost: true, laborDesign: true, laborPackaging: true, depreciation: true, maintenance: true, wear: true, fixedCosts: true, contingency: true } }),
    prisma.purchase.findMany({ where: scope, select: { date: true, category: true, amount: true } }),
  ]);
  res.json(computeFinances(quotes.map(toFinanceRow), purchases.map(toFinancePurchaseRow), period, new Date()));
}));
