import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import QuotePrint from './QuotePrint';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const get = vi.fn(); const settings = vi.fn();
vi.mock('@/api/quotes.api', () => ({ quotesApi: { get: (id: number) => get(id) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => settings() } }));

const quote = {
  id: 7, createdAt: '2026-10-01T10:00:00Z', updatedAt: '', legacyId: null, shared: false, sharedAt: null, clientResponse: null, clientRespondedAt: null, clientComment: '', responseSeenAt: null, clientEmail: '', paymentMethod: null, paidAt: null, convertedAt: null, hasImage: false, image: null, projectName: 'Boîtier <b>', customer: 'ACME & Co', kind: 'QUOTE', status: 'PENDING', dueDate: '2026-11-15', comment: 'Fragile',
  filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }], printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0, designHours: 2, packagingHours: 0.25, quantity: 2, consumables: 1.5, discountPct: 10, shippingCost: 6.5,
  settingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, contingencyPct: 10, vatPct: 20, pricingMode: 'TARGET_MARGIN', pricingPct: 30 },
  filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.53, laborPrep: 12.31, laborPost: 0, laborDesign: 60, laborPackaging: 3.08, depreciation: 2.26, maintenance: 0.11, wear: 1, fixedCosts: 1.5, subtotal: 82.77, contingency: 8.28, costAfterContingency: 91.05,
  unitPriceExclTax: 130.07, totalExclTax: 260.14, discountAmount: 26.01, vatAmount: 48.13, priceBeforeFloor: 288.76, floorApplied: false, priceBeforeRounding: 288.76, roundingAmount: 0.24, roundingApplied: true, finalPrice: 289, pricePerGram: 1.3, pricePerHour: 26,
};
function renderPage(id = '7') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/quotes/${id}/print?noprint=1`]}><Routes><Route path="/quotes/:id/print" element={<QuotePrint />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe("page d'impression", () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { get.mockReset(); settings.mockReset(); get.mockResolvedValue(quote); settings.mockResolvedValue({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: true, currencySymbol: '€' }); });

  it('reproduit les sections du devis bureau avec le détail du coût, sans mode de tarification ni marge', async () => {
    renderPage();
    expect(await screen.findByText('Devis - Boîtier <b>')).toBeInTheDocument();
    expect(screen.getByText('ACME & Co')).toBeInTheDocument();
    expect(screen.getByText('Détail du coût de revient (par pièce)')).toBeInTheDocument();
    for (const l of ['Usure pièces imprimante', "Main d'œuvre conception / modélisation", 'Majoration aléas / échec (10 %)']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.queryByText(/Main d'œuvre post-traitement/)).not.toBeInTheDocument(); // ligne nulle omise
    expect(screen.getByText('Remise (10 %)')).toBeInTheDocument();
    expect(screen.getByText('TVA (20 %)')).toBeInTheDocument();
    expect(screen.getByText('Arrondi')).toBeInTheDocument();
    expect(screen.getByTestId('print-final').textContent?.replace(/\s/g, '')).toBe('289,00€');
    expect(document.body.textContent).not.toMatch(/Marge cible|Surcoût|30 %/);
    expect(screen.getByText('Fragile')).toBeInTheDocument();
  });
  it("option désactivée : mode simplifié (main d'œuvre totale et consommables seulement)", async () => {
    settings.mockResolvedValue({ ...DEFAULT_PRICING_SETTINGS, pdfShowCostBreakdown: false, currencySymbol: '€' });
    renderPage();
    await screen.findByText('Devis - Boîtier <b>');
    expect(screen.queryByText('Détail du coût de revient (par pièce)')).not.toBeInTheDocument();
    expect(screen.queryByText('Usure pièces imprimante')).not.toBeInTheDocument();
    expect(screen.getByText("Main d'œuvre")).toBeInTheDocument();
    expect(screen.getByText('Consommables / pièces additionnelles')).toBeInTheDocument();
  });
  it("devis d'autrui ou inexistant : message, rien d'autre", async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    renderPage('99');
    expect(await screen.findByText(/n'existe pas ou ne t'appartient pas/)).toBeInTheDocument();
    expect(screen.queryByText('Tarification')).not.toBeInTheDocument();
  });
});
