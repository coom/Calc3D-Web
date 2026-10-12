import type { ClientResponse, QuoteKind, QuoteStatus, ResponseFilter } from '../constants.js';
import type { QuoteInput, QuoteResult, PricingSettings } from '../pricing/types.js';

export interface QuoteProjectFields {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus;
  /** ISO yyyy-MM-dd ou null. */
  dueDate: string | null; comment: string;
}
export type CreateQuoteBody = QuoteProjectFields & QuoteInput;
/** Partage client et réponse (lot 4). `shared` remplace le hash du jeton, jamais exposé. */
export interface QuoteShareFields {
  shared: boolean; sharedAt: string | null;
  clientResponse: ClientResponse | null; clientRespondedAt: string | null; clientComment: string;
  responseSeenAt: string | null; clientEmail: string;
}
export interface QuoteDto extends QuoteProjectFields, QuoteInput, QuoteResult, QuoteShareFields {
  id: number; createdAt: string; updatedAt: string; legacyId: string | null;
  settingsSnapshot: PricingSettings;
}
export interface QuoteListQuery { q?: string; kind?: QuoteKind; status?: QuoteStatus; response?: ResponseFilter; page: number; limit: number }
export interface QuotePage { items: QuoteDto[]; total: number; page: number; limit: number }
