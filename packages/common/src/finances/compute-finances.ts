import type { PurchaseCategory } from '../constants.js';
import { COST_BREAKDOWN_KEYS, type CostBreakdownKey, type FinancePurchaseRow, type FinanceQuoteRow, type FinancesDto, type FinancesPeriod } from './types.js';

/** Année et mois d'un instant, dans le fuseau demandé (celui du navigateur de l'utilisateur, pas celui du serveur). */
function yearMonth(d: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { year, month };
}
/** Une date seule (yyyy-MM-dd) est un jour calendaire : son mois ne dépend d'aucun fuseau. */
const dateOnlyYearMonth = (date: string) => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });

/** Même règle que Filtrer-ParPeriode (application bureau) : 12m = instant ≥ maintenant − 12 mois ; year/month = même année (et mois) que maintenant. */
function inPeriod(ym: { year: number; month: number }, instant: Date, period: FinancesPeriod, now: Date, nowYm: { year: number; month: number }): boolean {
  if (period === 'all') return true;
  if (period === '12m') { const limit = new Date(now); limit.setUTCMonth(limit.getUTCMonth() - 12); return instant >= limit; }
  if (period === 'year') return ym.year === nowYm.year;
  return ym.year === nowYm.year && ym.month === nowYm.month;
}
const monthKey = (ym: { year: number; month: number }) => `${ym.year}-${String(ym.month).padStart(2, '0')}`;
const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/**
 * Agrégats de la page Finances, portage de Refresh-Finances (application bureau). Fonction pure :
 * les montants viennent des colonnes enregistrées des devis, jamais d'un recalcul. Les mois sont
 * calculés dans `timeZone` (fuseau du navigateur) pour coïncider avec le regroupement de l'Historique.
 * Différence assumée : le poste « coûts fixes » lit `fixedCosts` seul (qui inclut déjà les consommables),
 * là où la version bureau additionnait consommables et coûts fixes, comptant les consommables deux fois.
 */
export function computeFinances(quotes: FinanceQuoteRow[], purchases: FinancePurchaseRow[], period: FinancesPeriod, now: Date, timeZone = 'UTC'): FinancesDto {
  const nowYm = yearMonth(now, timeZone);
  const orders = quotes
    .map((x) => ({ row: x, instant: new Date(x.createdAt), ym: yearMonth(new Date(x.createdAt), timeZone) }))
    .filter((x) => x.row.kind === 'ORDER' && inPeriod(x.ym, x.instant, period, now, nowYm));
  const buys = purchases
    .map((x) => ({ row: x, instant: new Date(`${x.date}T12:00:00Z`), ym: dateOnlyYearMonth(x.date) }))
    .filter((x) => inPeriod(x.ym, x.instant, period, now, nowYm));

  const sum = (f: (o: FinanceQuoteRow) => number) => orders.reduce((acc, o) => acc + f(o.row), 0);
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
  const purchasesTotal = buys.reduce((acc, b) => acc + b.row.amount, 0);

  const byMonth = new Map<string, { revenue: number; printingCost: number; purchases: number }>();
  const bucket = (key: string) => { let m = byMonth.get(key); if (!m) { m = { revenue: 0, printingCost: 0, purchases: 0 }; byMonth.set(key, m); } return m; };
  for (const o of orders) { const m = bucket(monthKey(o.ym)); m.revenue += o.row.finalPrice; m.printingCost += o.row.costAfterContingency; }
  for (const b of buys) bucket(monthKey(b.ym)).purchases += b.row.amount;

  const byCategory = new Map<PurchaseCategory, number>();
  for (const b of buys) byCategory.set(b.row.category, (byCategory.get(b.row.category) ?? 0) + b.row.amount);

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
