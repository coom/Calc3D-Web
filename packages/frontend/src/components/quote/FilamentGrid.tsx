import { useTranslation } from 'react-i18next';
import { Plus, Minus } from 'lucide-react';
import type { MaterialDto } from '@calc3d/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseLocaleNumber, formatNumber } from '@/lib/number';
import { emptyLine, type FilamentLineText, type QuoteFormError } from './quote-form-state';

interface Props { lines: FilamentLineText[]; materials: MaterialDto[]; errors: QuoteFormError[]; onChange: (lines: FilamentLineText[]) => void }

/** Grille filament : une ligne par matière ; choisir une matière préremplit son prix au kg depuis le catalogue. */
export function FilamentGrid({ lines, materials, errors, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const set = (i: number, patch: Partial<FilamentLineText>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i: number, material: string) => {
    const m = materials.find((x) => x.name === material);
    set(i, { material, pricePerKg: m ? String(m.pricePerKg) : lines[i].pricePerKg });
  };
  const lineCost = (l: FilamentLineText) => {
    const w = parseLocaleNumber(l.weightG) ?? 0; const p = parseLocaleNumber(l.pricePerKg) ?? 0; const waste = parseLocaleNumber(l.wastePct) ?? 0;
    return w > 0 ? (w / 1000) * p * (1 + waste / 100) : 0;
  };
  const err = (key: QuoteFormError) => errors.includes(key);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">{t('quote.filament.material')}</th><th>{t('quote.filament.weightG')}</th><th>{t('quote.filament.pricePerKg')}</th><th>{t('quote.filament.wastePct')}</th><th className="text-right">{t('quote.filament.cost')}</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-2">
                  <select aria-label={t('quote.filament.material')} value={l.material} onChange={(e) => pick(i, e.target.value)} className="flex h-9 w-full min-w-[8rem] rounded-md border border-input bg-background px-2 text-sm">
                    {!materials.some((m) => m.name === l.material) && <option value={l.material}>{l.material}</option>}
                    {materials.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </td>
                <td className="py-1 pr-2"><Input aria-label={t('quote.filament.weightG')} inputMode="decimal" className="w-24" value={l.weightG} aria-invalid={err(`lines.${i}.weightG`)} onChange={(e) => set(i, { weightG: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input aria-label={t('quote.filament.pricePerKg')} inputMode="decimal" className="w-24" value={l.pricePerKg} aria-invalid={err(`lines.${i}.pricePerKg`)} onChange={(e) => set(i, { pricePerKg: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input aria-label={t('quote.filament.wastePct')} inputMode="decimal" className="w-20" value={l.wastePct} aria-invalid={err(`lines.${i}.wastePct`)} onChange={(e) => set(i, { wastePct: e.target.value })} /></td>
                <td className="py-1 text-right font-mono-data text-xs">{formatNumber(lineCost(l), i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, emptyLine(materials[0]?.name ?? 'PLA', materials[0] ? String(materials[0].pricePerKg) : '')])}><Plus className="mr-1 h-4 w-4" />{t('quote.filament.addLine')}</Button>
        <Button type="button" size="sm" variant="outline" disabled={lines.length <= 1} onClick={() => onChange(lines.slice(0, -1))}><Minus className="mr-1 h-4 w-4" />{t('quote.filament.removeLine')}</Button>
      </div>
    </div>
  );
}
