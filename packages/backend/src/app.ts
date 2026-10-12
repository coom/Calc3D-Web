import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { requireRole } from './middleware/rbac.js';
import { authRoutes } from './routes/auth.routes.js';
import { setupRoutes } from './routes/setup.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { journalRoutes } from './routes/journal.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { materialsRoutes } from './routes/materials.routes.js';
import { quotesRoutes } from './routes/quotes.routes.js';
import { purchasesRoutes } from './routes/purchases.routes.js';
import { financesRoutes } from './routes/finances.routes.js';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString() }); });

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, please try again later' } });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
  app.use('/api/setup/init', authLimiter);
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } }));

  // Routes publiques, puis authMiddleware, puis les routes protégées (les tâches 5 et 6 ajoutent les routes métier ici).
  app.use('/api/setup', setupRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api', authMiddleware);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', requireRole('admin'), auditRoutes);
  app.use('/api/journal', journalRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/materials', materialsRoutes);
  app.use('/api/quotes', quotesRoutes);
  app.use('/api/purchases', purchasesRoutes);
  app.use('/api/finances', financesRoutes);

  app.use(errorHandler);
  return app;
}
