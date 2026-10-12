import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { journalApi, type JournalQuery } from '@/api/journal.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';

const LIMIT = 50;

/** Journal des connexions à l'application (admin). */
export default function Journal() {
  const { t, i18n } = useTranslation();
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const params: JournalQuery = { q: q || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, page, limit: LIMIT };
  const web = useQuery({ queryKey: ['journal', 'web', params], queryFn: () => journalApi.web(params), enabled: isAdmin });
  const total = web.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language);
  const reset = () => setPage(1);
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t('journal.title')}</h1>
        <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          <Input className="h-8 w-full sm:w-36" placeholder={t('journal.filterName')} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
          <Input className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none" type="date" aria-label={t('journal.from')} value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
          <Input className="h-8 min-w-0 flex-1 sm:w-36 sm:flex-none" type="date" aria-label={t('journal.to')} value={to} onChange={(e) => { setTo(e.target.value); reset(); }} />
        </div>
      </div>
      <Card><CardContent className="p-4">
        {web.data?.items.length === 0 ? <EmptyState title={t('journal.empty')} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">{t('journal.when')}</th><th>{t('journal.name')}</th><th>{t('journal.ip')}</th><th>{t('journal.country')}</th><th>{t('journal.result')}</th></tr></thead>
            <tbody>{(web.data?.items ?? []).map((w) => (
              <tr key={w.id} className="border-t"><td className="py-2">{fmt(w.createdAt)}</td><td>{w.username}</td><td className="font-mono text-xs">{w.ip}</td><td>{w.country ?? '—'}</td>
                <td><Badge variant={w.success ? 'success' : 'destructive'}>{t(w.success ? 'journal.success' : 'journal.failure')}</Badge> {w.reason && <span className="text-xs text-muted-foreground">{t(`journal.reasons.${w.reason}`)}</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
          <span>{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
