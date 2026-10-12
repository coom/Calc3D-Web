import api from './client';
import type { CreateQuoteBody, PricingSettings, QuoteDto, QuoteInput, QuoteListQuery, QuotePage, QuoteResult } from '@calc3d/common';
export const quotesApi = {
  preview: (input: QuoteInput): Promise<{ result: QuoteResult; settings: PricingSettings }> => api.post('/quotes/preview', input).then((r) => r.data),
  create: (body: CreateQuoteBody): Promise<QuoteDto> => api.post('/quotes', body).then((r) => r.data),
  list: (q: QuoteListQuery): Promise<QuotePage> => api.get('/quotes', { params: q }).then((r) => r.data),
  get: (id: number): Promise<QuoteDto> => api.get(`/quotes/${id}`).then((r) => r.data),
  update: (id: number, body: CreateQuoteBody, useCurrentSettings = false): Promise<QuoteDto> => api.put(`/quotes/${id}`, body, { params: useCurrentSettings ? { useCurrentSettings: '1' } : {} }).then((r) => r.data),
  convert: (id: number): Promise<QuoteDto> => api.post(`/quotes/${id}/convert`).then((r) => r.data),
  remove: (id: number): Promise<void> => api.delete(`/quotes/${id}`).then(() => undefined),
};
