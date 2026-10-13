import api from './client';
import type { IndicatorsDto, IndicatorWindow } from '@calc3d/common';

/** Fuseau du navigateur : les jours, semaines et mois des Indicateurs sont ceux de l'utilisateur. */
const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };

export const indicatorsApi = { get: (days: IndicatorWindow): Promise<IndicatorsDto> => api.get('/indicators', { params: { days, tz: browserTimeZone() } }).then((r) => r.data) };
