import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import Purchases from './Purchases';

const list = vi.fn(); const create = vi.fn(); const remove = vi.fn();
vi.mock('@/api/purchases.api', () => ({ purchasesApi: { list: (q: unknown) => list(q), create: (b: unknown) => create(b), remove: (id: number) => remove(id) } }));
vi.mock('@/api/settings.api', () => ({ settingsApi: { get: () => Promise.resolve({ currencySymbol: '€' }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Purchases /></QueryClientProvider>);
}

describe('page Achats', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { list.mockReset(); create.mockReset(); remove.mockReset(); list.mockResolvedValue({ total: 1, page: 1, limit: 50, items: [{ id: 1, date: '2026-10-05', category: 'FILAMENT', description: 'Bobine PLA', amount: 18.9, supplier: 'Shop', comment: '', legacyId: null, createdAt: '' }] }); });

  it('liste groupée par mois avec montant formaté et filtre par catégorie', async () => {
    renderPage();
    expect(await screen.findByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Bobine PLA')).toBeInTheDocument();
    expect(screen.getByText(/18,90/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Filtre catégorie/), { target: { value: 'TOOLS' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'TOOLS', page: 1 })));
  });
  it('refuse un montant nul, puis enregistre un achat saisi avec une virgule', async () => {
    create.mockResolvedValue({ id: 2 });
    renderPage();
    await screen.findByText('Bobine PLA');
    fireEvent.change(screen.getByLabelText(/^Description$/), { target: { value: 'Buse 0.4' } });
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l'achat/ }));
    expect(await screen.findByText(/supérieur à 0/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '12,5' } });
    fireEvent.change(screen.getByLabelText(/^Catégorie$/), { target: { value: 'SPARE_PARTS' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l'achat/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ description: 'Buse 0.4', amount: 12.5, category: 'SPARE_PARTS' })));
    expect(create.mock.calls[0][0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('supprime après confirmation', async () => {
    remove.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Bobine PLA');
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
});
