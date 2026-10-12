import type { PurchaseCategory, QuoteKind } from '../constants.js';

export const FINANCES_PERIODS = ['all', '12m', 'year', 'month'] as const;
export type FinancesPeriod = (typeof FINANCES_PERIODS)[number];

/** Colonnes d'un devis nécessaires aux agrégats (lues en base, jamais recalculées). */
export interface FinanceQuoteRow {
  kind: QuoteKind;
  /** ISO 8601 */
  createdAt: string;
  finalPrice: number;
  costAfterContingency: number;
  filamentCost: number;
  electricityCost: number;
  laborPrep: number; laborPost: number; laborDesign: number; laborPackaging: number;
  depreciation: number; maintenance: number; wear: number;
  fixedCosts: number;
  contingency: number;
}
export interface FinancePurchaseRow { date: string; category: PurchaseCategory; amount: number }

export const COST_BREAKDOWN_KEYS = ['filament', 'electricity', 'labor', 'printer', 'fixedCosts', 'contingency'] as const;
export type CostBreakdownKey = (typeof COST_BREAKDOWN_KEYS)[number];

export interface FinancesDto {
  period: FinancesPeriod;
  orders: { count: number; revenue: number; printingCost: number; netMargin: number; netMarginPct: number };
  purchases: { count: number; total: number; gapVsPrintingCost: number };
  /** Trié par montant décroissant, pct du coût d'impression total. */
  costBreakdown: { key: CostBreakdownKey; amount: number; pct: number }[];
  /** 12 derniers mois ayant une donnée, du plus récent au plus ancien, clé yyyy-MM. */
  monthly: { month: string; revenue: number; printingCost: number; purchases: number }[];
  /** Trié par montant décroissant, pct du total des achats. */
  purchasesByCategory: { category: PurchaseCategory; amount: number; pct: number }[];
  comparison: { modeledCost: number; actualPurchases: number };
}
