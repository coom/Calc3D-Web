import { Router, type Request, type Response, type NextFunction } from 'express';
import type { PrismaClient } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { getOrCreateSettings } from '../settings/settings-service.js';
import { materialBodySchema } from '../settings/settings.schema.js';

export const materialsRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const toDto = (m: { id: number; name: string; pricePerKg: number; sortOrder: number }) => ({ id: m.id, name: m.name, pricePerKg: m.pricePerKg, sortOrder: m.sortOrder });

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Invalid id');
  return id;
}

/** Doublon insensible à la casse : SQLite compare en binaire, on compare donc en mémoire sur le catalogue de l'utilisateur (quelques dizaines de lignes). */
async function assertNoDuplicate(prisma: PrismaClient, userId: number, name: string, exceptId?: number) {
  const rows = await prisma.material.findMany({ where: { userId }, select: { id: true, name: true } });
  const lower = name.toLowerCase();
  if (rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === lower)) {
    throw new AppError(409, 'A material with this name already exists', undefined, 'duplicate');
  }
}

materialsRoutes.get('/', wrap(async (req, res) => {
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId);
  const rows = await prisma.material.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  res.json(rows.map(toDto));
}));

materialsRoutes.post('/', wrap(async (req, res) => {
  const parsed = materialBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid material', undefined, 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId);
  await assertNoDuplicate(prisma, userId, parsed.data.name);
  const max = await prisma.material.aggregate({ where: { userId }, _max: { sortOrder: true } });
  const row = await prisma.material.create({ data: { userId, name: parsed.data.name, pricePerKg: parsed.data.pricePerKg, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  res.status(201).json(toDto(row));
}));

materialsRoutes.put('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = materialBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid material', undefined, 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  const existing = await prisma.material.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(404, 'Material not found');
  await assertNoDuplicate(prisma, userId, parsed.data.name, id);
  const row = await prisma.material.update({ where: { id }, data: parsed.data });
  res.json(toDto(row));
}));

materialsRoutes.delete('/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  // deleteMany filtré par propriétaire : 0 ligne touchée = introuvable pour cet utilisateur, jamais de fuite.
  const r = await prisma.material.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw new AppError(404, 'Material not found');
  res.status(204).send();
}));
