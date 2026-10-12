import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import { MaterialsCard } from './MaterialsCard';

const list = vi.fn(); const create = vi.fn(); const update = vi.fn(); const remove = vi.fn();
vi.mock('@/api/materials.api', () => ({ materialsApi: { list: () => list(), create: (b: unknown) => create(b), update: (id: number, b: unknown) => update(id, b), remove: (id: number) => remove(id) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MaterialsCard /></QueryClientProvider>);
}

describe('MaterialsCard', () => {
  beforeAll(async () => { await i18n.changeLanguage('fr'); });
  beforeEach(() => { list.mockReset(); create.mockReset(); update.mockReset(); remove.mockReset(); });

  it('liste, ajoute et supprime', async () => {
    list.mockResolvedValue([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }]);
    create.mockResolvedValue({ id: 2, name: 'PETG', pricePerKg: 20, sortOrder: 1 });
    remove.mockResolvedValue(undefined);
    renderCard();
    expect(await screen.findByDisplayValue('PLA')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Nom de la nouvelle matière/), { target: { value: 'PETG' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'PETG', pricePerKg: 20 }));
    fireEvent.click(screen.getAllByRole('button', { name: /Supprimer/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
  it('enregistre un prix modifié avec une virgule au blur', async () => {
    list.mockResolvedValue([{ id: 1, name: 'PLA', pricePerKg: 18, sortOrder: 0 }]);
    update.mockResolvedValue({ id: 1, name: 'PLA', pricePerKg: 19.5, sortOrder: 0 });
    renderCard();
    const price = await screen.findByDisplayValue('18');
    fireEvent.change(price, { target: { value: '19,5' } });
    fireEvent.blur(price);
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { name: 'PLA', pricePerKg: 19.5 }));
  });
  it('affiche le message de doublon renvoyé par le serveur', async () => {
    list.mockResolvedValue([]);
    create.mockRejectedValue({ response: { status: 409, data: { code: 'duplicate' } } });
    renderCard();
    await screen.findByPlaceholderText(/Nom de la nouvelle matière/);
    fireEvent.change(screen.getByPlaceholderText(/Nom de la nouvelle matière/), { target: { value: 'pla' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    expect(await screen.findByText('Cette matière existe déjà.')).toBeInTheDocument();
  });
});
