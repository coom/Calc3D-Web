import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/number';

interface Props { label: string; value: number; max: number; currency: string; color: string }

/** Barre horizontale proportionnelle, équivalent de New-LigneBarre (application bureau). */
export function BarRow({ label, value, max, currency, color }: Props) {
  const { i18n } = useTranslation();
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="py-1">
      <div className="flex justify-between gap-4 text-xs"><span data-testid="bar-label">{label}</span><span className="font-mono-data tabular-nums">{formatMoney(value, currency, i18n.language)}</span></div>
      <div className="mt-1 h-2 w-full rounded bg-muted"><div className="h-2 rounded" style={{ width: `${width}%`, backgroundColor: color }} /></div>
    </div>
  );
}
