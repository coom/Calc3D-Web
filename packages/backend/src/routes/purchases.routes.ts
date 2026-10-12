import { Router, type Request, type Response, type NextFunction } from 'express';
import { PURCHASE_CATEGORIES, type PurchaseCategory } from '@calc3d/common';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { parseListPage, parseId } from '../utils/paging.js';
import { purchaseBodySchema } from '../purchases/purchase.schema.js';
import { buildPurchaseData, toPurchaseDto } from '../purchases/purchase-mapper.js';

export const purchasesRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

purchasesRoutes.get('/', wrap(async (req, res) => {
  const { page, limit, skip } = parseListPage(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where: Record<string, unknown> = { ...ownerScope(req) };
  if (q) where.OR = [{ description: { contains: q } }, { supplier: { contains: q } }];
  if (req.query.category !== undefined) {
    if (!PURCHASE_CATEGORIES.includes(req.query.category as PurchaseCategory)) throw new AppError(400, 'Invalid category');
    where.category = req.query.category;
  }
  const prisma = req.app.locals.prisma;
  const [total, rows] = await Promise.all([prisma.purchase.count({ where }), prisma.purchase.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip, take: limit })]);
  res.json({ items: rows.map(toPurchaseDto), total, page, limit });
}));

purchasesRoutes.post('/', wrap(async (req, res) => {
  const parsed = purchaseBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid purchase', issues(parsed.error), 'validation');
  const row = await req.app.locals.prisma.purchase.create({ data: buildPurchaseData(ownerScope(req).userId, parsed.data) });
  res.status(201).json(toPurchaseDto(row));
}));

purchasesRoutes.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = purchaseBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid purchase', issues(parsed.error), 'validation');
  const scope = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.purchase.findFirst({ where: { id, ...scope } });
  if (!existing) throw new AppError(404, 'Purchase not found');
  const { userId: _keep, ...data } = buildPurchaseData(scope.userId, parsed.data);
  res.json(toPurchaseDto(await prisma.purchase.update({ where: { id, ...scope }, data })));
}));

purchasesRoutes.delete('/:id', wrap(async (req, res) => {
  const r = await req.app.locals.prisma.purchase.deleteMany({ where: { id: parseId(req.params.id), ...ownerScope(req) } });
  if (r.count === 0) throw new AppError(404, 'Purchase not found');
  res.status(204).send();
}));
