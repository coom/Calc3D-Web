import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PaypalSettingsDto } from '@calc3d/common';
import { settingsApi } from '@/api/settings.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ApiError = { response?: { data?: { details?: string; error?: string } }; message?: string };

/** Paiement PayPal proposé aux clients (Paramètres → Compte) : activation, pseudo PayPal.Me, adresse e-mail. */
export function PaypalCard() {
  const { data } = useQuery({ queryKey: ['settings-paypal'], queryFn: settingsApi.getPaypal });
  if (!data) return null;
  return <PaypalForm key={`${data.paypalEnabled}|${data.paypalHandle}|${data.paypalEmail}`} initial={data} />;
}

function PaypalForm({ initial }: { initial: PaypalSettingsDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(initial.paypalEnabled);
  const [handle, setHandle] = useState(initial.paypalHandle);
  const [email, setEmail] = useState(initial.paypalEmail);
  const hasTarget = handle.trim() !== '' || email.trim() !== '';
  const save = useMutation({
    mutationFn: () => settingsApi.updatePaypal({ paypalEnabled: enabled && hasTarget, paypalHandle: handle.trim(), paypalEmail: email.trim() }),
    onSuccess: (r) => { qc.setQueryData(['settings-paypal'], r); toast.success(t('paypal.settings.saved')); },
    onError: (e: ApiError) => toast.error(t('paypal.settings.failed', { reason: e?.response?.data?.details || e?.response?.data?.error || e?.message || '?' })),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('paypal.settings.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('paypal.settings.intro')}</p>
        <div className="space-y-1">
          <Label htmlFor="paypal-handle" className="text-xs">{t('paypal.settings.handle')}</Label>
          <Input id="paypal-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="monpseudo" autoComplete="off" />
          <p className="text-[10px] text-muted-foreground">{t('paypal.settings.handleHint')}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="paypal-email" className="text-xs">{t('paypal.settings.email')}</Label>
          <Input id="paypal-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="paypal-enabled" checked={enabled && hasTarget} disabled={!hasTarget} onCheckedChange={setEnabled} />
          <Label htmlFor="paypal-enabled" className="text-xs font-normal">{t('paypal.settings.enabled')}</Label>
        </div>
        {!hasTarget && <p className="text-[10px] text-muted-foreground">{t('paypal.settings.needsOne')}</p>}
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{t('paypal.settings.save')}</Button>
      </CardContent>
    </Card>
  );
}
