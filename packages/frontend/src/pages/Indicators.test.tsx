import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import Indicators from './Indicators';
import type { IndicatorsDto } from '@calc3d/common';

const get = vi.fn();
vi.mock('@/api/indicators.api', () => ({ indicatorsApi: { get: (days: number) => get(days) } }));

const counts = (o: Partial<IndicatorsDto['current']>) => ({ newQuotes: 0, newOrders: 0, paidOrders: 0, accepted: 0, refused: 0, converted: 0, ...o });
const dto: IndicatorsDto = {
  days: 30, from: '2026-09-13T12:00:00.000Z', to: '2026-10-13T12:00:00.000Z', openOrders: 2, granularity: 'week',
  current: counts({ newQuotes: 4, newOrders: 3, paidOrders: 1, accepted: 2, refused: 1, converted: 2 }),
  previous: counts({ newQuotes: 2, newOrders: 1, paidOrders: 1, accepted: 3, refused: 0, converted: 0 }),
  rates: { acceptancePct: 66.7, conversionPct: 50 },
  buckets: [
    { key: '2026-09-13', start: '2026-09-13', end: '2026-09-19', ...counts({}) },
    { key: '2026-09-20', start: '2026-09-20', end: '2026-09-26', ...counts({ refused: 1, newQuotes: 1 }) },
    { key: '2026-09-27', start: '2026-09-27', end: '2026-10-03', ...counts({ accepted: 2, converted: 2, newOrders: 2, newQuotes: 2 }) },
    { key: '2026-10-04', start: '2026-10-04', end: '2026-10-10', ...counts({ paidOrders: 1, newOrders: 1, newQuotes: 1 }) },
    { key: '2026-10-11', start: '2026-10-11', end: '2026-10-13', ...counts({}) },
  ],
};
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Indicators /></QueryClientProvider>);
}

describe('page Indicateurs', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); get.mockResolvedValue(dto); });

  it('tuiles : commandes en cours (instantané), compteurs de la période avec écart vs période précédente et taux', async () => {
    renderPage();
    expect(await screen.findByText('Commandes en cours')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(30);
    const tile = (label: string) => screen.getByText(label).closest('[data-testid="kpi"]') as HTMLElement;
    expect(tile('Commandes en cours')).toHaveTextContent('2');
    expect(tile('Devis acceptés')).toHaveTextContent('2'); expect(tile('Devis acceptés')).toHaveTextContent('−1 vs période précédente'); expect(tile('Devis acceptés')).toHaveTextContent("Taux d'acceptation : 66,7 %");
    expect(tile('Devis convertis')).toHaveTextContent('+2 vs période précédente'); expect(tile('Devis convertis')).toHaveTextContent('Taux de conversion : 50 %');
    expect(tile('Commandes payées')).toHaveTextContent('= période précédente');
  });
  it('changer la période relance la requête ; les graphiques ont une légende et une vue tableau', async () => {
    renderPage();
    await screen.findByText('Commandes en cours');
    fireEvent.change(screen.getByLabelText(/Période/), { target: { value: '90' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(90));
    expect((await screen.findAllByText('Acceptés')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(screen.getAllByText('20/09/2026').length).toBeGreaterThan(0);
  });
});
