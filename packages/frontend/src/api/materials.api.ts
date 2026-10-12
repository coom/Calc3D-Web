import api from './client';
import type { MaterialDto } from '@calc3d/common';
export interface MaterialBody { name: string; pricePerKg: number }
export const materialsApi = {
  list: (): Promise<MaterialDto[]> => api.get('/materials').then((r) => r.data),
  create: (body: MaterialBody): Promise<MaterialDto> => api.post('/materials', body).then((r) => r.data),
  update: (id: number, body: MaterialBody): Promise<MaterialDto> => api.put(`/materials/${id}`, body).then((r) => r.data),
  remove: (id: number): Promise<void> => api.delete(`/materials/${id}`).then(() => undefined),
};
