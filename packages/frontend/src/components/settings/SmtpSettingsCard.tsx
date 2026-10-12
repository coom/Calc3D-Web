import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { SmtpSettingsBody, SmtpSettingsDto } from '@calc3d/common';
import { smtpApi } from '@/api/smtp.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ApiError = { response?: { data?: { error?: string; details?: string } }; message?: string };
const reason = (e: ApiError) => e?.response?.data?.details || e?.response?.data?.error || e?.message || '?';
type TextField = 'host' | 'port' | 'username' | 'fromAddress' | 'fromName';

/** Configuration SMTP de l'instance (admin). Charge la configuration puis affiche le formulaire (état initialisé une fois par chargement). */
export function SmtpSettingsCard() {
  const q = useQuery({ queryKey: ['smtp'], queryFn: smtpApi.get });
  if (!q.data) return null;
  return <SmtpForm key={JSON.stringify(q.data)} initial={q.data} />;
}

/** Le mot de passe n'est jamais relu : champ vide = inchangé. */
function SmtpForm({ initial }: { initial: SmtpSettingsDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<SmtpSettingsBody>({ host: initial.host, port: initial.port, secure: initial.secure, username: initial.username, password: '', fromAddress: initial.fromAddress, fromName: initial.fromName, enabled: initial.enabled });
  const [testTo, setTestTo] = useState(''); const [testError, setTestError] = useState('');
  const save = useMutation({
    mutationFn: () => { const { password, ...rest } = form; return smtpApi.update(password ? { ...rest, password } : rest); },
    onSuccess: (d: SmtpSettingsDto) => { qc.setQueryData(['smtp'], d); void qc.invalidateQueries({ queryKey: ['smtp-status'] }); toast.success(t('smtp.saved')); },
    onError: (e: ApiError) => toast.error(t('smtp.failed', { reason: reason(e) })),
  });
  const test = useMutation({ mutationFn: () => smtpApi.test(testTo.trim()), onSuccess: () => { setTestError(''); toast.success(t('smtp.testOk')); }, onError: (e: ApiError) => setTestError(t('smtp.testFailed', { reason: reason(e) })) });
  const field = (k: TextField, label: string, type = 'text') => (
    <div className="space-y-1"><Label htmlFor={`smtp-${k}`} className="text-xs">{label}</Label><Input id={`smtp-${k}`} type={type} value={String(form[k])} onChange={(e) => setForm({ ...form, [k]: type === 'number' ? Number(e.target.value) : e.target.value })} /></div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('smtp.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('smtp.intro')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('host', t('smtp.host'))}{field('port', t('smtp.port'), 'number')}
          {field('username', t('smtp.username'))}
          <div className="space-y-1"><Label htmlFor="smtp-password" className="text-xs">{t('smtp.password')}</Label><Input id="smtp-password" type="password" autoComplete="new-password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />{initial.hasPassword && <p className="text-xs text-muted-foreground">{t('smtp.passwordKeep')}</p>}</div>
          {field('fromAddress', t('smtp.fromAddress'), 'email')}{field('fromName', t('smtp.fromName'))}
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.secure} onCheckedChange={(v) => setForm({ ...form, secure: v })} aria-label={t('smtp.secure')} />{t('smtp.secure')}</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} aria-label={t('smtp.enabled')} />{t('smtp.enabled')}</label>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{t('smtp.save')}</Button>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="space-y-1"><Label htmlFor="smtp-test" className="text-xs">{t('smtp.testTo')}</Label><Input id="smtp-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
          <Button size="sm" variant="outline" disabled={test.isPending || !testTo.trim()} onClick={() => test.mutate()}>{t('smtp.test')}</Button>
        </div>
        {testError && <p className="text-xs text-destructive">{testError}</p>}
      </CardContent>
    </Card>
  );
}
