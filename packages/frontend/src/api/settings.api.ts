import api from './client';
import type { PaypalSettingsDto, UserSettingsDto } from '@calc3d/common';
export const settingsApi = {
  get: (): Promise<UserSettingsDto> => api.get('/settings').then((r) => r.data),
  update: (body: UserSettingsDto): Promise<UserSettingsDto> => api.put('/settings', body).then((r) => r.data),
  getPaypal: (): Promise<PaypalSettingsDto> => api.get('/settings/paypal').then((r) => r.data),
  updatePaypal: (body: PaypalSettingsDto): Promise<PaypalSettingsDto> => api.put('/settings/paypal', body).then((r) => r.data),
};
