import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { DesktopImportBody, DesktopImportReport } from '@calc3d/common';
import { importApi } from '@/api/import.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Slot = keyof DesktopImportBody;
const SLOTS: { key: Slot; accept: string }[] = [{ key: 'config', accept: '.json' }, { key: 'historique', accept: '.csv' }, { key: 'achats', accept: '.csv' }];
const INVALIDATED: string[][] = [['settings'], ['materials'], ['quotes'], ['quote'], ['purchases'], ['finances']];
type ApiError = { response?: { data?: { error?: string; details?: string } }; message?: string };

/** Import des fichiers de l'application bureau : lus dans le navigateur, envoyés en texte, rapport affiché. */
export function DesktopImportCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [error, setError] = useState('');
  const [report, setReport] = useState<DesktopImportReport | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      const body: DesktopImportBody = {};
      for (const { key } of SLOTS) { const f = files[key]; if (f) body[key] = await f.text(); }
      return importApi.desktop(body);
    },
    onSuccess: (r) => { setReport(r); setError(''); for (const k of INVALIDATED) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e: ApiError) => setError(t('desktopImport.failed', { reason: e?.response?.data?.details || e?.response?.data?.error || e?.message || '?' })),
  });
  const submit = () => {
    if (!SLOTS.some(({ key }) => files[key])) { setError(t('desktopImport.pickOne')); return; }
    setError(''); setReport(null); run.mutate();
  };
  const rejected = report ? [...report.quotes.rejected, ...report.purchases.rejected] : [];
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('desktopImport.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('desktopImport.intro')}</p>
        {SLOTS.map(({ key, accept }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`import-${key}`} className="text-xs">{t(`desktopImport.${key}`)}</Label>
            <Input id={`import-${key}`} type="file" accept={accept} onChange={(e) => setFiles({ ...files, [key]: e.target.files?.[0] })} />
          </div>
        ))}
        <Button size="sm" onClick={submit} disabled={run.isPending}><Upload className="mr-1 h-4 w-4" />{run.isPending ? t('desktopImport.running') : t('desktopImport.run')}</Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {report && (
          <div className="space-y-1 rounded-md border border-border p-3 text-xs">
            <p className="font-medium">{t('desktopImport.report.title')}</p>
            <p>{report.settings.imported ? t('desktopImport.report.settings', { count: report.settings.materials }) : t('desktopImport.report.settingsSkipped')}</p>
            <p>{t('desktopImport.report.quotes', { created: report.quotes.created, updated: report.quotes.updated, rejected: report.quotes.rejected.length })}</p>
            <p>{t('desktopImport.report.purchases', { created: report.purchases.created, updated: report.purchases.updated, rejected: report.purchases.rejected.length })}</p>
            {rejected.slice(0, 50).map((r, i) => <p key={i} className="text-muted-foreground">{t('desktopImport.report.rejectedLine', { line: r.line, reason: r.reason })}</p>)}
            {rejected.length > 50 && <p className="text-muted-foreground">…</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
