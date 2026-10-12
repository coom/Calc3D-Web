/** Date ISO (avec ou sans heure) → Date locale ; une date seule est interprétée à minuit local. */
export function toLocalDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
}
export function monthKey(iso: string): string {
  const d = toLocalDate(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** « Octobre 2026 » / « October 2026 » à partir d'une clé yyyy-MM. */
export function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number);
  const s = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale).format(toLocalDate(iso));
}
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
