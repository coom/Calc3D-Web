import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

export const accountRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const emailSchema = z.object({ email: z.string().trim().max(200).refine((v) => v === '' || z.string().email().safeParse(v).success, 'invalid email') }).strict();

/** PUT /api/account/email — adresse de notification du compte (vide = aucune notification). Derrière authMiddleware global. */
accountRoutes.put('/email', wrap(async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid email', undefined, 'validation');
  const email = parsed.data.email.toLowerCase();
  await req.app.locals.prisma.user.update({ where: { id: req.user!.id }, data: { email } });
  res.json({ email });
}));
