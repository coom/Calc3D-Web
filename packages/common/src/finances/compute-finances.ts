import type { PurchaseCategory } from '../constants.js';
import { COST_BREAKDOWN_KEYS, type CostBreakdownKey, type FinancePurchaseRow, type FinanceQuoteRow, type FinancesDto, type FinancesPeriod } from './types.js';

/** Même règle que Filtrer-ParPeriode (application bureau) : 12m = date ≥ maintenant − 12 mois ; year/month = même année (et mois) que maintenant. */
function inPeriod(d: Date, period: FinancesPeriod, now: Date): boolean {
  if (period === 'all') return true;
  if (period === '12m') { const limit = new Date(now); limit.setMonth(limit.getMonth() - 12); return d >= limit; }
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/**
 * Agrégats de la page Finances, portage de Refresh-Finances (application bureau). Fonction pure :
 * les montants viennent des colonnes enregistrées des devis, jamais d'un recalcul.
 * Différence assumée : le poste « coûts fixes » lit `fixedCosts` seul (qui inclut déjà les consommables),
 * là où la version bureau additionnait consommables et coûts fixes, comptant les consommables deux fois.
 */
export function computeFinances(quotes: FinanceQuoteRow[], purchases: FinancePurchaseRow[], period: FinancesPeriod, now: Date): FinancesDto {
  const orders = quotes.filter((x) => x.kind === 'ORDER' && inPeriod(new Date(x.createdAt), period, now));
  const buys = purchases.filter((x) => inPeriod(new Date(`${x.date}T00:00:00`), period, now));

  const sum = (f: (o: FinanceQuoteRow) => number) => orders.reduce((acc, o) => acc + f(o), 0);
  const revenue = sum((o) => o.finalPrice);
  const printingCost = sum((o) => o.costAfterContingency);
  const totals: Record<CostBreakdownKey, number> = {
    filament: sum((o) => o.filamentCost),
    electricity: sum((o) => o.electricityCost),
    labor: sum((o) => o.laborPrep + o.laborPost + o.laborDesign + o.laborPackaging),
    printer: sum((o) => o.depreciation + o.maintenance + o.wear),
    fixedCosts: sum((o) => o.fixedCosts),
    contingency: sum((o) => o.contingency),
  };
  const purchasesTotal = buys.reduce((acc, b) => acc + b.amount, 0);

  const byMonth = new Map<string, { revenue: number; printingCost: number; purchases: number }>();
  const bucket = (key: string) => { let m = byMonth.get(key); if (!m) { m = { revenue: 0, printingCost: 0, purchases: 0 }; byMonth.set(key, m); } return m; };
  for (const o of orders) { const m = bucket(monthKey(new Date(o.createdAt))); m.revenue += o.finalPrice; m.printingCost += o.costAfterContingency; }
  for (const b of buys) bucket(monthKey(new Date(`${b.date}T00:00:00`))).purchases += b.amount;

  const byCategory = new Map<PurchaseCategory, number>();
  for (const b of buys) byCategory.set(b.category, (byCategory.get(b.category) ?? 0) + b.amount);

  return {
    period,
    orders: { count: orders.length, revenue, printingCost, netMargin: revenue - printingCost, netMarginPct: pctOf(revenue - printingCost, revenue) },
    purchases: { count: buys.length, total: purchasesTotal, gapVsPrintingCost: purchasesTotal - printingCost },
    costBreakdown: COST_BREAKDOWN_KEYS.map((key) => ({ key, amount: totals[key], pct: pctOf(totals[key], printingCost) })).sort((a, b) => b.amount - a.amount),
    monthly: [...byMonth.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 12).map(([month, v]) => ({ month, ...v })),
    purchasesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount, pct: pctOf(amount, purchasesTotal) })).sort((a, b) => b.amount - a.amount),
    comparison: { modeledCost: printingCost, actualPurchases: purchasesTotal },
  };
}
