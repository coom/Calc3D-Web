export const QUOTE_KINDS = ['QUOTE', 'ORDER'] as const;
export type QuoteKind = (typeof QUOTE_KINDS)[number];

export const QUOTE_STATUSES = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'DONE', 'ON_HOLD'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const PRICING_MODES = ['MARKUP', 'TARGET_MARGIN'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const PURCHASE_CATEGORIES = ['FILAMENT', 'SPARE_PARTS', 'MAINTENANCE', 'HARDWARE', 'TOOLS', 'OTHER'] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

/** Catalogue créé avec les paramètres d'un nouvel utilisateur (même liste que Get-DefaultCatalogueMatieres). */
export const DEFAULT_MATERIALS: ReadonlyArray<{ name: string; pricePerKg: number }> = [
  { name: 'PLA', pricePerKg: 18 }, { name: 'PETG', pricePerKg: 20 }, { name: 'ABS', pricePerKg: 19 },
  { name: 'ASA', pricePerKg: 22 }, { name: 'TPU', pricePerKg: 25 }, { name: 'Nylon (PA)', pricePerKg: 35 },
  { name: 'PA-CF', pricePerKg: 45 }, { name: 'PETG-CF', pricePerKg: 30 }, { name: 'PC', pricePerKg: 35 },
  { name: 'PVB', pricePerKg: 20 }, { name: 'Autre', pricePerKg: 20 },
];
