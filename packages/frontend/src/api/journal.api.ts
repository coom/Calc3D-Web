import api from './client';
import type { JournalRetention, Page, WebLoginEntry } from '@calc3d/common';

export interface JournalQuery { q?: string; from?: string; to?: string; page: number; limit: number }

export const journalApi = {
  web: (p: JournalQuery): Promise<Page<WebLoginEntry>> => api.get('/journal/web', { params: p }).then((r) => r.data),
  retention: (): Promise<JournalRetention> => api.get('/journal/retention').then((r) => r.data),
  setRetention: (days: number): Promise<JournalRetention> => api.put('/journal/retention', { days }).then((r) => r.data),
};
