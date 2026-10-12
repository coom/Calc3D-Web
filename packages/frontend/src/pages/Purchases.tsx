import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';
import { PURCHASE_CATEGORIES, type PurchaseCategory, type PurchaseDto } from '@calc3d/common';
import { purchasesApi } from '@/api/purchases.api';
import { settingsApi } from '@/api/settings.api';
import { formatDate, todayIso } from '@/lib/dates';
import { formatMoney, parseLocaleNumber } from '@/lib/number';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { MonthGroups } from '@/components/shared/MonthGroups';

const LIMIT = 50;
const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
const emptyForm = () => ({ date: todayIso(), category: 'FILAMENT' as PurchaseCategory, description: '', amount: '', supplier: '', comment: '' });

/** Registre des achats réels : formulaire de saisie et liste groupée par mois. */
export default function Purchases() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<{ description?: string; amount?: string; date?: string }>({});
  const [q, setQ] = useState(''); const [category, setCategory] = useState<PurchaseCategory | ''>(''); const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<PurchaseDto | null>(null);
  const params = { q: q || undefined, category: category || undefined, page, limit: LIMIT };
  const { data } = useQuery({ queryKey: ['purchases', params], queryFn: () => purchasesApi.list(params) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const currency = settings?.currencySymbol ?? '€';
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['finances'] }); };
  const create = useMutation({ mutationFn: purchasesApi.create, onSuccess: () => { toast.success(t('purchases.saved')); setForm(emptyForm()); invalidate(); }, onError: () => toast.error(t('purchases.failed')) });
  const remove = useMutation({ mutationFn: purchasesApi.remove, onSuccess: () => { toast.success(t('purchases.deleted')); setToDelete(null); invalidate(); }, onError: () => toast.error(t('purchases.failed')) });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseLocaleNumber(form.amount);
    const errs: typeof errors = {};
    if (!form.description.trim()) errs.description = t('purchases.errors.description');
    if (amount === null || amount <= 0) errs.amount = t('purchases.errors.amount');
    if (!form.date) errs.date = t('purchases.errors.date');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate({ date: form.date, category: form.category, description: form.description.trim(), amount: amount!, supplier: form.supplier.trim(), comment: form.comment });
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('purchases.title')}</h1><p className="text-sm text-muted-foreground">{t('purchases.subtitle')}</p></div>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">{t('purchases.new')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="p-date" className="text-xs">{t('purchases.date')}</Label><Input id="p-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-invalid={!!errors.date} />{errors.date && <p className="text-xs text-destructive">{errors.date}</p>}</div>
            <div className="space-y-1"><Label htmlFor="p-category" className="text-xs">{t('purchases.category')}</Label>
              <select id="p-category" className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PurchaseCategory })}>{PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`purchases.categories.${c}`)}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="p-amount" className="text-xs">{t('purchases.amount')} ({currency})</Label><Input id="p-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-invalid={!!errors.amount} />{errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}</div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="p-description" className="text-xs">{t('purchases.description')}</Label><Input id="p-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-invalid={!!errors.description} />{errors.description && <p className="text-xs text-destructive">{errors.description}</p>}</div>
            <div className="space-y-1"><Label htmlFor="p-supplier" className="text-xs">{t('purchases.supplier')}</Label><Input id="p-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-3"><Label htmlFor="p-comment" className="text-xs">{t('purchases.comment')}</Label><Textarea id="p-comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
            <div className="sm:col-span-3"><Button type="submit" disabled={create.isPending}><Save className="mr-1 h-4 w-4" />{t('purchases.save')}</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">{t('purchases.listTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input className="h-8 w-full sm:w-64" placeholder={t('purchases.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <select aria-label={t('purchases.filterCategory')} className="flex h-8 rounded-md border border-input bg-background px-2 text-sm" value={category} onChange={(e) => { setCategory(e.target.value as PurchaseCategory | ''); setPage(1); }}>
              <option value="">{t('purchases.allCategories')}</option>{PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`purchases.categories.${c}`)}</option>)}
            </select>
          </div>
          {data && data.items.length === 0 ? <EmptyState title={t('purchases.empty')} /> : (
            <div className="overflow-x-auto">
              <MonthGroups items={data?.items ?? []} dateOf={(x) => x.date} countLabel={(n) => t('purchases.count', { count: n })} renderItem={(x) => (
                <div key={x.id} className="grid min-w-[40rem] grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_auto] items-center gap-2 border-t px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">{formatDate(x.date, i18n.language)}</span>
                  <span className="text-xs">{t(`purchases.categories.${x.category}`)}</span>
                  <span className="truncate font-medium" title={x.comment || undefined}>{x.description}</span>
                  <span className="truncate text-xs">{x.supplier}</span>
                  <span className="text-right font-mono-data">{formatMoney(x.amount, currency, i18n.language)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={t('purchases.delete')} title={t('purchases.delete')} onClick={() => setToDelete(x)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )} />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog open={toDelete !== null} onOpenChange={() => setToDelete(null)} title={t('purchases.deleteTitle')} description={t('purchases.deleteDescription', { name: toDelete?.description ?? '' })} destructive loading={remove.isPending} onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }} />
    </div>
  );
}
