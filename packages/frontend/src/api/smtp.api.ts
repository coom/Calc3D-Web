import api from './client';
import type { SmtpSettingsDto, SmtpSettingsBody } from '@calc3d/common';

export const smtpApi = {
  /** Visible de tout utilisateur connecté : seulement « activé ou non ». */
  status: (): Promise<{ enabled: boolean }> => api.get('/smtp/status').then((r) => r.data),
  get: (): Promise<SmtpSettingsDto> => api.get('/smtp').then((r) => r.data),
  update: (body: SmtpSettingsBody): Promise<SmtpSettingsDto> => api.put('/smtp', body).then((r) => r.data),
  test: (to: string): Promise<{ ok: true }> => api.post('/smtp/test', { to }).then((r) => r.data),
};
