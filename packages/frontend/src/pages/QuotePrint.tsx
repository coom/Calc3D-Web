import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toPublicQuoteDto } from '@calc3d/common';
import { quotesApi } from '@/api/quotes.api';
import { settingsApi } from '@/api/settings.api';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { QuoteDocument } from '@/components/quote/QuoteDocument';

/**
 * Page HTML imprimable du devis (propriétaire connecté). Même document que la page publique (`QuoteDocument`),
 * construit par `toPublicQuoteDto` avec l'option « détail des coûts » des paramètres courants. Montants enregistrés,
 * jamais recalculés. window.print() au chargement, sauf ?noprint=1 (tests).
 */
export default function QuotePrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const quoteId = /^\d+$/.test(id ?? '') ? Number(id) : null;
  const quoteQ = useQuery({ queryKey: ['quote', quoteId], queryFn: () => quotesApi.get(quoteId!), enabled: quoteId !== null, retry: false, staleTime: 0 });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const q = quoteQ.data; const s = settingsQ.data;
  const data = useMemo(() => (q && s ? toPublicQuoteDto(q, { showCostBreakdown: s.pdfShowCostBreakdown, currencySymbol: s.currencySymbol, ownerDisplayName: '', paypal: null }) : null), [q, s]);
  useEffect(() => {
    if (!data) return;
    document.title = t('print.title', { name: data.projectName });
    if (params.get('noprint') !== '1') { const h = setTimeout(() => window.print(), 300); return () => clearTimeout(h); }
  }, [data, params, t]);

  if (quoteId === null || quoteQ.isError) return <p style={{ fontFamily: 'sans-serif', padding: 40 }}>{t('print.notFound')}</p>;
  if (!data) return <PageLoader />;
  return <QuoteDocument data={data} generatedAt={new Date()} toolbar={<button type="button" onClick={() => window.print()}>{t('print.print')}</button>} />;
}
