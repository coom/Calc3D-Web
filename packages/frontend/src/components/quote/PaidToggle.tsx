import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { QuoteDto } from '@calc3d/common';
import { quotesApi } from '@/api/quotes.api';
import { formatDate } from '@/lib/dates';
import { Switch } from '@/components/ui/switch';

interface Props { quote: QuoteDto; onChanged: () => void; compact?: boolean }

/** Interrupteur « Payée » d'une commande (jamais rendu pour un devis) : marque la date du jour ou l'efface. */
export function PaidToggle({ quote, onChanged, compact }: Props) {
  const { t, i18n } = useTranslation();
  const toggle = useMutation({
    mutationFn: (paid: boolean) => quotesApi.setPaid(quote.id, paid),
    onSuccess: (_r, paid) => { toast.success(t(paid ? 'history.paid.toastOn' : 'history.paid.toastOff')); onChanged(); },
    onError: () => toast.error(t('history.paid.failed')),
  });
  if (quote.kind !== 'ORDER') return null;
  const paid = !!quote.paidAt;
  const text = paid ? t('history.paid.on', { date: formatDate(quote.paidAt ?? '', i18n.language) }) : t('history.paid.off');
  return (
    <span className="inline-flex items-center gap-2">
      <Switch aria-label={t('history.paid.label')} checked={paid} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate(v)} />
      <span className={compact ? 'text-[10px] text-muted-foreground' : 'text-xs'}>{text}</span>
    </span>
  );
}
