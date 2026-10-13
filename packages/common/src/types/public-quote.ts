import type { ClientResponse, PaymentMethod, QuoteKind, QuoteStatus } from '../constants.js';
import type { FilamentLine } from '../pricing/types.js';

/** Ligne du détail du coût de revient, libellée côté client par sa clé i18n. */
export interface PublicCostLine { key: 'filament' | 'electricity' | 'laborPrep' | 'laborPost' | 'laborDesign' | 'laborPackaging' | 'depreciation' | 'maintenance' | 'wear' | 'fixedCosts' | 'contingency'; amount: number }

/** Ce que voit le client : strictement ce que montre le PDF. Jamais l'instantané, le mode ni le pourcentage de tarification. */
export interface PublicQuoteDto {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus; dueDate: string | null; quantity: number; comment: string;
  filamentLines: FilamentLine[]; printTimeH: number; energyKwh: number; contingencyPct: number;
  laborTotal: number; fixedCosts: number;
  costLines: PublicCostLine[] | null; costAfterContingency: number | null;
  unitPriceExclTax: number; totalExclTax: number; discountPct: number; discountAmount: number; shippingCost: number;
  vatPct: number; vatAmount: number; roundingApplied: boolean; roundingAmount: number; floorApplied: boolean; priceBeforeFloor: number; finalPrice: number;
  currencySymbol: string; ownerDisplayName: string;
  clientResponse: ClientResponse | null; clientRespondedAt: string | null;
  paymentMethod: PaymentMethod | null;
  /** Coordonnées PayPal du propriétaire, seulement s'il a activé le paiement PayPal ; sinon null et aucun choix n'est proposé. */
  paypal: PublicPaypalInfo | null;
}
export interface PublicPaypalInfo { handle: string; email: string }
export interface PublicQuoteOptions { showCostBreakdown: boolean; currencySymbol: string; ownerDisplayName: string; paypal: PublicPaypalInfo | null }
export interface PublicRespondBody { decision: ClientResponse; comment?: string; paymentMethod?: PaymentMethod }
