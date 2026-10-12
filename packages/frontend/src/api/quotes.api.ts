import api from './client';
import type { CreateQuoteBody, PricingSettings, QuoteDto, QuoteInput, QuoteResult } from '@calc3d/common';
export const quotesApi = {
  preview: (input: QuoteInput): Promise<{ result: QuoteResult; settings: PricingSettings }> => api.post('/quotes/preview', input).then((r) => r.data),
  create: (body: CreateQuoteBody): Promise<QuoteDto> => api.post('/quotes', body).then((r) => r.data),
};
