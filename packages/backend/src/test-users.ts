import express, { type Express, type Router } from 'express';
import type { PrismaClient } from '../generated/prisma/index.js';
import type { UserRole } from '@calc3d/common';
import { errorHandler } from './middleware/error-handler.js';

export async function createTestUser(prisma: PrismaClient, username: string, role: UserRole = 'user') {
  return prisma.user.create({ data: { username, displayName: username, role, passwordHash: 'x' } });
}

/** App Express minimale où l'identité est injectée (pas de JWT) et un routeur monté sur `mount`. Accepte directement une ligne Prisma `User` (role en `string`). */
export function appAs(prisma: PrismaClient, user: { id: number; username: string; role: string }, mount: string, router: Router): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => { req.user = { typ: 'access', id: user.id, username: user.username, role: user.role as UserRole }; next(); });
  app.locals.prisma = prisma;
  app.use(mount, router);
  app.use(errorHandler);
  return app;
}
