import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, FilePlus, Printer } from 'lucide-react';
import { computeQuote, QUOTE_KINDS, QUOTE_STATUSES, type QuoteKind, type QuoteStatus, type QuoteResult } from '@calc3d/common';
import { settingsApi } from '@/api/settings.api';
import { materialsApi } from '@/api/materials.api';
import { quotesApi } from '@/api/quotes.api';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilamentGrid } from '@/components/quote/FilamentGrid';
import { QuoteResultPanel } from '@/components/quote/QuoteResultPanel';
import { emptyQuoteForm, toQuoteInput, toCreateBody, type QuoteFormState, type QuoteFormError } from '@/components/quote/quote-form-state';

export default function Quote() {
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: materialsApi.list });
  if (settingsQ.isLoading || materialsQ.isLoading || !settingsQ.data || !materialsQ.data) return <PageLoader />;
  const first = materialsQ.data[0];
  return <QuoteEditor key={first?.id ?? 'none'} settings={settingsQ.data} materials={materialsQ.data} defaultMaterial={first?.name ?? 'PLA'} defaultPrice={first ? String(first.pricePerKg) : ''} />;
}

type EditorProps = { settings: Awaited<ReturnType<typeof settingsApi.get>>; materials: Awaited<ReturnType<typeof materialsApi.list>>; defaultMaterial: string; defaultPrice: string };
type NumericFormError = Exclude<QuoteFormError, `lines.${number}.${string}`>;

function QuoteEditor({ settings, materials, defaultMaterial, defaultPrice }: EditorProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<QuoteFormState>(() => emptyQuoteForm(defaultMaterial, defaultPrice));
  const [savedId, setSavedId] = useState<number | null>(null);
  const { pdfShowCostBreakdown: _omit, ...pricing } = settings;

  // Résultat en direct : recalculé à chaque frappe par le moteur partagé ; le serveur refera le calcul à l'enregistrement.
  const { input, errors, result } = useMemo(() => {
    const { input, errors } = toQuoteInput(form);
    let result: QuoteResult | null = null;
    if (errors.length === 0) { try { result = computeQuote(pricing, input); } catch { result = null; } }
    return { input, errors, result };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pricing est dérivé de settings, stable entre deux rendus
  }, [form, settings]);

  const save = useMutation({
    mutationFn: () => quotesApi.create(toCreateBody(form)),
    onSuccess: (q) => { setSavedId(q.id); toast.success(t('quote.actions.saved')); },
    onError: () => toast.error(t('quote.actions.saveFailed')),
  });
  const set = (patch: Partial<QuoteFormState>) => { setForm({ ...form, ...patch }); setSavedId(null); };
  const has = (k: QuoteFormError) => errors.includes(k);
  const numField = (k: NumericFormError, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`q-${k}`} className="text-xs">{label}</Label>
      <Input id={`q-${k}`} inputMode="decimal" value={form[k]} aria-invalid={has(k)} onChange={(e) => set({ [k]: e.target.value } as Partial<QuoteFormState>)} />
      {has(k) && <p className="text-xs text-destructive">{t(k === 'quantity' ? 'quote.errors.quantityMin' : k === 'printMinutes' ? 'quote.errors.minutesRange' : 'quote.errors.invalidNumber')}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('quote.title')}</h1><p className="text-sm text-muted-foreground">{t('quote.subtitle')}</p></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.project.title')}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="q-projectName" className="text-xs">{t('quote.project.projectName')}</Label><Input id="q-projectName" value={form.projectName} onChange={(e) => set({ projectName: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="q-customer" className="text-xs">{t('quote.project.customer')}</Label><Input id="q-customer" value={form.customer} onChange={(e) => set({ customer: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="q-kind" className="text-xs">{t('quote.project.kind')}</Label>
                <select id="q-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value as QuoteKind })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{QUOTE_KINDS.map((k) => <option key={k} value={k}>{t(`quote.kinds.${k}`)}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="q-status" className="text-xs">{t('quote.project.status')}</Label>
                <select id="q-status" value={form.status} onChange={(e) => set({ status: e.target.value as QuoteStatus })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{t(`quote.statuses.${s}`)}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="q-dueDate" className="text-xs">{t('quote.project.dueDate')}</Label><Input id="q-dueDate" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>
              {numField('quantity', t('quote.project.quantity'))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.filament.title')}</CardTitle></CardHeader>
            <CardContent><FilamentGrid lines={form.lines} materials={materials} errors={errors} onChange={(lines) => set({ lines })} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.time.title')}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {numField('printHours', t('quote.time.printHours'))}
              {numField('printMinutes', t('quote.time.printMinutes'))}
              {numField('prepHours', t('quote.time.prepHours'))}
              {numField('postHours', t('quote.time.postHours'))}
              {numField('designHours', t('quote.time.designHours'))}
              {numField('packagingHours', t('quote.time.packagingHours'))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">{t('quote.options.title')}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {numField('consumables', t('quote.options.consumables'))}
              {numField('discountPct', t('quote.options.discountPct'))}
              {numField('shippingCost', t('quote.options.shippingCost'))}
              <div className="space-y-1 sm:col-span-3"><Label htmlFor="q-comment" className="text-xs">{t('quote.options.comment')}</Label><Textarea id="q-comment" value={form.comment} onChange={(e) => set({ comment: e.target.value })} /></div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <QuoteResultPanel result={result} settings={pricing} input={input} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={!result || save.isPending || savedId !== null}><Save className="mr-1 h-4 w-4" />{save.isPending ? t('quote.actions.saving') : t('quote.actions.save')}</Button>
            <Button variant="outline" onClick={() => { setForm(emptyQuoteForm(defaultMaterial, defaultPrice)); setSavedId(null); }}><FilePlus className="mr-1 h-4 w-4" />{t('quote.actions.new')}</Button>
            <Button variant="outline" disabled title={t('quote.actions.exportLater')}><Printer className="mr-1 h-4 w-4" />{t('quote.actions.export')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
