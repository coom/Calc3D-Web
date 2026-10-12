import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: string,
    /** Code stable pour le frontend (traduit côté client), ex. 'duplicate'. */
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(`[Error] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  // Erreurs de body-parser (express.json) : corps trop gros ou JSON invalide ; elles portent `status` et `type`.
  const bp = err as Error & { status?: number; type?: string };
  if (bp.type === 'entity.too.large') { res.status(413).json({ error: 'Request body too large', code: 'payload_too_large' }); return; }
  if (bp.type === 'entity.parse.failed' || bp.type === 'entity.verify.failed' || bp.type === 'charset.unsupported' || bp.type === 'encoding.unsupported') { res.status(400).json({ error: 'Malformed JSON body', code: 'validation' }); return; }

  res.status(500).json({ error: 'Internal server error' });
}
