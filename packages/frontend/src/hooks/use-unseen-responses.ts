import { useQuery } from '@tanstack/react-query';
import { quotesApi } from '@/api/quotes.api';

/** Nombre de réponses client non lues ; la clé ['quotes', 'unseen'] est invalidée avec ['quotes']. */
export function useUnseenResponses(): number {
  const q = useQuery({ queryKey: ['quotes', 'unseen'], queryFn: quotesApi.unseenCount, refetchInterval: 60_000, staleTime: 30_000 });
  return q.data?.count ?? 0;
}
