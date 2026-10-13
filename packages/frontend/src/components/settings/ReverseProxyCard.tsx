import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { proxyApi } from '@/api/proxy.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * Proxy inverse / IP client (admin) : nombre de sauts de proxy devant le backend. L'IP détectée pour la requête
 * en cours est rechargée après chaque enregistrement, pour ajuster jusqu'à voir sa vraie IP publique.
 */
export function ReverseProxyCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['proxy'], queryFn: proxyApi.get });
  const [hops, setHops] = useState<number | null>(null);
  const value = hops ?? data?.trustHops ?? 1;
  const save = useMutation({
    mutationFn: () => proxyApi.update(value),
    onSuccess: () => { toast.success(t('settings.users.reverseProxy.toastSaved')); setHops(null); void qc.invalidateQueries({ queryKey: ['proxy'] }); },
    onError: (err: { response?: { data?: { error?: string } } }) => toast.error(err.response?.data?.error || t('settings.users.reverseProxy.toastSaveFailed')),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('settings.users.reverseProxy.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('settings.users.reverseProxy.description')}</p>
        <div className="flex items-center gap-3">
          <Label htmlFor="proxy-hops" className="text-xs w-40">{t('settings.users.reverseProxy.trustedHops')}</Label>
          <Input id="proxy-hops" className="h-8 text-xs w-24" type="number" min={0} max={16} value={value} onChange={(e) => setHops(Math.max(0, Math.min(16, parseInt(e.target.value || '0', 10))))} />
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.users.reverseProxy.detectedIpPre')} <code className="font-mono-data text-foreground">{data?.detectedIp ?? '…'}</code></p>
        <p className="text-xs text-muted-foreground">{t('settings.users.reverseProxy.detectedIpPost')}</p>
        <Button size="sm" disabled={save.isPending || hops === null} onClick={() => save.mutate()}>{save.isPending ? t('settings.users.reverseProxy.saving') : t('settings.users.reverseProxy.save')}</Button>
      </CardContent>
    </Card>
  );
}
