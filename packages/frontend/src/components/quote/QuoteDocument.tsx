import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicCostLine, PublicQuoteDto } from '@calc3d/common';
import { formatDate } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/number';

export const DOCUMENT_CSS = `
  html, body { background: #fff !important; color: #111827; }
  .print-page { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; margin: 40px; padding-bottom: 24px; max-width: 800px; }
  .print-page h1 { font-size: 22px; margin-bottom: 0; } .print-page h3 { font-size: 15px; margin: 18px 0 8px; }
  .print-page .sous-titre { color: #6B7280; font-size: 13px; margin: 2px 0 24px; }
  .print-page table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
  .print-page th, .print-page td { text-align: left; padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #E5E7EB; }
  .print-page th { background: #F9FAFB; color: #6B7280; font-weight: 600; } .print-page td.montant { text-align: right; }
  .print-page .info-table td:first-child { color: #6B7280; width: 160px; }
  .print-page .final { background: #EEF2FF; padding: 14px 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
  .print-page .final .label { color: #4F46E5; font-weight: 600; } .print-page .final .valeur { color: #4F46E5; font-weight: 700; font-size: 22px; }
  .print-page .note { color: #6B7280; font-size: 11px; } .print-page .commentaire { margin-top: 16px; white-space: pre-wrap; }
  .print-page .toolbar { margin-bottom: 16px; display: flex; align-items: center; gap: 12px; } .print-page .toolbar button { padding: 6px 12px; border: 1px solid #D1D5DB; border-radius: 6px; background: #F9FAFB; cursor: pointer; }
  @media print { .print-page { margin: 15mm; } .print-page .toolbar { display: none; } }
`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const style = strong ? { fontWeight: 700 } : undefined;
  return <tr><td style={style}>{label}</td><td className="montant" style={style}>{value}</td></tr>;
}

/**
 * Document devis destiné au client, équivalent de Export-DevisHtml (application bureau) : infos client, détail
 * des matières, détail du coût de revient s'il est fourni, tarification, prix final. La page d'impression et la
 * page publique partagent ce rendu. Les montants viennent du DTO (jamais recalculés) ; jamais le mode de
 * tarification ni la marge. Tous les textes libres passent par React (échappés).
 */
export function QuoteDocument({ data, generatedAt, toolbar }: { data: PublicQuoteDto; generatedAt?: Date; toolbar?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language; const q = data; const cur = q.currencySymbol;
  const money = (v: number) => formatMoney(v, cur, loc);
  const lineLabel = (l: PublicCostLine) =>
    l.key === 'electricity' ? t('print.lines.electricity', { hours: formatNumber(q.printTimeH, loc, 2), kwh: formatNumber(q.energyKwh, loc, 3) })
      : l.key === 'contingency' ? t('print.lines.contingency', { pct: formatNumber(q.contingencyPct, loc, 0) })
        : t(`print.lines.${l.key}`);
  return (
    <div className="print-page">
      <style>{DOCUMENT_CSS}</style>
      {toolbar && <div className="toolbar">{toolbar}</div>}
      <h1>{t('print.title', { name: q.projectName })}</h1>
      {generatedAt && <p className="sous-titre">{t('print.generated', { date: generatedAt.toLocaleString(loc) })}</p>}
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
      {q.costLines ? (
        <>
          <h3>{t('print.costBreakdown')}</h3>
          <table><tbody>{q.costLines.map((l) => <Row key={l.key} label={lineLabel(l)} value={money(l.amount)} />)}<Row label={t('print.costPrice')} value={money(q.costAfterContingency ?? 0)} strong /></tbody></table>
        </>
      ) : (q.laborTotal > 0 || q.fixedCosts > 0) && (
        <table><tbody>{q.laborTotal > 0 && <Row label={t('print.labor')} value={money(q.laborTotal)} />}{q.fixedCosts > 0 && <Row label={t('print.consumables')} value={money(q.fixedCosts)} />}</tbody></table>
      )}
      <h3>{t('print.pricing')}</h3>
      <table><tbody>
        <Row label={t('print.unitPrice')} value={money(q.unitPriceExclTax)} />
        <Row label={t('print.quantity')} value={String(q.quantity)} />
        <Row label={t('print.subtotal')} value={money(q.totalExclTax)} strong />
        <Row label={t('print.discount', { pct: formatNumber(q.discountPct, loc, 0) })} value={`-${money(q.discountAmount)}`} />
        <Row label={t('print.shipping')} value={money(q.shippingCost)} />
        {q.vatPct > 0 && <Row label={t('print.vat', { pct: formatNumber(q.vatPct, loc, 0) })} value={money(q.vatAmount)} />}
        {q.roundingApplied && <Row label={t('print.rounding')} value={`+${money(q.roundingAmount)}`} />}
      </tbody></table>
      <div className="final"><span className="label">{t('print.finalPrice')}</span><span className="valeur" data-testid="print-final">{money(q.finalPrice)}</span></div>
      {q.floorApplied && <p className="note">{t('print.floorNote', { price: money(q.priceBeforeFloor) })}</p>}
      {q.comment.trim() && <div className="commentaire"><strong>{t('print.comment')}</strong><p>{q.comment}</p></div>}
    </div>
  );
}
