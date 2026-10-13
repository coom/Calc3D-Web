import { Router, type Request, type Response, type NextFunction } from 'express';
import { computeIndicators, INDICATOR_WINDOWS, type ClientResponse, type IndicatorQuoteRow, type IndicatorWindow, type QuoteKind, type QuoteStatus } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseTimeZone } from '../utils/time-zone.js';

export const indicatorsRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** GET /api/indicators?days=7|30|90|365&tz= : compteurs d'activité de l'utilisateur courant, calculés par computeIndicators dans le fuseau du navigateur. */
indicatorsRoutes.get('/', wrap(async (req, res) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);
  if (!(INDICATOR_WINDOWS as readonly number[]).includes(days)) throw new AppError(400, 'Invalid days');
  const timeZone = parseTimeZone(req.query.tz);
  const rows = await req.app.locals.prisma.quote.findMany({
    where: ownerScope(req),
    select: { kind: true, status: true, createdAt: true, clientResponse: true, clientRespondedAt: true, convertedAt: true, paidAt: true },
  });
  const mapped: IndicatorQuoteRow[] = rows.map((r: { kind: string; status: string; createdAt: Date; clientResponse: string | null; clientRespondedAt: Date | null; convertedAt: Date | null; paidAt: Date | null }) => ({
    kind: r.kind as QuoteKind, status: r.status as QuoteStatus, createdAt: r.createdAt.toISOString(),
    clientResponse: r.clientResponse as ClientResponse | null, clientRespondedAt: r.clientRespondedAt?.toISOString() ?? null,
    convertedAt: r.convertedAt?.toISOString() ?? null, paidAt: r.paidAt?.toISOString() ?? null,
  }));
  res.json(computeIndicators(mapped, days as IndicatorWindow, new Date(), timeZone));
}));
