import type { PricingMode, PurchaseCategory, QuoteKind, QuoteStatus } from '../constants.js';

/** Valeurs canoniques françaises de historique.csv / achats.csv / config.json de l'application bureau. */
export const DESKTOP_KIND: Record<string, QuoteKind> = { Devis: 'QUOTE', Commande: 'ORDER' };
export const DESKTOP_STATUS: Record<string, QuoteStatus> = { 'En attente': 'PENDING', Programme: 'SCHEDULED', 'En cours': 'IN_PROGRESS', Termine: 'DONE', 'En pause': 'ON_HOLD' };
export const DESKTOP_CATEGORY: Record<string, PurchaseCategory> = { 'Filament / Consommables': 'FILAMENT', 'Pieces detachees': 'SPARE_PARTS', 'Maintenance / Reparation': 'MAINTENANCE', 'Materiel / Equipement': 'HARDWARE', Outillage: 'TOOLS', Autre: 'OTHER' };
export const DESKTOP_PRICING_MODE: Record<string, PricingMode> = { Markup: 'MARKUP', MargeCible: 'TARGET_MARGIN' };

/** Inverse de Protect-CsvTexte : retire l'apostrophe ajoutée devant = + @ - tabulation. */
export function unprotectCsvText(s: string): string {
  return /^'[=+@\t\r-]/.test(s) ? s.slice(1) : s;
}
