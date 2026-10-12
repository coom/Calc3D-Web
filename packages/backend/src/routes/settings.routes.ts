import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { getOrCreateSettings, toSettingsDto } from '../settings/settings-service.js';
import { userSettingsSchema } from '../settings/settings.schema.js';

export const settingsRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

settingsRoutes.get('/', wrap(async (req, res) => {
  res.json(await getOrCreateSettings(req.app.locals.prisma, ownerScope(req).userId));
}));

settingsRoutes.put('/', wrap(async (req, res) => {
  const parsed = userSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid settings', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId); // garantit la ligne et le catalogue par défaut
  const row = await prisma.userSettings.update({ where: { userId }, data: parsed.data });
  res.json(toSettingsDto(row));
}));
