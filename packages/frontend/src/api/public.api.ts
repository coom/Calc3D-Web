import axios from 'axios';
import type { PublicQuoteDto, PublicRespondBody } from '@calc3d/common';

/** Instance sans intercepteur d'authentification : le client n'a pas de jeton et ne doit pas déclencher de rafraîchissement. */
const publicClient = axios.create({ baseURL: '/api/public', timeout: 15000, headers: { 'Content-Type': 'application/json' } });

export const publicApi = {
  get: (token: string): Promise<PublicQuoteDto> => publicClient.get(`/quotes/${encodeURIComponent(token)}`).then((r) => r.data),
  respond: (token: string, body: PublicRespondBody): Promise<PublicQuoteDto> => publicClient.post(`/quotes/${encodeURIComponent(token)}/respond`, body).then((r) => r.data),
};
