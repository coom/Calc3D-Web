import { useTranslation } from 'react-i18next';
import type { PricingSettings, QuoteInput, QuoteResult } from '@calc3d/common';
import { formatMoney, formatNumber } from '@/lib/number';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props { result: QuoteResult | null; settings: PricingSettings; input: QuoteInput }

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 py-1 text-sm ${strong ? 'font-semibold' : ''}`}><span>{label}</span><span className="font-mono-data tabular-nums">{value}</span></div>
);
const Sep = () => <hr className="my-1 border-border" />;

/** Décomposition du calcul, même ordre que la page Devis de l'application bureau. result null = formulaire en erreur. */
export function QuoteResultPanel({ result, settings, input }: Props) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const money = (v: number, d = 2) => formatMoney(v, settings.currencySymbol, loc, d);
  if (!result) {
    return <Card><CardHeader><CardTitle className="text-sm font-medium">{t('quote.result.title')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t('quote.result.invalid')}</p></CardContent></Card>;
  }
  const r = result;
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('quote.result.title')}</CardTitle></CardHeader>
      <CardContent>
        <Row label={t('quote.result.filament', { weight: formatNumber(r.filamentWeightG, loc, 1) })} value={money(r.filamentCost)} />
        <Row label={t('quote.result.electricity', { hours: formatNumber(r.printTimeH, loc, 2), kwh: formatNumber(r.energyKwh, loc, 3) })} value={money(r.electricityCost)} />
        <Row label={t('quote.result.laborPrep')} value={money(r.laborPrep)} />
        <Row label={t('quote.result.laborPost')} value={money(r.laborPost)} />
        <Row label={t('quote.result.laborDesign')} value={money(r.laborDesign)} />
        <Row label={t('quote.result.laborPackaging')} value={money(r.laborPackaging)} />
        <Row label={t('quote.result.depreciation')} value={money(r.depreciation)} />
        <Row label={t('quote.result.maintenance')} value={money(r.maintenance)} />
        <Row label={t('quote.result.wear')} value={money(r.wear)} />
        <Row label={t('quote.result.fixedCosts')} value={money(r.fixedCosts)} />
        <Sep />
        <Row label={t('quote.result.subtotal')} value={money(r.subtotal)} strong />
        <Row label={t('quote.result.contingency', { pct: formatNumber(settings.contingencyPct, loc, 0) })} value={money(r.contingency)} />
        <Row label={t('quote.result.costAfterContingency')} value={money(r.costAfterContingency)} strong />
        <Sep />
        <Row label={t('quote.result.pricingMode')} value={`${t(settings.pricingMode === 'MARKUP' ? 'settings.pricing.modeMarkup' : 'settings.pricing.modeTargetMargin')} (${formatNumber(settings.pricingPct, loc, 0)} %)`} />
        <Row label={t('quote.result.unitPriceExclTax')} value={money(r.unitPriceExclTax)} />
        <Row label={t('quote.result.quantity')} value={String(input.quantity)} />
        <Row label={t('quote.result.totalExclTax')} value={money(r.totalExclTax)} />
        <Row label={t('quote.result.discount', { pct: formatNumber(input.discountPct, loc, 0) })} value={`-${money(r.discountAmount)}`} />
        <Row label={t('quote.result.shipping')} value={money(r.shippingCost)} />
        {settings.vatPct > 0 && <Row label={t('quote.result.vat', { pct: formatNumber(settings.vatPct, loc, 0) })} value={money(r.vatAmount)} />}
        {r.roundingApplied && <Row label={t('quote.result.rounding')} value={`+${money(r.roundingAmount)}`} />}
        <Sep />
        <Row label={t('quote.result.pricePerGram')} value={money(r.pricePerGram, 4)} />
        <Row label={t('quote.result.pricePerHour')} value={money(r.pricePerHour)} />
        <div className="mt-3 flex items-center justify-between rounded-md bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold text-primary">{t('quote.result.finalPrice')}</span>
          <span className="text-2xl font-bold text-primary font-mono-data" data-testid="final-price">{money(r.finalPrice)}</span>
        </div>
        {r.floorApplied && <p className="mt-1 text-xs text-muted-foreground">{t('quote.result.floorApplied', { price: money(r.priceBeforeFloor) })}</p>}
      </CardContent>
    </Card>
  );
}
