import api from './client';
import type { DesktopImportBody, DesktopImportReport } from '@calc3d/common';

const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };

/** Import des fichiers de l'application bureau (texte lu dans le navigateur). Délai long : un historique de plusieurs Mo prend quelques secondes. */
export const importApi = {
  desktop: (body: DesktopImportBody): Promise<DesktopImportReport> => api.post('/import/desktop', body, { params: { tz: browserTimeZone() }, timeout: 120_000 }).then((r) => r.data),
};
