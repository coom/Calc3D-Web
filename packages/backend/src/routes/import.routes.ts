import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { ownerScope } from '../owner-scope.js';
import { importDesktopData } from '../import/desktop-import.js';

export const importRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const bodySchema = z.object({ config: z.string().max(1_000_000).optional(), historique: z.string().max(20_000_000).optional(), achats: z.string().max(20_000_000).optional() }).strict()
  .refine((b) => b.config !== undefined || b.historique !== undefined || b.achats !== undefined, 'at least one file is required');

function parseTimeZone(raw: unknown): string {
  if (raw === undefined) return 'UTC';
  const tz = String(raw);
  if (tz.length > 64) throw new AppError(400, 'Invalid tz');
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { throw new AppError(400, 'Invalid tz'); }
}

/** Fichiers de l'application bureau envoyés en texte (le client les lit avec FileReader). Limite propre à la route : 20 Mo. */
importRoutes.post('/desktop', express.json({ limit: '20mb' }), wrap(async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Invalid import body', parsed.error.issues.map((i) => i.message).join('; '), 'validation');
  const timeZone = parseTimeZone(req.query.tz);
  res.json(await importDesktopData(req.app.locals.prisma, ownerScope(req).userId, parsed.data, timeZone));
}));
