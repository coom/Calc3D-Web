import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import Finances from './Finances';
import type { FinancesDto } from '@calc3d/common';

const get = vi.fn();
vi.mock('@/api/finances.api', () => ({ financesApi: { get: (p: string) => get(p) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ currencySymbol: '€' }) } }));

const dto: FinancesDto = {
  period: 'all',
  orders: { count: 2, revenue: 150, printingCost: 100, netMargin: 50, netMarginPct: 33.333 },
  purchases: { count: 1, total: 40, gapVsPrintingCost: -60 },
  costBreakdown: [{ key: 'labor', amount: 40, pct: 40 }, { key: 'filament', amount: 30, pct: 30 }, { key: 'contingency', amount: 10, pct: 10 }, { key: 'fixedCosts', amount: 8, pct: 8 }, { key: 'printer', amount: 7, pct: 7 }, { key: 'electricity', amount: 5, pct: 5 }],
  monthly: [{ month: '2026-10', revenue: 100, printingCost: 60, purchases: 40 }, { month: '2026-09', revenue: 50, printingCost: 40, purchases: 0 }],
  purchasesByCategory: [{ category: 'FILAMENT', amount: 40, pct: 100 }],
  comparison: { modeledCost: 100, actualPurchases: 40 },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Finances /></QueryClientProvider>);
}

describe('page Finances', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); get.mockResolvedValue(dto); });

  it('affiche les indicateurs, la répartition triée, les mois et le comparatif', async () => {
    renderPage();
    expect(await screen.findByText('150,00 €')).toBeInTheDocument();
    expect(screen.getByText('2 commande(s)')).toBeInTheDocument();
    expect(screen.getByText(/33,3 % du revenu/)).toBeInTheDocument();
    expect(screen.getByText(/1 achat\(s\) · écart vs coûts d'impression : -60,00 €/)).toBeInTheDocument();
    const bars = screen.getAllByTestId('bar-label').map((e) => e.textContent);
    expect(bars[0]).toMatch(/Main d'œuvre \(toutes tâches\) \(40 %\)/);
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Septembre 2026')).toBeInTheDocument();
    expect(screen.getByText(/Filament \/ consommables \(100 %\)/)).toBeInTheDocument();
    // Titre de carte et libellé de barre portent le même texte : on vise la barre du comparatif.
    expect(bars.some((b) => /^Coût d'impression modélisé \(devis\)$/.test(b ?? ''))).toBe(true);
  });
  it('changer la période relance la requête', async () => {
    renderPage();
    await screen.findByText('150,00 €');
    fireEvent.change(screen.getByLabelText(/Période/), { target: { value: 'year' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('year'));
  });
  it('sans commande : messages vides, pas de NaN', async () => {
    get.mockResolvedValue({ ...dto, orders: { count: 0, revenue: 0, printingCost: 0, netMargin: 0, netMarginPct: 0 }, costBreakdown: dto.costBreakdown.map((c) => ({ ...c, amount: 0, pct: 0 })), monthly: [], purchasesByCategory: [], purchases: { count: 0, total: 0, gapVsPrintingCost: 0 } });
    renderPage();
    expect(await screen.findByText(/Aucune commande sur la période/)).toBeInTheDocument();
    expect(screen.getByText(/Aucune commande ou aucun achat/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun achat enregistré/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('affiche un message si le chargement échoue, pas un spinner infini', async () => {
    get.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(/Impossible de charger les finances/)).toBeInTheDocument();
  });
});
