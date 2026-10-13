import { useTranslation } from 'react-i18next';
import type { IndicatorBucket, IndicatorGranularity } from '@calc3d/common';
import { formatDate, monthLabel } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type SeriesKey = 'accepted' | 'refused' | 'converted' | 'newOrders' | 'paidOrders';
/** Couleurs catégorielles fixes par série (palette validée clair / sombre) ; classes littérales pour Tailwind. */
const COLOR: Record<SeriesKey, string> = {
  accepted: 'bg-[#2a78d6] dark:bg-[#3987e5]', refused: 'bg-[#eb6834] dark:bg-[#d95926]', converted: 'bg-[#1baf7a] dark:bg-[#199e70]',
  newOrders: 'bg-[#2a78d6] dark:bg-[#3987e5]', paidOrders: 'bg-[#1baf7a] dark:bg-[#199e70]',
};

interface Props { title: string; buckets: IndicatorBucket[]; series: SeriesKey[]; granularity: IndicatorGranularity }

/**
 * Colonnes groupées par période (HTML/CSS, aucune bibliothèque) : légende, une colonne par série et par groupe,
 * valeur au survol, étiquettes d'axe espacées pour éviter les collisions, et vue tableau repliable (accessibilité).
 */
export function ColumnChart({ title, buckets, series, granularity }: Props) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const max = Math.max(0, ...buckets.flatMap((b) => series.map((s) => b[s])));
  const label = (b: IndicatorBucket) => (granularity === 'month' ? monthLabel(b.key, loc) : formatDate(b.start, loc));
  const short = (b: IndicatorBucket) => (granularity === 'month' ? new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(`${b.key}-01T12:00:00Z`)) : new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit' }).format(new Date(`${b.start}T12:00:00`)));
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ul className="flex flex-wrap gap-3 text-xs" aria-label={title}>
          {series.map((s) => <li key={s} className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 rounded-sm ${COLOR[s]}`} aria-hidden="true" />{t(`indicators.series.${s}`)}</li>)}
        </ul>
        {max === 0 ? <p className="text-xs text-muted-foreground">{t('indicators.charts.empty')}</p> : (
          <div className="flex h-40 items-end gap-1 border-b border-border">
            {buckets.map((b, i) => (
              <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch">
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  {series.map((s) => (
                    <div key={s} title={`${label(b)} · ${t(`indicators.series.${s}`)} : ${b[s]}`} className={`w-full max-w-3 rounded-t ${COLOR[s]}`} style={{ height: `${b[s] > 0 ? Math.max(3, (b[s] / max) * 100) : 0}%` }} />
                  ))}
                </div>
                <span className="h-4 truncate text-[10px] text-muted-foreground">{i % every === 0 || i === buckets.length - 1 ? short(b) : ''}</span>
              </div>
            ))}
          </div>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t('indicators.charts.table')}</summary>
          <table className="mt-2 w-full">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2 font-medium">{t('indicators.charts.bucket')}</th>{series.map((s) => <th key={s} className="py-1 pr-2 text-right font-medium">{t(`indicators.series.${s}`)}</th>)}</tr></thead>
            <tbody>{buckets.map((b) => <tr key={b.key} className="border-t border-border"><td className="py-1 pr-2">{label(b)}</td>{series.map((s) => <td key={s} className="py-1 pr-2 text-right font-mono-data tabular-nums">{b[s]}</td>)}</tr>)}</tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}
