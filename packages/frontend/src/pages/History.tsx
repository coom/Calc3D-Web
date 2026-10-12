import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { QUOTE_KINDS, QUOTE_STATUSES, type QuoteDto, type QuoteKind, type QuoteStatus } from '@calc3d/common';
import { quotesApi } from '@/api/quotes.api';
import { settingsApi } from '@/api/settings.api';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { MonthGroups } from '@/components/shared/MonthGroups';

const LIMIT = 50;
const selectClass = 'flex h-8 rounded-md border border-input bg-background px-2 text-sm';

/** Historique des devis et commandes, groupé par mois, avec filtres ; actions charger / convertir / supprimer. */
export default function History() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState(''); const [kind, setKind] = useState<QuoteKind | ''>(''); const [status, setStatus] = useState<QuoteStatus | ''>(''); const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<QuoteDto | null>(null);
  const params = { q: q || undefined, kind: kind || undefined, status: status || undefined, page, limit: LIMIT };
  const { data } = useQuery({ queryKey: ['quotes', params], queryFn: () => quotesApi.list(params) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const currency = settings?.currencySymbol ?? '€';
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['quotes'] }); qc.invalidateQueries({ queryKey: ['finances'] }); };
  const convert = useMutation({ mutationFn: quotesApi.convert, onSuccess: () => { toast.success(t('history.converted')); invalidate(); }, onError: (e: { response?: { data?: { code?: string } } }) => toast.error(t(e?.response?.data?.code === 'already_order' ? 'history.alreadyOrder' : 'history.actionFailed')) });
  const remove = useMutation({ mutationFn: quotesApi.remove, onSuccess: () => { toast.success(t('history.deleted')); setToDelete(null); invalidate(); }, onError: () => toast.error(t('history.actionFailed')) });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));
  const reset = () => setPage(1);

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('history.title')}</h1><p className="text-sm text-muted-foreground">{t('history.subtitle')}</p></div>
      <div className="flex flex-wrap gap-2">
        <Input className="h-8 w-full sm:w-64" placeholder={t('history.search')} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
        <select aria-label={t('history.cols.kind')} className={selectClass} value={kind} onChange={(e) => { setKind(e.target.value as QuoteKind | ''); reset(); }}>
          <option value="">{t('history.allKinds')}</option>{QUOTE_KINDS.map((k) => <option key={k} value={k}>{t(`quote.kinds.${k}`)}</option>)}
        </select>
        <select aria-label={t('history.cols.status')} className={selectClass} value={status} onChange={(e) => { setStatus(e.target.value as QuoteStatus | ''); reset(); }}>
          <option value="">{t('history.allStatuses')}</option>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{t(`quote.statuses.${s}`)}</option>)}
        </select>
      </div>
      <Card><CardContent className="p-4">
        {data && data.items.length === 0 ? <EmptyState title={t('history.empty')} /> : (
          <div className="overflow-x-auto">
            <MonthGroups items={data?.items ?? []} dateOf={(x) => x.createdAt} countLabel={(n) => t('history.count', { count: n })} renderItem={(x) => (
              <div key={x.id} onDoubleClick={() => navigate(`/?quote=${x.id}`)} className="grid min-w-[46rem] grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_7rem_3rem_7rem_auto] items-center gap-2 border-t px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">{formatDate(x.createdAt, i18n.language)}</span>
                <span className="truncate font-medium">{x.projectName || '—'}</span>
                <span className="truncate">{x.customer}</span>
                <Badge variant={x.kind === 'ORDER' ? 'default' : 'outline'}>{t(`quote.kinds.${x.kind}`)}</Badge>
                <span className="text-xs">{t(`quote.statuses.${x.status}`)}</span>
                <span className="text-right text-xs">{x.quantity}</span>
                <span className="text-right font-mono-data">{formatMoney(x.finalPrice, currency, i18n.language)}</span>
                <span className="flex gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('history.load')} title={t('history.load')} onClick={() => navigate(`/?quote=${x.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('history.convert')} title={t('history.convert')} disabled={x.kind === 'ORDER' || convert.isPending} onClick={() => convert.mutate(x.id)}><Repeat className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={t('history.delete')} title={t('history.delete')} onClick={() => setToDelete(x)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            )} />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t('history.hint')}</p>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
        </div>
      </CardContent></Card>
      <ConfirmDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)} title={t('history.deleteTitle')} description={t('history.deleteDescription', { name: toDelete?.projectName ?? '' })} destructive loading={remove.isPending} onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }} />
    </div>
  );
}
