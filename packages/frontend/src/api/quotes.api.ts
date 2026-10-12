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
  // Partage client (lot 4). Le jeton en clair n'est renvoyé qu'à la génération.
  share: (id: number): Promise<{ url: string }> => api.post(`/quotes/${id}/share`).then((r) => r.data),
  unshare: (id: number): Promise<void> => api.delete(`/quotes/${id}/share`).then(() => undefined),
  /** Délai long : l'envoi SMTP peut prendre jusqu'à ~40 s avant d'échouer (délais du transport). */
  shareByEmail: (id: number, body: { to: string; message: string }): Promise<{ url: string }> => api.post(`/quotes/${id}/share/email`, body, { timeout: 45_000 }).then((r) => r.data),
  markSeen: (id: number): Promise<QuoteDto> => api.post(`/quotes/${id}/response/seen`).then((r) => r.data),
  unseenCount: (): Promise<{ count: number }> => api.get('/quotes/unseen-count').then((r) => r.data),
};
