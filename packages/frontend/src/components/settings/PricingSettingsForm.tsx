import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PRICING_MODES, type PricingMode, type UserSettingsDto } from '@calc3d/common';
import { settingsApi } from '@/api/settings.api';
import { parseLocaleNumber } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type NumericKey = Exclude<keyof UserSettingsDto, 'currencySymbol' | 'pricingMode' | 'roundToEuro' | 'pdfShowCostBreakdown'>;
const NUMERIC_FIELDS: NumericKey[] = [
  'electricityPricePerKwh', 'printerPowerW', 'averageLoadPct',
  'hourlyRatePreparation', 'hourlyRatePostProcessing', 'hourlyRateDesign', 'hourlyRatePackaging',
  'pricingPct', 'contingencyPct', 'vatPct',
  'printerPurchasePrice', 'printerLifetimeHours', 'maintenancePct', 'wearCostPerHour',
  'defaultFixedCosts', 'floorPrice',
];

interface Props { settings: UserSettingsDto; onSaved: (s: UserSettingsDto) => void }

/** Les nombres sont tenus en texte pendant la saisie (virgule acceptée) et convertis à l'enregistrement. */
export function PricingSettingsForm({ settings, onSaved }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState<Record<NumericKey, string>>(() => Object.fromEntries(NUMERIC_FIELDS.map((k) => [k, String(settings[k])])) as Record<NumericKey, string>);
  const [currency, setCurrency] = useState(settings.currencySymbol);
  const [mode, setMode] = useState<PricingMode>(settings.pricingMode);
  const [roundToEuro, setRoundToEuro] = useState(settings.roundToEuro);
  const [pdfBreakdown, setPdfBreakdown] = useState(settings.pdfShowCostBreakdown);
  const [errors, setErrors] = useState<Partial<Record<NumericKey, string>>>({});

  const save = useMutation({
    mutationFn: (body: UserSettingsDto) => settingsApi.update(body),
    onSuccess: (s) => { toast.success(t('settings.pricing.saved')); onSaved(s); },
    onError: () => toast.error(t('settings.pricing.saveFailed')),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: Partial<Record<NumericKey, number>> = {};
    const errs: Partial<Record<NumericKey, string>> = {};
    for (const k of NUMERIC_FIELDS) {
      const n = parseLocaleNumber(text[k]);
      if (n === null || n < 0) errs[k] = t('settings.pricing.invalidNumber'); else parsed[k] = n;
    }
    if (!errs.pricingPct && mode === 'TARGET_MARGIN' && (parsed.pricingPct ?? 0) >= 100) errs.pricingPct = t('settings.pricing.targetMarginTooHigh');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    save.mutate({ ...(parsed as Record<NumericKey, number>), currencySymbol: currency.trim() || '€', pricingMode: mode, roundToEuro, pdfShowCostBreakdown: pdfBreakdown });
  };

  const field = (k: NumericKey) => (
    <div key={k} className="space-y-1">
      <Label htmlFor={`ps-${k}`} className="text-xs">{t(`settings.pricing.${k}`)}</Label>
      <Input id={`ps-${k}`} inputMode="decimal" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} aria-invalid={!!errors[k]} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">{t('settings.pricing.title')}</CardTitle><p className="text-xs text-muted-foreground">{t('settings.pricing.subtitle')}</p></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ps-currencySymbol" className="text-xs">{t('settings.pricing.currencySymbol')}</Label>
            <Input id="ps-currencySymbol" value={currency} maxLength={5} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          {NUMERIC_FIELDS.slice(0, 7).map(field)}
          <div className="space-y-1">
            <Label htmlFor="ps-pricingMode" className="text-xs">{t('settings.pricing.pricingMode')}</Label>
            <select id="ps-pricingMode" value={mode} onChange={(e) => setMode(e.target.value as PricingMode)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              {PRICING_MODES.map((m) => <option key={m} value={m}>{t(m === 'MARKUP' ? 'settings.pricing.modeMarkup' : 'settings.pricing.modeTargetMargin')}</option>)}
            </select>
          </div>
          {NUMERIC_FIELDS.slice(7).map(field)}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={roundToEuro} onCheckedChange={setRoundToEuro} /> {t('settings.pricing.roundToEuro')}</label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={pdfBreakdown} onCheckedChange={setPdfBreakdown} /> {t('settings.pricing.pdfShowCostBreakdown')}</label>
        </CardContent>
      </Card>
      <Button type="submit" disabled={save.isPending}>{t('settings.pricing.save')}</Button>
    </form>
  );
}
