import { AppError } from '../middleware/error-handler.js';

/** page ≥ 1, limit 1..200 (défaut 50). 400 sur une valeur non entière. */
export function parseListPage(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new AppError(400, 'Invalid pagination');
  return { page, limit, skip: (page - 1) * limit };
}
