import type { QuoteKind, QuoteStatus } from '../constants.js';
import type { QuoteInput, QuoteResult, PricingSettings } from '../pricing/types.js';

export interface QuoteProjectFields {
  projectName: string; customer: string; kind: QuoteKind; status: QuoteStatus;
  /** ISO yyyy-MM-dd ou null. */
  dueDate: string | null; comment: string;
}
export type CreateQuoteBody = QuoteProjectFields & QuoteInput;
export interface QuoteDto extends QuoteProjectFields, QuoteInput, QuoteResult {
  id: number; createdAt: string; updatedAt: string; legacyId: string | null;
  settingsSnapshot: PricingSettings;
}
export interface QuoteListQuery { q?: string; kind?: QuoteKind; status?: QuoteStatus; page: number; limit: number }
export interface QuotePage { items: QuoteDto[]; total: number; page: number; limit: number }
