import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import Quote from './Quote';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const create = vi.fn(); const get = vi.fn(); const update = vi.fn();
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ ...DEFAULT_PRICING_SETTINGS, wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0, pdfShowCostBreakdown: true }) } }));
vi.mock('@/api/materials.api', () => ({ materialsApi: { list: () => Promise.resolve([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }, { id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 }]) } }));
vi.mock('@/api/quotes.api', () => ({ quotesApi: { create: (b: unknown) => create(b), get: (id: number) => get(id), update: (id: number, b: unknown, cur: boolean) => update(id, b, cur) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage(initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[initial]}><Routes><Route path="/" element={<Quote />} /></Routes></MemoryRouter></QueryClientProvider>);
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('page Devis', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { create.mockReset(); get.mockReset(); update.mockReset(); });

  it('calcule en direct le cas doré G1 et affiche 114,31 €', async () => {
    renderPage();
    await screen.findByLabelText(/Poids \(g\)/);
    type(/Poids \(g\)/, '100'); type(/Pertes \(%\)/, '10');
    type(/Durée d'impression/, '5'); type(/Temps de préparation/, '1'); type(/Temps de post-traitement/, '0,5');
    type(/Temps de conception/, '2'); type(/Temps d'emballage/, '0,25');
    await waitFor(() => expect(screen.getByTestId('final-price').textContent?.replace(/\s/g, '')).toBe('114,31€'));
    expect(screen.getByText(/Usure pièces imprimante/).nextSibling?.textContent?.replace(/\s/g, '')).toBe('0,75€');
  });
  it('choisir une matière préremplit son prix au kg', async () => {
    renderPage();
    const sel = await screen.findByLabelText(/^Matière$/);
    fireEvent.change(sel, { target: { value: 'PETG' } });
    expect((screen.getByLabelText(/Prix \/ kg/) as HTMLInputElement).value).toBe('20');
  });
  it('n\'enregistre pas avec une quantité invalide, puis enregistre les entrées sans montants', async () => {
    create.mockResolvedValue({ id: 42 });
    renderPage();
    await screen.findByLabelText(/Quantité/);
    type(/Quantité/, '0');
    expect(screen.getByRole('button', { name: /Enregistrer dans l'historique/ })).toBeDisabled();
    expect(screen.getByText(/Corrige les champs en erreur/)).toBeInTheDocument();
    type(/Quantité/, '2'); type(/Nom du projet/, 'Boîtier'); type(/Poids \(g\)/, '50');
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer dans l'historique/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({ projectName: 'Boîtier', quantity: 2, kind: 'QUOTE', status: 'PENDING', filamentLines: [{ material: 'PLA', weightG: 50, pricePerKg: 18, wastePct: 10 }] });
    expect(body).not.toHaveProperty('finalPrice');
    expect(await screen.findByRole('button', { name: /Nouveau devis/ })).toBeInTheDocument();
  });

  const loaded = {
    id: 7, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z', legacyId: null,
    projectName: 'Ancien', customer: 'ACME', kind: 'QUOTE', status: 'PENDING', dueDate: null, comment: '',
    filamentLines: [{ material: 'PLA', weightG: 100, pricePerKg: 18, wastePct: 10 }],
    printHours: 5, printMinutes: 0, prepHours: 1, postHours: 0.5, designHours: 2, packagingHours: 0.25,
    quantity: 1, consumables: 0, discountPct: 0, shippingCost: 0,
    // Instantané d'origine : mêmes tarifs que G1 mais sans usure (les paramètres courants mockés ont usure 0,15)
    settingsSnapshot: { ...DEFAULT_PRICING_SETTINGS, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0, wearCostPerHour: 0 },
    filamentWeightG: 100, filamentCost: 1.98, printTimeH: 5, energyKwh: 2.7, electricityCost: 0.52704, laborPrep: 12.31, laborPost: 6.155, laborDesign: 60, laborPackaging: 2.5,
    depreciation: 2.264167, maintenance: 0.113208, wear: 0, fixedCosts: 0, subtotal: 85.849415, contingency: 8.584942, costAfterContingency: 94.434356, unitPriceExclTax: 113.321228, totalExclTax: 113.321228,
    discountAmount: 0, vatAmount: 0, priceBeforeFloor: 113.321228, floorApplied: false, priceBeforeRounding: 113.321228, roundingAmount: 0, roundingApplied: false, finalPrice: 113.321228, pricePerGram: 1.133212, pricePerHour: 22.664246,
  };
  it('charge un devis depuis ?quote=, calcule avec son instantané (sans usure) et met à jour via PUT', async () => {
    get.mockResolvedValue(loaded); update.mockResolvedValue({ ...loaded, customer: 'ACME 2' });
    renderPage('/?quote=7');
    expect(await screen.findByText(/enregistrés au moment de sa création/)).toBeInTheDocument();
    expect((screen.getByLabelText(/Nom du projet/) as HTMLInputElement).value).toBe('Ancien');
    // Prix avec l'instantané (usure 0) : 113,32 € et non 114,31 € (paramètres courants, usure 0,15)
    await waitFor(() => expect(screen.getByTestId('final-price').textContent?.replace(/\s/g, '')).toBe('113,32€'));
    type(/^Client$/, 'ACME 2');
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour ce devis/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ customer: 'ACME 2' }), false));
    expect(create).not.toHaveBeenCalled();
  });
  it('« Recalculer avec mes paramètres actuels » bascule le prix en direct et l\'envoi en useCurrentSettings', async () => {
    get.mockResolvedValue(loaded); update.mockResolvedValue(loaded);
    renderPage('/?quote=7');
    await screen.findByText(/enregistrés au moment de sa création/);
    fireEvent.click(screen.getByRole('switch', { name: /Recalculer avec mes paramètres actuels/ }));
    await waitFor(() => expect(screen.getByTestId('final-price').textContent?.replace(/\s/g, '')).toBe('114,31€'));
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour ce devis/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(7, expect.anything(), true));
  });

  it('?quote= invalide affiche « introuvable » au lieu d\'ouvrir un devis vierge ; une erreur serveur affiche un message distinct', async () => {
    renderPage('/?quote=abc');
    expect(await screen.findByText(/n'existe pas ou ne t'appartient pas/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nom du projet/)).not.toBeInTheDocument();
    get.mockRejectedValue({ response: { status: 500 } });
    renderPage('/?quote=9');
    expect(await screen.findByText(/Impossible de charger ce devis/)).toBeInTheDocument();
  });
});
