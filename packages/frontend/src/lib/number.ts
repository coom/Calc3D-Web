/** Nombre saisi par un humain : virgule ou point décimal, espaces (fine ou insécable) comme séparateurs de milliers. null si vide ou invalide. */
export function parseLocaleNumber(text: string): number | null {
  const cleaned = text.replace(/[\s\u202f\u00a0]/g, '').replace(',', '.');
  if (cleaned === '' || (cleaned.match(/\./g) ?? []).length > 1) return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Montant formaté avec la locale de l'interface et le symbole libre de l'utilisateur (pas de code ISO : la devise est un symbole). */
export function formatMoney(value: number, currencySymbol: string, locale: string, decimals = 2): string {
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return `${n} ${currencySymbol}`;
}

export function formatNumber(value: number, locale: string, decimals = 2): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}
