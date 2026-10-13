import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClientResponse } from '@calc3d/common';
import { publicApi } from '@/api/public.api';
import { QuoteDocument } from '@/components/quote/QuoteDocument';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ApiError = { response?: { status?: number } };

/**
 * Page client, sans compte : lecture seule du devis (même rendu que l'impression) et réponse unique
 * (accepter / refuser, commentaire facultatif, confirmation). Langue du navigateur, pas celle du propriétaire.
 */
export default function PublicQuote() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['public-quote', token], queryFn: () => publicApi.get(token), retry: (count, e) => (e as ApiError)?.response?.status !== 404 && count < 1, retryDelay: 800 });
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<ClientResponse | null>(null);
  const [error, setError] = useState('');
  const respond = useMutation({
    mutationFn: (decision: ClientResponse) => publicApi.respond(token, { decision, comment: comment.trim() }),
    onSuccess: (d) => { qc.setQueryData(['public-quote', token], d); setPending(null); setError(''); },
    onError: (e: ApiError) => {
      setPending(null);
      if (e?.response?.status === 409) { setError(t('publicQuote.already')); void qc.invalidateQueries({ queryKey: ['public-quote', token] }); }
      else setError(t('publicQuote.failed'));
    },
  });
  useEffect(() => { if (q.data) document.title = t('print.title', { name: q.data.projectName }); }, [q.data, t]);
  // Le store d'interface pose la classe « dark » par défaut, même pour un client sans compte ; le document
  // force un fond blanc et un texte noir sur body, et la boîte de confirmation (portail hors du document)
  // héritait alors d'un fond sombre avec ce texte noir. La page client est toujours en thème clair.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => { if (wasDark) root.classList.add('dark'); };
  }, []);

  if (q.isError) {
    // Seul le 404 signifie « lien mort » ; limiteur (429), panne ou réseau ne doivent pas pousser le propriétaire à régénérer un lien valide.
    const status = (q.error as ApiError)?.response?.status;
    return <p style={{ fontFamily: 'sans-serif', padding: 40 }}>{t(status === 404 ? 'publicQuote.invalid' : 'publicQuote.unavailable')}</p>;
  }
  if (!q.data) return <PageLoader />;
  const d = q.data;
  return (
    <div style={{ background: '#fff', minHeight: '100vh', color: '#111827' }}>
      <QuoteDocument data={d} toolbar={<><strong>{t('publicQuote.from', { name: d.ownerDisplayName })}</strong><button type="button" onClick={() => window.print()}>{t('publicQuote.print')}</button></>} />
      <div className="print-page" style={{ marginTop: 0 }}>
        {d.clientResponse ? (
          <p className="note" style={{ fontSize: 14 }}>{t(`publicQuote.answered.${d.clientResponse}`, { date: new Date(d.clientRespondedAt ?? '').toLocaleDateString(i18n.language) })}</p>
        ) : (
          <div className="space-y-3">
            <p>{t('publicQuote.intro', { name: d.ownerDisplayName })}</p>
            <div className="space-y-1"><Label htmlFor="pq-comment">{t('publicQuote.commentLabel')}</Label><Textarea id="pq-comment" className="bg-white text-gray-900" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} /></div>
            <div className="flex gap-2"><Button onClick={() => setPending('ACCEPTED')}>{t('publicQuote.accept')}</Button><Button variant="outline" onClick={() => setPending('REFUSED')}>{t('publicQuote.refuse')}</Button></div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t(pending === 'ACCEPTED' ? 'publicQuote.confirmAccept' : 'publicQuote.confirmRefuse')}</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>{t('publicQuote.cancel')}</Button>
            <Button disabled={respond.isPending} onClick={() => { if (pending) respond.mutate(pending); }}>{respond.isPending ? t('publicQuote.sending') : t('publicQuote.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
