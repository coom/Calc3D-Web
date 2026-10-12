import api from './client';
import type { FinancesDto, FinancesPeriod } from '@calc3d/common';
export const financesApi = { get: (period: FinancesPeriod): Promise<FinancesDto> => api.get('/finances', { params: { period } }).then((r) => r.data) };
