import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Upload, Link2, X } from 'lucide-react';
import { quotesApi } from '@/api/quotes.api';
import { ImagePrepareError, prepareImage } from '@/lib/image-prepare';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props { image: string | null; onChange: (image: string | null) => void }
type ApiError = { response?: { data?: { code?: string } } };
const KNOWN_CODES = ['validation', 'blocked_address', 'not_image', 'too_large', 'fetch_failed'];

/**
 * Image d'illustration du devis : fichier local (Parcourir) ou adresse (le serveur télécharge, le navigateur réduit).
 * La case « Inclure une image » active les deux ; la décocher ou Retirer efface l'image à l'enregistrement.
 */
export function QuoteImageCard({ image, onChange }: Props) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [include, setInclude] = useState(image !== null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => {
    const code = e instanceof ImagePrepareError ? e.code : (e as ApiError)?.response?.data?.code;
    toast.error(t(`quote.image.errors.${code && [...KNOWN_CODES, 'prepare', 'tooLarge'].includes(code) ? code : 'fetch_failed'}`));
  };
  const apply = async (source: Blob | string) => {
    setBusy(true);
    try { onChange(await prepareImage(source)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const fetchUrl = async () => {
    setBusy(true);
    try { const { dataUrl } = await quotesApi.fetchImage(url.trim()); onChange(await prepareImage(dataUrl)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const toggle = (on: boolean) => { setInclude(on); if (!on) onChange(null); };
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{t('quote.image.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={include} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4" />
          {t('quote.image.include')}
        </label>
        <p className="text-xs text-muted-foreground">{t('quote.image.hint')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!include || busy} onClick={() => fileInput.current?.click()}><Upload className="mr-1 h-4 w-4" />{t('quote.image.browse')}</Button>
          <input ref={fileInput} data-testid="image-input" type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void apply(f); e.target.value = ''; }} />
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor="q-image-url" className="text-xs">{t('quote.image.urlLabel')}</Label>
            <Input id="q-image-url" type="url" placeholder={t('quote.image.urlPlaceholder')} value={url} disabled={!include || busy} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) { e.preventDefault(); void fetchUrl(); } }} />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!include || busy || !url.trim()} onClick={() => void fetchUrl()}><Link2 className="mr-1 h-4 w-4" />{busy ? t('quote.image.fetching') : t('quote.image.fetch')}</Button>
        </div>
        {include && image && (
          <div className="flex items-start gap-3">
            <img src={image} alt={t('quote.image.previewAlt')} className="h-32 max-w-full rounded border border-border object-contain" />
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><X className="mr-1 h-4 w-4" />{t('quote.image.remove')}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
