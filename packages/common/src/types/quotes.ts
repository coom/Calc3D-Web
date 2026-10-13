import type { ClientResponse, PaymentMethod, QuoteKind, QuoteSortKey, QuoteStatus, ResponseFilter, SortDir } from '../constants.js';
import type { QuoteInput, QuoteResult, PricingSettings } from '../pricing/types.js';

export interface QuoteProjectFields {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus;
  /** ISO yyyy-MM-dd ou null. */
  dueDate: string | null; comment: string;
}
/**
 * `image` : data URL JPEG préparée par le navigateur (1024 px max, ≤ 400 Ko). Absente = inchangée (mise à jour),
 * null = retirée, chaîne = remplacée.
 */
export type CreateQuoteBody = QuoteProjectFields & QuoteInput & { image?: string | null };
/** Partage client et réponse (lot 4). `shared` remplace le hash du jeton, jamais exposé. */
export interface QuoteShareFields {
  shared: boolean; sharedAt: string | null;
  clientResponse: ClientResponse | null; clientRespondedAt: string | null; clientComment: string;
  responseSeenAt: string | null; clientEmail: string;
  /** Choisi par le client avec l'acceptation ; null si refusé, sans réponse ou PayPal non proposé. */
  paymentMethod: PaymentMethod | null;
  /** Commande marquée payée par le propriétaire (`PUT /:id/paid`). */
  paidAt: string | null;
  /** Posé par la conversion devis → commande ; null pour une commande créée directement ou convertie avant cette colonne. */
  convertedAt: string | null;
}
export interface QuoteDto extends QuoteProjectFields, QuoteInput, QuoteResult, QuoteShareFields {
  id: number; createdAt: string; updatedAt: string; legacyId: string | null;
  settingsSnapshot: PricingSettings;
  /** `image` (data URL JPEG) n'est renseignée que par le détail (`GET /:id`) ; la liste ne la charge jamais. */
  hasImage: boolean; image: string | null;
}
export interface QuoteListQuery { q?: string; kind?: QuoteKind; status?: QuoteStatus; response?: ResponseFilter; sort?: QuoteSortKey; dir?: SortDir; page: number; limit: number }
export interface QuotePage { items: QuoteDto[]; total: number; page: number; limit: number }
