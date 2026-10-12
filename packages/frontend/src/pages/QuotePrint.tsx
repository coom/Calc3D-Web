import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { quotesApi } from '@/api/quotes.api';
import { settingsApi } from '@/api/settings.api';
import { formatDate } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/number';
import { PageLoader } from '@/components/shared/LoadingSpinner';

const PRINT_CSS = `
  .print-page { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; margin: 40px; max-width: 800px; }
  .print-page h1 { font-size: 22px; margin-bottom: 0; } .print-page h3 { font-size: 15px; margin: 18px 0 8px; }
  .print-page .sous-titre { color: #6B7280; font-size: 13px; margin: 2px 0 24px; }
  .print-page table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  .print-page th, .print-page td { text-align: left; padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #E5E7EB; }
  .print-page th { background: #F9FAFB; color: #6B7280; font-weight: 600; } .print-page td.montant { text-align: right; }
  .print-page .info-table td:first-child { color: #6B7280; width: 160px; }
  .print-page .final { background: #EEF2FF; padding: 14px 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
  .print-page .final .label { color: #4F46E5; font-weight: 600; } .print-page .final .valeur { color: #4F46E5; font-weight: 700; font-size: 22px; }
  .print-page .note { color: #6B7280; font-size: 11px; } .print-page .commentaire { margin-top: 16px; white-space: pre-wrap; }
  .print-page .toolbar { margin-bottom: 16px; } .print-page .toolbar button { padding: 6px 12px; border: 1px solid #D1D5DB; border-radius: 6px; background: #F9FAFB; cursor: pointer; }
  @media print { .print-page { margin: 15mm; } .print-page .toolbar { display: none; } }
`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const style = strong ? { fontWeight: 700 } : undefined;
  return <tr><td style={style}>{label}</td><td className="montant" style={style}>{value}</td></tr>;
}

/**
 * Page HTML imprimable du devis, équivalent de Export-DevisHtml (application bureau) : infos client, détail des
 * matières, détail du coût de revient si l'option est active, tarification, prix final. Jamais le mode de
 * tarification ni la marge. Les montants sont ceux enregistrés (pas de recalcul). Tous les textes libres passent
 * par React (échappés). window.print() au chargement, sauf ?noprint=1 (tests).
 */
export default function QuotePrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, i18n } = useTranslation();
  const quoteId = /^\d+$/.test(id ?? '') ? Number(id) : null;
  const quoteQ = useQuery({ queryKey: ['quote', quoteId], queryFn: () => quotesApi.get(quoteId!), enabled: quoteId !== null, retry: false, staleTime: 0 });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const ready = !!quoteQ.data && !!settingsQ.data;
  useEffect(() => {
    if (ready && params.get('noprint') !== '1') { const h = setTimeout(() => window.print(), 300); return () => clearTimeout(h); }
  }, [ready, params]);

  if (quoteId === null || quoteQ.isError) return <p style={{ fontFamily: 'sans-serif', padding: 40 }}>{t('print.notFound')}</p>;
  if (!ready) return <PageLoader />;
  const q = quoteQ.data!; const s = q.settingsSnapshot; const loc = i18n.language;
  const cur = settingsQ.data!.currencySymbol;
  const money = (v: number) => formatMoney(v, cur, loc);
  const costLines: { label: string; value: number }[] = [
    { label: t('print.lines.filament'), value: q.filamentCost },
    { label: t('print.lines.electricity', { hours: formatNumber(q.printTimeH, loc, 2), kwh: formatNumber(q.energyKwh, loc, 3) }), value: q.electricityCost },
    { label: t('print.lines.laborPrep'), value: q.laborPrep }, { label: t('print.lines.laborPost'), value: q.laborPost },
    { label: t('print.lines.laborDesign'), value: q.laborDesign }, { label: t('print.lines.laborPackaging'), value: q.laborPackaging },
    { label: t('print.lines.depreciation'), value: q.depreciation }, { label: t('print.lines.maintenance'), value: q.maintenance }, { label: t('print.lines.wear'), value: q.wear },
    { label: t('print.lines.fixedCosts'), value: q.fixedCosts },
    { label: t('print.lines.contingency', { pct: formatNumber(s.contingencyPct, loc, 0) }), value: q.contingency },
  ].filter((l) => l.value > 0);
  const laborTotal = q.laborPrep + q.laborPost + q.laborDesign + q.laborPackaging;
  const showBreakdown = settingsQ.data!.pdfShowCostBreakdown;
  return (
    <div className="print-page">
      <style>{PRINT_CSS}</style>
      <div className="toolbar"><button type="button" onClick={() => window.print()}>{t('print.print')}</button></div>
      <h1>{t('print.title', { name: q.projectName })}</h1>
      <p className="sous-titre">{t('print.generated', { date: new Date().toLocaleString(loc) })}</p>
      <table className="info-table"><tbody>
        <tr><td>{t('print.customer')}</td><td>{q.customer}</td></tr>
        <tr><td>{t('print.dueDate')}</td><td>{q.dueDate ? formatDate(q.dueDate, loc) : '—'}</td></tr>
        <tr><td>{t('print.status')}</td><td>{t(`quote.statuses.${q.status}`)}</td></tr>
        <tr><td>{t('print.quantity')}</td><td>{q.quantity}</td></tr>
      </tbody></table>
      <h3>{t('print.itemBreakdown')}</h3>
      <table><thead><tr><th>{t('print.material')}</th><th>{t('print.weight')}</th><th>{t('print.pricePerKg')}</th><th>{t('print.waste')}</th><th>{t('print.cost')}</th></tr></thead>
        <tbody>{q.filamentLines.filter((l) => l.weightG > 0).map((l, i) => (
          <tr key={i}><td>{l.material}</td><td>{formatNumber(l.weightG, loc, 1)} g</td><td>{formatNumber(l.pricePerKg, loc, 2)} {cur}/kg</td><td>{formatNumber(l.wastePct, loc, 0)} %</td><td className="montant">{money((l.weightG / 1000) * l.pricePerKg * (1 + l.wastePct / 100))}</td></tr>
        ))}</tbody></table>
      {showBreakdown ? (
        <>
          <h3>{t('print.costBreakdown')}</h3>
          <table><tbody>{costLines.map((l) => <Row key={l.label} label={l.label} value={money(l.value)} />)}<Row label={t('print.costPrice')} value={money(q.costAfterContingency)} strong /></tbody></table>
        </>
      ) : (laborTotal > 0 || q.fixedCosts > 0) && (
        <table><tbody>{laborTotal > 0 && <Row label={t('print.labor')} value={money(laborTotal)} />}{q.fixedCosts > 0 && <Row label={t('print.consumables')} value={money(q.fixedCosts)} />}</tbody></table>
      )}
      <h3>{t('print.pricing')}</h3>
      <table><tbody>
        <Row label={t('print.unitPrice')} value={money(q.unitPriceExclTax)} />
        <Row label={t('print.quantity')} value={String(q.quantity)} />
        <Row label={t('print.subtotal')} value={money(q.totalExclTax)} strong />
        <Row label={t('print.discount', { pct: formatNumber(q.discountPct, loc, 0) })} value={`-${money(q.discountAmount)}`} />
        <Row label={t('print.shipping')} value={money(q.shippingCost)} />
        {s.vatPct > 0 && <Row label={t('print.vat', { pct: formatNumber(s.vatPct, loc, 0) })} value={money(q.vatAmount)} />}
        {q.roundingApplied && <Row label={t('print.rounding')} value={`+${money(q.roundingAmount)}`} />}
      </tbody></table>
      <div className="final"><span className="label">{t('print.finalPrice')}</span><span className="valeur" data-testid="print-final">{money(q.finalPrice)}</span></div>
      {q.floorApplied && <p className="note">{t('print.floorNote', { price: money(q.priceBeforeFloor) })}</p>}
      {q.comment.trim() && <div className="commentaire"><strong>{t('print.comment')}</strong><p>{q.comment}</p></div>}
    </div>
  );
}
