import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FINANCES_PERIODS, type FinancesPeriod } from '@calc3d/common';
import { financesApi } from '@/api/finances.api';
import { settingsApi } from '@/api/settings.api';
import { formatMoney, formatNumber } from '@/lib/number';
import { monthLabel } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { BarRow } from '@/components/finances/BarRow';

const COLORS = { revenue: '#4F46E5', cost: '#F59E0B', purchases: '#DC2626' };

// Déclarés au niveau module : la règle react-hooks refuse les composants créés pendant le rendu.
const Empty = ({ text }: { text: string }) => <p className="text-xs text-muted-foreground">{text}</p>;
const Kpi = ({ title, value, sub }: { title: string; value: string; sub: string }) => (
  <Card><CardContent className="p-4"><p className="text-[10px] font-semibold tracking-widest text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold font-mono-data">{value}</p><p className="text-xs text-muted-foreground">{sub}</p></CardContent></Card>
);

/** Tableau de bord Finances : les cinq blocs de l'application bureau, sur les commandes et les achats de la période. */
export default function Finances() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<FinancesPeriod>('all');
  const { data } = useQuery({ queryKey: ['finances', period], queryFn: () => financesApi.get(period) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const cur = settings?.currencySymbol ?? '€';
  const loc = i18n.language;
  const money = (v: number) => formatMoney(v, cur, loc);
  if (!data) return <PageLoader />;
  const maxMonthly = Math.max(0, ...data.monthly.flatMap((m) => [m.revenue, m.printingCost, m.purchases]));
  const maxCost = Math.max(0, ...data.costBreakdown.map((c) => c.amount));
  const maxCat = Math.max(0, ...data.purchasesByCategory.map((c) => c.amount));
  const maxCmp = Math.max(data.comparison.modeledCost, data.comparison.actualPurchases);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><h1 className="text-xl font-semibold">{t('finances.title')}</h1><p className="text-sm text-muted-foreground">{t('finances.subtitle')}</p></div>
        <label className="text-xs">{t('finances.period')}
          <select aria-label={t('finances.period')} className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value as FinancesPeriod)}>
            {FINANCES_PERIODS.map((p) => <option key={p} value={p}>{t(`finances.periods.${p}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title={t('finances.kpi.revenue')} value={money(data.orders.revenue)} sub={t('finances.kpi.orders', { count: data.orders.count })} />
        <Kpi title={t('finances.kpi.printingCost')} value={money(data.orders.printingCost)} sub={t('finances.kpi.printingCostSub')} />
        <Kpi title={t('finances.kpi.margin')} value={money(data.orders.netMargin)} sub={t('finances.kpi.marginSub', { pct: formatNumber(data.orders.netMarginPct, loc, 1) })} />
        <Kpi title={t('finances.kpi.purchases')} value={money(data.purchases.total)} sub={t('finances.kpi.purchasesSub', { count: data.purchases.count, gap: money(data.purchases.gapVsPrintingCost) })} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.breakdown.title')}</CardTitle></CardHeader><CardContent>
          {data.orders.printingCost <= 0 ? <Empty text={t('finances.breakdown.empty')} /> : data.costBreakdown.map((c) => <BarRow key={c.key} label={`${t(`finances.breakdown.${c.key}`)} (${formatNumber(c.pct, loc, 0)} %)`} value={c.amount} max={maxCost} currency={cur} color={COLORS.cost} />)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.monthly.title')}</CardTitle></CardHeader><CardContent>
          {data.monthly.length === 0 ? <Empty text={t('finances.monthly.empty')} /> : data.monthly.map((m) => (
            <div key={m.month} className="mb-3"><p className="text-xs font-semibold">{monthLabel(m.month, loc)}</p>
              <BarRow label={t('finances.monthly.revenue')} value={m.revenue} max={maxMonthly} currency={cur} color={COLORS.revenue} />
              <BarRow label={t('finances.monthly.printingCost')} value={m.printingCost} max={maxMonthly} currency={cur} color={COLORS.cost} />
              <BarRow label={t('finances.monthly.purchases')} value={m.purchases} max={maxMonthly} currency={cur} color={COLORS.purchases} />
            </div>
          ))}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.categories.title')}</CardTitle></CardHeader><CardContent>
          {data.purchasesByCategory.length === 0 ? <Empty text={t('finances.categories.empty')} /> : data.purchasesByCategory.map((c) => <BarRow key={c.category} label={`${t(`purchases.categories.${c.category}`)} (${formatNumber(c.pct, loc, 0)} %)`} value={c.amount} max={maxCat} currency={cur} color={COLORS.purchases} />)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">{t('finances.comparison.title')}</CardTitle></CardHeader><CardContent>
          <BarRow label={t('finances.comparison.modeled')} value={data.comparison.modeledCost} max={maxCmp} currency={cur} color={COLORS.cost} />
          <BarRow label={t('finances.comparison.actual')} value={data.comparison.actualPurchases} max={maxCmp} currency={cur} color={COLORS.purchases} />
        </CardContent></Card>
      </div>
    </div>
  );
}
