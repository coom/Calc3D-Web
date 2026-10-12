import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { audit } from '../audit/audit.js';
import { parsePage } from '../utils/pagination.js';
import { loadRetentionDays, saveRetentionDays, MAX_RETENTION_DAYS } from '../journal/retention.js';

export const journalRoutes: Router = Router();
journalRoutes.use(requireRole('admin'));

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

function parseDate(v: unknown, label: string): Date | undefined {
  if (v === undefined || v === '') return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError(400, `Invalid ${label} date`);
  return d;
}

/** Filtres : q (contient, insensible à la casse via SQLite), from/to sur createdAt. */
function filters(req: Request): Record<string, unknown> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to');
  return {
    ...(q ? { username: { contains: q } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
}

journalRoutes.get('/web', wrap(async (req, res) => {
  const { page, limit, skip } = parsePage(req.query);
  const where = filters(req);
  const prisma = req.app.locals.prisma;
  const [total, rows] = await Promise.all([prisma.webLogin.count({ where }), prisma.webLogin.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit })]);
  res.json({ items: rows.map((r: { createdAt: Date }) => ({ ...r, createdAt: r.createdAt.toISOString() })), total, page, limit });
}));

journalRoutes.get('/retention', wrap(async (req, res) => { res.json({ days: await loadRetentionDays(req.app.locals.prisma) }); }));

journalRoutes.put('/retention', wrap(async (req, res) => {
  const days = req.body?.days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > MAX_RETENTION_DAYS) throw new AppError(400, `days must be an integer between 0 and ${MAX_RETENTION_DAYS}`);
  await saveRetentionDays(req.app.locals.prisma, days);
  await audit(req, 'journal.retention', String(days));
  res.json({ days });
}));
