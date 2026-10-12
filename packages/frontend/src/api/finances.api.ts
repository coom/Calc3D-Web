import api from './client';
import type { FinancesDto, FinancesPeriod } from '@calc3d/common';

/** Fuseau du navigateur, pour que les mois des Finances coïncident avec ceux de l'Historique. */
const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };

export const financesApi = { get: (period: FinancesPeriod): Promise<FinancesDto> => api.get('/finances', { params: { period, tz: browserTimeZone() } }).then((r) => r.data) };
