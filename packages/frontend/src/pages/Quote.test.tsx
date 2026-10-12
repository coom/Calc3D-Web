import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import Quote from './Quote';
import { DEFAULT_PRICING_SETTINGS } from '@calc3d/common';

const create = vi.fn();
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ ...DEFAULT_PRICING_SETTINGS, wearCostPerHour: 0.15, hourlyRateDesign: 30, hourlyRatePackaging: 10, floorPrice: 0, pdfShowCostBreakdown: true }) } }));
vi.mock('@/api/materials.api', () => ({ materialsApi: { list: () => Promise.resolve([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }, { id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 }]) } }));
vi.mock('@/api/quotes.api', () => ({ quotesApi: { create: (b: unknown) => create(b) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><Quote /></MemoryRouter></QueryClientProvider>);
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('page Devis', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => create.mockReset());

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
});
