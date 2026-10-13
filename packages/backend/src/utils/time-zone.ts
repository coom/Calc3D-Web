import { AppError } from '../middleware/error-handler.js';

/** Fuseau IANA envoyé par le navigateur ; défaut UTC ; 400 si inconnu (Intl refuse les noms invalides). */
export function parseTimeZone(raw: unknown): string {
  if (raw === undefined) return 'UTC';
  const tz = String(raw);
  if (tz.length > 64) throw new AppError(400, 'Invalid tz');
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { throw new AppError(400, 'Invalid tz'); }
}
