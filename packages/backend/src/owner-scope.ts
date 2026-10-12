import type { Request } from 'express';

/**
 * Filtre propriétaire obligatoire sur toute requête Prisma des tables métier (UserSettings,
 * Material, Quote, Purchase). Un admin n'a pas de passe-droit : il ne voit que ses propres données.
 * Lève si l'identité manque, ce qui ne doit jamais arriver derrière authMiddleware.
 */
export function ownerScope(req: Request): { userId: number } {
  const id = req.user?.id;
  if (typeof id !== 'number') throw new Error('ownerScope called without an authenticated user');
  return { userId: id };
}
