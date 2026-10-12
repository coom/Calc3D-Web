import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, FilePlus, Printer } from 'lucide-react';
import { computeQuote, QUOTE_KINDS, QUOTE_STATUSES, type QuoteDto, type QuoteKind, type QuoteStatus, type QuoteResult } from '@calc3d/common';
import { settingsApi } from '@/api/settings.api';
import { materialsApi } from '@/api/materials.api';
import { quotesApi } from '@/api/quotes.api';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilamentGrid } from '@/components/quote/FilamentGrid';
import { QuoteResultPanel } from '@/components/quote/QuoteResultPanel';
import { emptyQuoteForm, quoteFormFromDto, toQuoteInput, toCreateBody, type QuoteFormState, type QuoteFormError } from '@/components/quote/quote-form-state';

/** Page Devis. Avec `?quote=<id>`, charge un devis existant (mode « devis chargé », paramètres d'origine). */
export default function Quote() {
  const [params] = useSearchParams();
  // ?quote=<entier ≥ 1> ; toute autre valeur présente est traitée comme un devis introuvable, jamais comme un nouveau devis.
  const rawQuote = params.get('quote');
  const quoteId = rawQuote !== null && /^\d+$/.test(rawQuote) && Number(rawQuote) >= 1 ? Number(rawQuote) : null;
  const invalidParam = rawQuote !== null && quoteId === null;
  const { t } = useTranslation();
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: materialsApi.list });
  // staleTime 0 : un devis rechargé est toujours relu (il a pu être converti ou supprimé depuis l'Historique).
  const quoteQ = useQuery({ queryKey: ['quote', quoteId], queryFn: () => quotesApi.get(quoteId!), enabled: quoteId !== null, staleTime: 0, retry: false });
  if (invalidParam) return <p className="text-sm text-destructive">{t('quote.loaded.notFound')}</p>;
  if (settingsQ.isLoading || materialsQ.isLoading || !settingsQ.data || !materialsQ.data || (quoteId !== null && quoteQ.isLoading)) return <PageLoader />;
  if (quoteId !== null && !quoteQ.data) {
    const status = (quoteQ.error as { response?: { status?: number } } | null)?.response?.status;
    return <p className="text-sm text-destructive">{t(status === 404 || status === 400 ? 'quote.loaded.notFound' : 'quote.loaded.loadError')}</p>;
  }
  const first = materialsQ.data[0];
  return <QuoteEditor key={quoteQ.data?.id ?? `new-${first?.id ?? 'none'}`} settings={settingsQ.data} materials={materialsQ.data} defaultMaterial={first?.name ?? 'PLA'} defaultPrice={first ? String(first.pricePerKg) : ''} initial={quoteQ.data ?? null} />;
}

type EditorProps = { settings: Awaited<ReturnType<typeof settingsApi.get>>; materials: Awaited<ReturnType<typeof materialsApi.list>>; defaultMaterial: string; defaultPrice: string; initial: QuoteDto | null };
type NumericFormError = Exclude<QuoteFormError, `lines.${number}.${string}`>;

function QuoteEditor({ settings, materials, defaultMaterial, defaultPrice, initial }: EditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<QuoteFormState>(() => (initial ? quoteFormFromDto(initial) : emptyQuoteForm(defaultMaterial, defaultPrice)));
  const [savedId, setSavedId] = useState<number | null>(null);
  const [useCurrent, setUseCurrent] = useState(false);
  // Paramètres du calcul en direct : l'instantané du devis chargé, ou les paramètres courants (toujours pour un nouveau devis, ou sur demande).
  const pricing = useMemo(() => {
    const { pdfShowCostBreakdown: _omit, ...current } = settings;
    return initial && !useCurrent ? initial.settingsSnapshot : current;
  }, [settings, initial, useCurrent]);

  // Résultat en direct : recalculé à chaque frappe par le moteur partagé ; le serveur refera le calcul à l'enregistrement.
  const { input, errors, result } = useMemo(() => {
    const { input, errors } = toQuoteInput(form);
    let result: QuoteResult | null = null;
    if (errors.length === 0) { try { result = computeQuote(pricing, input); } catch { result = null; } }
    return { input, errors, result };
  }, [form, pricing]);

  const save = useMutation({
    mutationFn: () => (initial ? quotesApi.update(initial.id, toCreateBody(form), useCurrent) : quotesApi.create(toCreateBody(form))),
    onSuccess: (q) => { setSavedId(q.id); qc.invalidateQueries({ queryKey: ['quotes'] }); qc.invalidateQueries({ queryKey: ['quote', q.id] }); qc.invalidateQueries({ queryKey: ['finances'] }); toast.success(t(initial ? 'quote.loaded.updated' : 'quote.actions.saved')); },
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
  const onNew = () => { if (initial) navigate('/'); else { setForm(emptyQuoteForm(defaultMaterial, defaultPrice)); setSavedId(null); } };

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold">{t('quote.title')}</h1><p className="text-sm text-muted-foreground">{t('quote.subtitle')}</p></div>
      {initial && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="min-w-[16rem] flex-1">{t('quote.loaded.banner')}</span>
          <label className="flex items-center gap-2"><Switch checked={useCurrent} onCheckedChange={(v) => { setUseCurrent(v); setSavedId(null); }} aria-label={t('quote.loaded.useCurrent')} /><span>{t('quote.loaded.useCurrent')}</span></label>
        </div>
      )}
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
            <Button onClick={() => save.mutate()} disabled={!result || save.isPending || savedId !== null}><Save className="mr-1 h-4 w-4" />{save.isPending ? t('quote.actions.saving') : t(initial ? 'quote.loaded.update' : 'quote.actions.save')}</Button>
            <Button variant="outline" onClick={onNew}><FilePlus className="mr-1 h-4 w-4" />{t('quote.actions.new')}</Button>
            <Button variant="outline" disabled title={t('quote.actions.exportLater')}><Printer className="mr-1 h-4 w-4" />{t('quote.actions.export')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
