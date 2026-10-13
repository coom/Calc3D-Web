import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Repeat, Trash2 } from 'lucide-react';
import { QUOTE_KINDS, QUOTE_STATUSES, RESPONSE_FILTERS, type QuoteDto, type QuoteKind, type QuoteSortKey, type QuoteStatus, type ResponseFilter, type SortDir } from '@calc3d/common';
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
import { ResponseBadge } from '@/components/quote/ResponseBadge';
import { PaidToggle } from '@/components/quote/PaidToggle';

const LIMIT = 50;
const selectClass = 'flex h-8 rounded-md border border-input bg-background px-2 text-sm';
const GRID = 'grid min-w-[64rem] grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_7rem_9rem_3rem_7rem_9rem_auto] items-center gap-2 px-3';
/** Colonnes triables, dans l'ordre d'affichage ; le sens par défaut est décroissant pour la date, croissant sinon. */
const SORTABLE: { key: QuoteSortKey; label: string }[] = [
  { key: 'createdAt', label: 'history.sort.date' }, { key: 'projectName', label: 'history.sort.project' }, { key: 'customer', label: 'history.sort.customer' },
  { key: 'kind', label: 'history.sort.kind' }, { key: 'status', label: 'history.sort.status' },
];

/**
 * Historique des devis et commandes avec filtres et tri par colonne. Trié par date, les lignes sont groupées
 * par mois (repliables) ; trié autrement, liste plate. Actions : charger / convertir / supprimer / payée.
 */
export default function History() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState(''); const [kind, setKind] = useState<QuoteKind | ''>(''); const [status, setStatus] = useState<QuoteStatus | ''>(''); const [response, setResponse] = useState<ResponseFilter | ''>(''); const [page, setPage] = useState(1);
  const [sort, setSort] = useState<QuoteSortKey>('createdAt'); const [dir, setDir] = useState<SortDir>('desc');
  const [toDelete, setToDelete] = useState<QuoteDto | null>(null);
  const params = { q: q || undefined, kind: kind || undefined, status: status || undefined, response: response || undefined, sort, dir, page, limit: LIMIT };
  const { data } = useQuery({ queryKey: ['quotes', params], queryFn: () => quotesApi.list(params) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const currency = settings?.currencySymbol ?? '€';
  // ['quote'] : le détail chargé par la page Devis ; sans cette invalidation, un devis converti ou supprimé pourrait être rechargé périmé et « mis à jour » avec son ancien type.
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['quotes'] }); qc.invalidateQueries({ queryKey: ['quote'] }); qc.invalidateQueries({ queryKey: ['finances'] }); qc.invalidateQueries({ queryKey: ['indicators'] }); };
  const convert = useMutation({ mutationFn: quotesApi.convert, onSuccess: () => { toast.success(t('history.converted')); invalidate(); }, onError: (e: { response?: { data?: { code?: string } } }) => toast.error(t(e?.response?.data?.code === 'already_order' ? 'history.alreadyOrder' : 'history.actionFailed')) });
  const remove = useMutation({ mutationFn: quotesApi.remove, onSuccess: () => { toast.success(t('history.deleted')); setToDelete(null); invalidate(); }, onError: () => toast.error(t('history.actionFailed')) });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));
  const reset = () => setPage(1);
  const sortBy = (key: QuoteSortKey) => {
    if (key === sort) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir(key === 'createdAt' ? 'desc' : 'asc'); }
    reset();
  };
  const SortIcon = ({ k }: { k: QuoteSortKey }) => (k !== sort ? <ArrowUpDown className="h-3 w-3 opacity-50" /> : dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />);
  const header = (k: QuoteSortKey, align = '') => {
    const col = SORTABLE.find((c) => c.key === k)!;
    return <button type="button" onClick={() => sortBy(k)} aria-sort={k === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground ${align}`}>{t(col.label)}<SortIcon k={k} /></button>;
  };
  const row = (x: QuoteDto) => (
    <div key={x.id} onDoubleClick={() => navigate(`/?quote=${x.id}`)} className={`${GRID} border-t py-2 text-sm`}>
      <span className="text-xs text-muted-foreground">{formatDate(x.createdAt, i18n.language)}</span>
      <span className="truncate font-medium">{x.projectName || '—'}</span>
      <span className="truncate">{x.customer}</span>
      <Badge variant={x.kind === 'ORDER' ? 'default' : 'outline'}>{t(`quote.kinds.${x.kind}`)}</Badge>
      <span className="text-xs">{t(`quote.statuses.${x.status}`)}</span>
      <span><ResponseBadge quote={x} /></span>
      <span className="text-right text-xs">{x.quantity}</span>
      <span className="text-right font-mono-data">{formatMoney(x.finalPrice, currency, i18n.language)}</span>
      <span>{x.kind === 'ORDER' && <PaidToggle quote={x} onChanged={invalidate} compact />}</span>
      <span className="flex gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('history.load')} title={t('history.load')} onClick={() => navigate(`/?quote=${x.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('history.convert')} title={t('history.convert')} disabled={x.kind === 'ORDER' || convert.isPending} onClick={() => convert.mutate(x.id)}><Repeat className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={t('history.delete')} title={t('history.delete')} onClick={() => setToDelete(x)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </span>
    </div>
  );
  const items = data?.items ?? [];

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
        <select aria-label={t('share.filter.label')} className={selectClass} value={response} onChange={(e) => { setResponse(e.target.value as ResponseFilter | ''); reset(); }}>
          <option value="">{t('share.filter.all')}</option>{RESPONSE_FILTERS.map((r) => <option key={r} value={r}>{t(`share.filter.${r}`)}</option>)}
        </select>
      </div>
      <Card><CardContent className="p-4">
        {data && items.length === 0 ? <EmptyState title={t('history.empty')} /> : (
          <div className="overflow-x-auto">
            <div className={`${GRID} pb-2`}>
              {header('createdAt')}{header('projectName')}{header('customer')}{header('kind')}{header('status')}
              <span /><span /><span /><span className="text-xs font-medium text-muted-foreground">{t('history.paid.label')}</span><span />
            </div>
            {sort === 'createdAt'
              ? <MonthGroups items={items} dateOf={(x) => x.createdAt} countLabel={(n) => t('history.count', { count: n })} renderItem={row} />
              : <div className="rounded-md border border-border">{items.map(row)}</div>}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t('history.hint')} {t('history.sort.hint')}</p>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
        </div>
      </CardContent></Card>
      <ConfirmDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)} title={t('history.deleteTitle')} description={t('history.deleteDescription', { name: toDelete?.projectName ?? '' })} destructive loading={remove.isPending} onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }} />
    </div>
  );
}
