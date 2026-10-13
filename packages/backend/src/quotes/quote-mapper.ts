import type { Quote } from '../../generated/prisma/index.js';
import { imageDataUrl } from './quote-image.js';
import type { CreateQuoteBody, PricingSettings, QuoteResult, QuoteDto, QuoteKind, QuoteStatus, FilamentLine, FinanceQuoteRow, ClientResponse, PaymentMethod } from '@calc3d/common';

/** Données Prisma d'un devis à partir des entrées validées, de l'instantané de paramètres et du résultat serveur. */
export function buildQuoteData(userId: number, body: CreateQuoteBody, settings: PricingSettings, result: QuoteResult) {
  return {
    userId,
    projectName: body.projectName, customer: body.customer, kind: body.kind, status: body.status,
    dueDate: body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null,
    quantity: body.quantity, comment: body.comment,
    filamentLines: JSON.stringify(body.filamentLines),
    printHours: body.printHours, printMinutes: body.printMinutes,
    prepHours: body.prepHours, postHours: body.postHours, designHours: body.designHours, packagingHours: body.packagingHours,
    consumables: body.consumables, discountPct: body.discountPct, shippingCost: body.shippingCost,
    filamentWeightG: result.filamentWeightG, filamentCost: result.filamentCost, printTimeH: result.printTimeH,
    energyKwh: result.energyKwh, electricityCost: result.electricityCost,
    laborPrep: result.laborPrep, laborPost: result.laborPost, laborDesign: result.laborDesign, laborPackaging: result.laborPackaging,
    depreciation: result.depreciation, maintenance: result.maintenance, wear: result.wear, fixedCosts: result.fixedCosts,
    subtotal: result.subtotal, contingency: result.contingency, costAfterContingency: result.costAfterContingency,
    unitPriceExclTax: result.unitPriceExclTax, totalExclTax: result.totalExclTax, discountAmount: result.discountAmount,
    vatAmount: result.vatAmount, priceBeforeFloor: result.priceBeforeFloor, floorApplied: result.floorApplied,
    priceBeforeRounding: result.priceBeforeRounding, roundingAmount: result.roundingAmount, roundingApplied: result.roundingApplied,
    finalPrice: result.finalPrice, pricePerGram: result.pricePerGram, pricePerHour: result.pricePerHour,
    settingsSnapshot: JSON.stringify(settings),
  };
}

/** Ligne Prisma avec ou sans la colonne `imageData` (la liste l'omet pour ne pas charger les images). */
export type QuoteRow = Omit<Quote, 'imageData'> & { imageData?: Uint8Array | null };

/**
 * DTO propriétaire. Le hash du jeton de partage n'est jamais exposé : seul `shared` l'indique. L'image n'est
 * encodée (data URL) que sur demande (`withImage`, détail et page client) ; la liste renvoie seulement `hasImage`.
 */
export function toQuoteDto(row: QuoteRow, withImage = false): QuoteDto {
  const { userId: _userId, filamentLines, settingsSnapshot, dueDate, createdAt, updatedAt, kind, status, shareTokenHash, sharedAt, clientResponse, clientRespondedAt, responseSeenAt, paymentMethod, paidAt, convertedAt, imageData, imageMime, ...rest } = row;
  return {
    ...rest,
    kind: kind as QuoteKind, status: status as QuoteStatus,
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    filamentLines: JSON.parse(filamentLines) as FilamentLine[],
    settingsSnapshot: JSON.parse(settingsSnapshot) as PricingSettings,
    shared: shareTokenHash !== null, sharedAt: sharedAt?.toISOString() ?? null,
    clientResponse: (clientResponse as ClientResponse | null) ?? null, clientRespondedAt: clientRespondedAt?.toISOString() ?? null,
    responseSeenAt: responseSeenAt?.toISOString() ?? null,
    paymentMethod: (paymentMethod as PaymentMethod | null) ?? null,
    paidAt: paidAt?.toISOString() ?? null, convertedAt: convertedAt?.toISOString() ?? null,
    hasImage: imageMime !== null, image: withImage && imageData && imageMime ? imageDataUrl(Buffer.from(imageData), imageMime) : null,
  };
}

/** Colonnes nécessaires aux agrégats Finances (jamais recalculées). */
export function toFinanceRow(row: Pick<Quote, 'kind' | 'createdAt' | 'finalPrice' | 'costAfterContingency' | 'filamentCost' | 'electricityCost' | 'laborPrep' | 'laborPost' | 'laborDesign' | 'laborPackaging' | 'depreciation' | 'maintenance' | 'wear' | 'fixedCosts' | 'contingency'>): FinanceQuoteRow {
  const { createdAt, kind, ...rest } = row;
  return { ...rest, kind: kind as QuoteKind, createdAt: createdAt.toISOString() };
}
