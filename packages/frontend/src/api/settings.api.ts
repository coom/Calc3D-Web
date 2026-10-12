import api from './client';
import type { UserSettingsDto } from '@calc3d/common';
export const settingsApi = {
  get: (): Promise<UserSettingsDto> => api.get('/settings').then((r) => r.data),
  update: (body: UserSettingsDto): Promise<UserSettingsDto> => api.put('/settings', body).then((r) => r.data),
};
