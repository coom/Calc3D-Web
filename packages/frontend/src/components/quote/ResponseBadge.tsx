import { useTranslation } from 'react-i18next';
import type { QuoteShareFields } from '@calc3d/common';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Badge de réponse client : accepté (vert) / refusé (rouge) / en attente (ambre) ; rien si non partagé. Pastille « Nouveau » tant que non lu. */
export function ResponseBadge({ quote, className }: { quote: QuoteShareFields; className?: string }) {
  const { t } = useTranslation();
  if (!quote.shared && !quote.clientResponse) return null;
  const state = quote.clientResponse ?? 'PENDING';
  const color = state === 'ACCEPTED'
    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : state === 'REFUSED'
      ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Badge variant="outline" className={color}>{t(`share.response.${state}`)}</Badge>
      {quote.clientResponse && !quote.responseSeenAt && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{t('share.response.unseen')}</span>}
    </span>
  );
}
