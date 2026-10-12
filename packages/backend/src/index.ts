import { createServer } from 'http';
import { PrismaClient } from '../generated/prisma/index.js';
import { createApp } from './app.js';
import { notifyOwnerOfResponse } from './mail/notify.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { purgeWebLogins } from './journal/retention.js';

process.on('uncaughtException', (err) => logger.error({ err }, 'uncaught exception (kept alive)'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection (kept alive)'));

async function main() {
  if (config.encryptionKey === config.jwtSecret) {
    logger.fatal('ENCRYPTION_KEY must be different from JWT_SECRET');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const app = createApp();
  app.locals.prisma = prisma;
  // Notification du propriétaire après une réponse client (public.routes.ts) ; absent en test, remplacé par un factice.
  app.locals.notifyOwnerOfResponse = notifyOwnerOfResponse;
  const server = createServer(app);

  // Purge quotidienne du journal de connexions selon la rétention configurée.
  const purge = () => purgeWebLogins(prisma).catch((err) => logger.warn({ err }, 'journal purge failed'));
  void purge();
  const purgeTimer = setInterval(() => void purge(), 86_400_000);

  server.listen(config.port, () => logger.info(`Calc3D-Web backend on http://localhost:${config.port}`));

  const shutdown = async () => {
    logger.info('shutting down');
    clearInterval(purgeTimer);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => { logger.fatal({ err }, 'failed to start'); process.exit(1); });
