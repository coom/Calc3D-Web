import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { getOrCreateSettings, getOrCreateSettingsRow, toPaypalDto, toSettingsDto } from '../settings/settings-service.js';
import { paypalSettingsSchema, userSettingsSchema } from '../settings/settings.schema.js';

export const settingsRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

settingsRoutes.get('/', wrap(async (req, res) => {
  res.json(await getOrCreateSettings(req.app.locals.prisma, ownerScope(req).userId));
}));

settingsRoutes.get('/paypal', wrap(async (req, res) => {
  res.json(toPaypalDto(await getOrCreateSettingsRow(req.app.locals.prisma, ownerScope(req).userId)));
}));

settingsRoutes.put('/paypal', wrap(async (req, res) => {
  const parsed = paypalSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid PayPal settings', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'validation');
  const { userId } = ownerScope(req);
  const prisma = req.app.locals.prisma;
  await getOrCreateSettings(prisma, userId);
  res.json(toPaypalDto(await prisma.userSettings.update({ where: { userId }, data: parsed.data })));
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
