import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { audit } from '../audit/audit.js';
import { applyTrustHops, loadTrustHops, MAX_TRUST_HOPS, saveTrustHops } from '../proxy/trust-proxy.js';

export const proxyRoutes: Router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

proxyRoutes.use(requireRole('admin'));

/** GET /api/proxy : profondeur configurée et IP détectée pour CETTE requête, pour que l'admin ajuste jusqu'à voir sa vraie IP publique. */
proxyRoutes.get('/', wrap(async (req, res) => {
  res.json({ trustHops: await loadTrustHops(req.app.locals.prisma), detectedIp: req.ip ?? null });
}));

/** PUT /api/proxy { trustHops } : enregistre, applique à chaud, audite. */
proxyRoutes.put('/', wrap(async (req, res) => {
  const hops = req.body?.trustHops;
  if (typeof hops !== 'number' || !Number.isInteger(hops) || hops < 0 || hops > MAX_TRUST_HOPS) throw new AppError(400, `trustHops must be an integer between 0 and ${MAX_TRUST_HOPS}`, undefined, 'validation');
  await saveTrustHops(req.app.locals.prisma, hops);
  applyTrustHops(req.app, hops);
  await audit(req, 'proxy.update', String(hops));
  res.json({ trustHops: hops });
}));
