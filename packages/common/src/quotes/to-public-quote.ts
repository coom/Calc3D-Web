import type { QuoteDto } from '../types/quotes.js';
import type { PublicCostLine, PublicQuoteDto, PublicQuoteOptions } from '../types/public-quote.js';

/**
 * Vue client d'un devis : les mêmes sections que le PDF (Export-DevisHtml), rien d'interne.
 * Fonction pure partagée par l'API publique et la page d'impression ; les montants viennent du devis enregistré.
 */
export function toPublicQuoteDto(q: QuoteDto, opts: PublicQuoteOptions): PublicQuoteDto {
  const all: PublicCostLine[] = [
    { key: 'filament', amount: q.filamentCost }, { key: 'electricity', amount: q.electricityCost },
    { key: 'laborPrep', amount: q.laborPrep }, { key: 'laborPost', amount: q.laborPost }, { key: 'laborDesign', amount: q.laborDesign }, { key: 'laborPackaging', amount: q.laborPackaging },
    { key: 'depreciation', amount: q.depreciation }, { key: 'maintenance', amount: q.maintenance }, { key: 'wear', amount: q.wear },
    { key: 'fixedCosts', amount: q.fixedCosts }, { key: 'contingency', amount: q.contingency },
  ];
  return {
    projectName: q.projectName, customer: q.customer, kind: q.kind, status: q.status, dueDate: q.dueDate, quantity: q.quantity, comment: q.comment,
    filamentLines: q.filamentLines, printTimeH: q.printTimeH, energyKwh: q.energyKwh, contingencyPct: q.settingsSnapshot.contingencyPct,
    laborTotal: q.laborPrep + q.laborPost + q.laborDesign + q.laborPackaging, fixedCosts: q.fixedCosts,
    costLines: opts.showCostBreakdown ? all.filter((l) => l.amount > 0) : null,
    costAfterContingency: opts.showCostBreakdown ? q.costAfterContingency : null,
    unitPriceExclTax: q.unitPriceExclTax, totalExclTax: q.totalExclTax, discountPct: q.discountPct, discountAmount: q.discountAmount, shippingCost: q.shippingCost,
    vatPct: q.settingsSnapshot.vatPct, vatAmount: q.vatAmount, roundingApplied: q.roundingApplied, roundingAmount: q.roundingAmount, floorApplied: q.floorApplied, priceBeforeFloor: q.priceBeforeFloor, finalPrice: q.finalPrice,
    currencySymbol: opts.currencySymbol, ownerDisplayName: opts.ownerDisplayName,
    clientResponse: q.clientResponse, clientRespondedAt: q.clientRespondedAt,
    paymentMethod: q.paymentMethod, paypal: opts.paypal, image: q.image,
  };
}
