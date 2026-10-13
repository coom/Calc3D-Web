import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { INDICATOR_WINDOWS, type IndicatorCounts, type IndicatorWindow } from '@calc3d/common';
import { indicatorsApi } from '@/api/indicators.api';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { ColumnChart } from '@/components/indicators/ColumnChart';

/** Tuile d'indicateur : libellé, valeur, écart vs période précédente (signé, « − » typographique), sous-texte facultatif. */
function Kpi({ label, value, delta, sub }: { label: string; value: number; delta?: number; sub?: string }) {
  const { t } = useTranslation();
  const deltaText = delta === undefined ? '' : delta > 0 ? t('indicators.kpi.deltaUp', { n: delta }) : delta < 0 ? t('indicators.kpi.deltaDown', { n: -delta }) : t('indicators.kpi.deltaSame');
  return (
    <Card data-testid="kpi"><CardContent className="p-4">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {deltaText && <p className={`text-xs ${delta && delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : delta && delta < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{deltaText}</p>}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

/** Page Indicateurs : activité devis / commandes sur 7, 30, 90 ou 365 jours, écart avec la période précédente, évolution par jour, semaine ou mois. */
export default function Indicators() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<IndicatorWindow>(30);
  const { data, isError } = useQuery({ queryKey: ['indicators', days], queryFn: () => indicatorsApi.get(days), retry: false });
  if (isError) return <p className="text-sm text-destructive">{t('indicators.loadError')}</p>;
  if (!data) return <PageLoader />;
  const delta = (k: keyof IndicatorCounts) => data.current[k] - data.previous[k];
  // Au plus une décimale, sans zéro inutile : « 66,7 % » mais « 50 % ».
  const pct = (v: number | null, key: string) => (v === null ? t('indicators.kpi.noRate') : t(key, { pct: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(v) }));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1"><h1 className="text-xl font-semibold">{t('indicators.title')}</h1><p className="text-sm text-muted-foreground">{t('indicators.subtitle')}</p></div>
        <label className="text-xs">{t('indicators.period')}
          <select aria-label={t('indicators.period')} className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value) as IndicatorWindow)}>
            {INDICATOR_WINDOWS.map((d) => <option key={d} value={d}>{t(`indicators.periods.${d}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label={t('indicators.kpi.openOrders')} value={data.openOrders} sub={t('indicators.kpi.openOrdersSub')} />
        <Kpi label={t('indicators.kpi.newOrders')} value={data.current.newOrders} delta={delta('newOrders')} />
        <Kpi label={t('indicators.kpi.paidOrders')} value={data.current.paidOrders} delta={delta('paidOrders')} />
        <Kpi label={t('indicators.kpi.accepted')} value={data.current.accepted} delta={delta('accepted')} sub={pct(data.rates.acceptancePct, 'indicators.kpi.acceptanceRate')} />
        <Kpi label={t('indicators.kpi.refused')} value={data.current.refused} delta={delta('refused')} />
        <Kpi label={t('indicators.kpi.converted')} value={data.current.converted} delta={delta('converted')} sub={pct(data.rates.conversionPct, 'indicators.kpi.conversionRate')} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ColumnChart title={t('indicators.charts.quotes')} buckets={data.buckets} series={['accepted', 'refused', 'converted']} granularity={data.granularity} />
        <ColumnChart title={t('indicators.charts.orders')} buckets={data.buckets} series={['newOrders', 'paidOrders']} granularity={data.granularity} />
      </div>
    </div>
  );
}
