import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link2, Mail, RefreshCw, Ban, Copy, Repeat } from 'lucide-react';
import type { QuoteDto } from '@calc3d/common';
import { quotesApi } from '@/api/quotes.api';
import { formatDate } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponseBadge } from './ResponseBadge';

interface Props { quote: QuoteDto; smtpEnabled: boolean; onChanged: () => void }
type ApiError = { response?: { data?: { error?: string; details?: string; code?: string } }; message?: string };
const reason = (e: ApiError) => e?.response?.data?.details || e?.response?.data?.error || e?.message || '?';

/**
 * Carte « Client » d'un devis chargé : lien de partage (affiché une seule fois, jamais stocké en clair),
 * envoi par e-mail (régénère le lien), réponse du client, conversion en commande.
 */
export function ClientShareCard({ quote, smtpEnabled, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'regenerate' | 'revoke' | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [to, setTo] = useState(quote.clientEmail); const [message, setMessage] = useState('');
  const fail = (e: ApiError) => toast.error(reason(e));
  const share = useMutation({ mutationFn: () => quotesApi.share(quote.id), onSuccess: (r) => { setFreshUrl(r.url); setConfirm(null); onChanged(); }, onError: fail });
  const unshare = useMutation({ mutationFn: () => quotesApi.unshare(quote.id), onSuccess: () => { setFreshUrl(null); setConfirm(null); onChanged(); }, onError: fail });
  const email = useMutation({
    mutationFn: () => quotesApi.shareByEmail(quote.id, { to: to.trim(), message: message.trim() }),
    onSuccess: () => { toast.success(t('share.emailSent', { to: to.trim() })); setMailOpen(false); setFreshUrl(null); onChanged(); },
    onError: (e: ApiError) => toast.error(e?.response?.data?.code === 'smtp_disabled' ? t('share.emailDisabled') : t('share.emailFailed', { reason: reason(e) })),
  });
  const convert = useMutation({ mutationFn: () => quotesApi.convert(quote.id), onSuccess: () => { toast.success(t('history.converted')); onChanged(); }, onError: fail });
  const copy = async () => { if (freshUrl) { await navigator.clipboard.writeText(freshUrl); toast.success(t('share.copied')); } };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium">{t('share.title')} <ResponseBadge quote={quote} /></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{quote.shared ? t('share.sharedSince', { date: formatDate(quote.sharedAt ?? '', i18n.language) }) : t('share.notShared')}</p>
        {freshUrl && (
          <div className="space-y-1">
            <div className="flex gap-2"><Input readOnly value={freshUrl} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="sm" onClick={() => void copy()}><Copy className="mr-1 h-4 w-4" />{t('share.copy')}</Button></div>
            <p className="text-xs text-amber-700 dark:text-amber-300">{t('share.showOnce')}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!quote.shared && <Button size="sm" disabled={share.isPending} onClick={() => share.mutate()}><Link2 className="mr-1 h-4 w-4" />{t('share.generate')}</Button>}
          {quote.shared && <Button size="sm" variant="outline" onClick={() => setConfirm('regenerate')}><RefreshCw className="mr-1 h-4 w-4" />{t('share.regenerate')}</Button>}
          {quote.shared && <Button size="sm" variant="outline" onClick={() => setConfirm('revoke')}><Ban className="mr-1 h-4 w-4" />{t('share.revoke')}</Button>}
          <Button size="sm" variant="outline" disabled={!smtpEnabled} title={smtpEnabled ? undefined : t('share.emailDisabled')} onClick={() => setMailOpen(true)}><Mail className="mr-1 h-4 w-4" />{t('share.email')}</Button>
        </div>
        <div className="space-y-1 rounded-md border border-border p-3">
          <p className="font-medium">{t('share.response.title')}</p>
          {quote.clientResponse ? (
            <>
              <p>{t(`share.response.${quote.clientResponse}`)} {t('share.response.on', { date: formatDate(quote.clientRespondedAt ?? '', i18n.language) })}</p>
              {quote.clientComment && <p className="whitespace-pre-wrap text-muted-foreground"><span className="font-medium">{t('share.response.comment')}</span> {quote.clientComment}</p>}
              {quote.clientResponse === 'ACCEPTED' && quote.kind === 'QUOTE' && <Button size="sm" disabled={convert.isPending} onClick={() => convert.mutate()}><Repeat className="mr-1 h-4 w-4" />{t('share.response.convert')}</Button>}
            </>
          ) : <p className="text-muted-foreground">{t('share.response.none')}</p>}
        </div>
      </CardContent>
      <ConfirmDialog open={confirm !== null} onOpenChange={() => setConfirm(null)} title={t(confirm === 'revoke' ? 'share.revoke' : 'share.regenerate')} description={t(confirm === 'revoke' ? 'share.revokeConfirm' : 'share.regenerateConfirm')} destructive={confirm === 'revoke'} loading={share.isPending || unshare.isPending} onConfirm={() => (confirm === 'revoke' ? unshare.mutate() : share.mutate())} />
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('share.email')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('share.emailHint')}</p>
            <div className="space-y-1"><Label htmlFor="share-to">{t('share.emailTo')}</Label><Input id="share-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="share-msg">{t('share.emailMessage')}</Label><Textarea id="share-msg" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} /></div>
          </div>
          <DialogFooter><Button disabled={email.isPending || !to.trim()} onClick={() => email.mutate()}>{t('share.emailSend')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
