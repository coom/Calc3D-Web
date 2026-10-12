import api from './client';
import type { PurchaseBody, PurchaseCategory, PurchaseDto, PurchasePage } from '@calc3d/common';
export interface PurchaseListQuery { q?: string; category?: PurchaseCategory; page: number; limit: number }
export const purchasesApi = {
  list: (q: PurchaseListQuery): Promise<PurchasePage> => api.get('/purchases', { params: q }).then((r) => r.data),
  create: (body: PurchaseBody): Promise<PurchaseDto> => api.post('/purchases', body).then((r) => r.data),
  update: (id: number, body: PurchaseBody): Promise<PurchaseDto> => api.put(`/purchases/${id}`, body).then((r) => r.data),
  remove: (id: number): Promise<void> => api.delete(`/purchases/${id}`).then(() => undefined),
};
