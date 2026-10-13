import api from './client';

export interface ProxySettings { trustHops: number; detectedIp: string | null }

/** Profondeur de proxys de confiance (admin) : l'IP détectée est celle de la requête en cours, après application du réglage. */
export const proxyApi = {
  get: (): Promise<ProxySettings> => api.get('/proxy').then((r) => r.data),
  update: (trustHops: number): Promise<{ trustHops: number }> => api.put('/proxy', { trustHops }).then((r) => r.data),
};
